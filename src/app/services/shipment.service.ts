import { db } from '@/lib/db'
import { shipmentRepository } from '@/app/repositories/shipment.repository'
import { salesOrderRepository } from '@/app/repositories/sales-order.repository'
import { salesOrderService } from '@/app/services/sales-order.service'
import { numberingService } from '@/app/services/numbering.service'
import { auditService } from '@/app/services/audit.service'
import { statusHistoryService } from '@/app/services/status-history.service'
import { NotFoundException, BadRequestException } from '@/app/exceptions'
import { checkTransition } from '@/lib/status-machine'
import type { CreateShipmentDto, UpdateShipmentDto } from '@/app/dto'

interface ShippableItem {
  id: string
  description: string
  code: string
  unit: string
  quantity: number
  shipmentItems: { quantity: number }[]
}

interface SalesOrderForShipping {
  id: string
  number: string
  status: string
}

interface ShipmentRecord {
  id: string
  number: string
  status: string
  salesOrderId: string
}

const EPSILON = 1e-9

/**
 * Transições da Expedição (ADR-023, item 6, Decisão #3) — máquina de estados PRÓPRIA, nunca
 * misturada com a do Pedido de Venda. `shipped` é o ponto em que a quantidade passa a contar como
 * "atendida" (`recalculateFulfillment` do Pedido é chamado exatamente aqui) — depois disso não há
 * mais cancelamento: a mercadoria já saiu de fato.
 */
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  draft: ['picking', 'cancelled'],
  picking: ['ready', 'cancelled'],
  ready: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
}

/** Só pode alterar campos/itens enquanto a expedição ainda não saiu de fato. */
const EDITABLE_STATUSES = ['draft', 'picking']

/**
 * Fase 6 (ADR-023, item 6) — Expedição. Entidade própria, 1:N com o Pedido de Venda (várias
 * expedições reais por pedido, não um placeholder). Mesmo padrão de saldo/idempotência já validado
 * em `invoice.service.ts` (Decisão #2): checagem de saldo e criação na MESMA transação.
 */
class ShipmentService {
  /** Saldo expedível por item — usado tanto para pré-selecionar a tela quanto para validar antes de criar. */
  async getShippableBalance(salesOrderId: string) {
    const salesOrder = (await salesOrderRepository.findByIdWithShippableItems(salesOrderId)) as {
      id: string
      items: ShippableItem[]
    } | null
    if (!salesOrder) throw new NotFoundException('Pedido de venda não encontrado')

    return salesOrder.items.map((item) => {
      const shipped = item.shipmentItems.reduce((sum, i) => sum + i.quantity, 0)
      return {
        salesOrderItemId: item.id,
        description: item.description || item.code,
        unit: item.unit,
        quantityOrdered: item.quantity,
        quantityShipped: shipped,
        quantityRemaining: Math.max(0, item.quantity - shipped),
      }
    })
  }

  async list(salesOrderId: string) {
    return shipmentRepository.findManyBySalesOrder(salesOrderId)
  }

  async getById(id: string) {
    const shipment = await shipmentRepository.findByIdDetailed(id)
    if (!shipment) throw new NotFoundException('Expedição não encontrada')
    return shipment
  }

  async create(salesOrderId: string, data: CreateShipmentDto, userId: string) {
    const salesOrder = (await salesOrderRepository.findById(salesOrderId)) as SalesOrderForShipping | null
    if (!salesOrder) throw new NotFoundException('Pedido de venda não encontrado')
    if (!['ready_for_shipping', 'partially_fulfilled'].includes(salesOrder.status)) {
      throw new BadRequestException('Só é possível criar uma expedição quando o pedido está "Pronto para expedição" ou "Atendimento parcial"')
    }

    const number = await numberingService.getNextNumber('expedicao')

    // Checagem de saldo e criação na MESMA transação — mesma disciplina de idempotência do
    // Faturamento (ADR-023, Decisão #2): clique duplo nunca consegue expedir além do saldo real.
    const shipment = await db.$transaction(async (tx) => {
      const lineItems: { salesOrderItemId: string; quantity: number }[] = []

      for (const { salesOrderItemId, quantity } of data.items) {
        const soItem = await tx.salesOrderItem.findUnique({
          where: { id: salesOrderItemId },
          include: {
            shipmentItems: { where: { shipment: { status: { not: 'cancelled' } } }, select: { quantity: true } },
          },
        })
        if (!soItem || soItem.salesOrderId !== salesOrderId) {
          throw new BadRequestException('Item não pertence a este pedido de venda')
        }
        const alreadyShipped = soItem.shipmentItems.reduce((sum, i) => sum + i.quantity, 0)
        const remaining = soItem.quantity - alreadyShipped
        if (quantity > remaining + EPSILON) {
          throw new BadRequestException(
            `Item "${soItem.description || soItem.code}": quantidade a expedir (${quantity}) excede o saldo restante (${remaining})`
          )
        }
        lineItems.push({ salesOrderItemId, quantity })
      }

      return tx.shipment.create({
        data: {
          number,
          salesOrderId,
          status: 'draft',
          carrier: data.carrier,
          vehiclePlate: data.vehiclePlate,
          driverName: data.driverName,
          scheduledDate: data.scheduledDate ? new Date(data.scheduledDate) : null,
          notes: data.notes,
          userId,
          items: { create: lineItems },
        },
        include: {
          salesOrder: { select: { id: true, number: true, clientName: true, status: true } },
          user: { select: { id: true, name: true } },
          items: { include: { salesOrderItem: { select: { id: true, description: true, code: true, unit: true } } } },
        },
      })
    })

    await auditService.log({
      userId,
      action: 'CREATE',
      module: 'orcamentos',
      entityId: shipment.id,
      entityName: shipment.number,
      details: `Expedição ${shipment.number} criada para o pedido de venda ${salesOrder.number} (${shipment.items.length} ${shipment.items.length === 1 ? 'item' : 'itens'})`,
    })

    return shipment
  }

  async update(id: string, data: UpdateShipmentDto) {
    const shipment = (await shipmentRepository.findById(id)) as ShipmentRecord | null
    if (!shipment) throw new NotFoundException('Expedição não encontrada')
    if (!EDITABLE_STATUSES.includes(shipment.status)) {
      throw new BadRequestException('Só é possível editar uma expedição em rascunho ou em separação')
    }

    return shipmentRepository.updateDetailed(id, {
      carrier: data.carrier,
      vehiclePlate: data.vehiclePlate,
      driverName: data.driverName,
      scheduledDate: data.scheduledDate ? new Date(data.scheduledDate) : null,
      proofDocument: data.proofDocument,
      notes: data.notes,
    })
  }

  /**
   * `shipped` é o único ponto que dispara `recalculateFulfillment()` no Pedido de Venda — é quando a
   * mercadoria fisicamente sai, o momento que a Decisão #3 define como "atendida". `delivered` é só
   * confirmação de chegada, não muda o cálculo de atendimento (o Pedido já contava como atendido
   * desde o embarque).
   */
  async changeStatus(id: string, status: string, userId: string) {
    const shipment = (await shipmentRepository.findById(id)) as ShipmentRecord | null
    if (!shipment) throw new NotFoundException('Expedição não encontrada')

    const transitionError = checkTransition(shipment.status, status, ALLOWED_TRANSITIONS)
    if (transitionError) throw new BadRequestException(transitionError)

    const updateData: Record<string, unknown> = { status }
    if (status === 'shipped') updateData.shippedAt = new Date()
    if (status === 'delivered') updateData.deliveredAt = new Date()

    const updated = await shipmentRepository.updateDetailed(id, updateData)

    await statusHistoryService.record('shipment', id, shipment.status, status, userId)

    await auditService.log({
      userId,
      action: 'PATCH',
      module: 'orcamentos',
      entityId: id,
      entityName: shipment.number,
      details: `Status da expedição ${shipment.number} alterado de "${shipment.status}" para "${status}"`,
      beforeValue: { status: shipment.status },
      afterValue: { status },
    })

    if (status === 'shipped') {
      await salesOrderService.recalculateFulfillment(shipment.salesOrderId, userId)
    }

    return updated
  }
}

export const shipmentService = new ShipmentService()
