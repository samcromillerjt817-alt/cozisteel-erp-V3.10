import { db } from '@/lib/db'
import { purchaseOrderRepository } from '@/app/repositories/purchase-order.repository'
import { userRepository } from '@/app/repositories/user.repository'
import { numberingService } from '@/app/services/numbering.service'
import { auditService } from '@/app/services/audit.service'
import { statusHistoryService } from '@/app/services/status-history.service'
import { NotFoundException, BadRequestException } from '@/app/exceptions'
import { checkTransition } from '@/lib/status-machine'
import { domainEvents, DOMAIN_EVENTS } from '@/lib/domain-events'
import type { PedidoCompraRecebidoPayload } from '@/lib/domain-events'
import { formatDate } from '@/lib/format'
import type { UpdatePurchaseOrderDto, ReceivePurchaseOrderDto } from '@/app/dto'

export interface ListPurchaseOrdersInput {
  status?: string
  supplierId?: string
  requisitionId?: string
  search?: string
  page: number
  limit: number
}

// partially_received/received não são aceitos aqui de propósito — eles só
// resultam do endpoint dedicado de recebimento (/receive), que trabalha com
// quantidades por item em vez de um valor único de status.
const VALID_STATUSES = ['draft', 'pending_approval', 'approved', 'sent', 'confirmed', 'cancelled']

/**
 * Fase 8 (ADR-010): "approved" significa que o Pedido de Compra foi autorizado internamente — o
 * fornecedor ainda não sabe de nada. "sent" é quem representa o envio de fato ao fornecedor. Essa
 * separação é deliberada, não cosmética: aprovação é decisão interna, envio é ação externa.
 * `draft → sent` direto deixa de existir de propósito — todo Pedido de Compra passa por
 * `pending_approval → approved` antes de poder ser enviado.
 */
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  draft: ['pending_approval', 'cancelled'],
  pending_approval: ['approved', 'draft', 'cancelled'], // draft = rejeitado, volta para edição
  approved: ['sent', 'cancelled'], // sem volta — aprovado é aprovado; para mudar, cancela e a Requisição gera outro
  sent: ['confirmed', 'cancelled'],
  confirmed: ['cancelled'],
  partially_received: ['cancelled'],
  received: [],
  cancelled: [],
}

interface PurchaseOrderRecord {
  id: string
  number: string
  status: string
  receivedAt: Date | null
}

interface RequisitionItemForPurchase {
  id: string
  supplierId: string | null
  materialId: string
  quantity: number
  unit: string
  estimatedPrice: number
}

class PurchaseOrderService {
  async list({ status, supplierId, requisitionId, search, page, limit }: ListPurchaseOrdersInput) {
    const where: Record<string, unknown> = {}
    if (status) where.status = status
    if (supplierId) where.supplierId = supplierId
    if (requisitionId) where.requisitionId = requisitionId
    if (search) where.number = { contains: search }

    const { data, total } = await purchaseOrderRepository.findManyPaginated(where, (page - 1) * limit, limit)
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) }
  }

  async getById(id: string) {
    const purchaseOrder = await purchaseOrderRepository.findByIdDetailed(id) as { approvedBy: string | null } & Record<string, unknown>
    if (!purchaseOrder) throw new NotFoundException('Pedido de compra não encontrado')

    // ADR-022 (Fase UX-2, achado #14) — mesmo tratamento de `requisition.service.ts`: `approvedBy`
    // é só o id do usuário, nunca exibido em nenhuma tela até aqui.
    let approvedByName: string | null = null
    if (purchaseOrder.approvedBy) {
      const approver = await userRepository.findById(purchaseOrder.approvedBy) as { name: string } | null
      approvedByName = approver?.name ?? null
    }

    return { ...purchaseOrder, approvedByName }
  }

  /** Only draft purchase orders can be edited — items/prices come from the requisition's winning quotes and are not editable here. */
  async update(id: string, data: UpdatePurchaseOrderDto, userId: string) {
    const target = (await purchaseOrderRepository.findById(id)) as PurchaseOrderRecord | null
    if (!target) throw new NotFoundException('Pedido de compra não encontrado')
    if (target.status !== 'draft') {
      throw new BadRequestException('Apenas pedidos de compra em rascunho podem ser editados')
    }

    const updateData: Record<string, unknown> = {}
    if (data.expectedDate !== undefined) updateData.expectedDate = data.expectedDate
    if (data.paymentTerms !== undefined) updateData.paymentTerms = data.paymentTerms
    if (data.notes !== undefined) updateData.notes = data.notes

    const updated = await purchaseOrderRepository.updateFields(id, updateData)

    await auditService.log({
      userId,
      action: 'UPDATE',
      module: 'compras',
      entityId: id,
      entityName: target.number,
      details: `Pedido de compra ${target.number} atualizado`,
    })

    return updated
  }

  async delete(id: string, userId: string) {
    const purchaseOrder = (await purchaseOrderRepository.findById(id)) as PurchaseOrderRecord | null
    if (!purchaseOrder) throw new NotFoundException('Pedido de compra não encontrado')
    if (!['draft', 'cancelled'].includes(purchaseOrder.status)) {
      throw new BadRequestException('Apenas pedidos de compra em rascunho ou cancelados podem ser excluídos')
    }

    await purchaseOrderRepository.delete(id)

    await auditService.log({
      userId,
      action: 'DELETE',
      module: 'compras',
      entityId: id,
      entityName: purchaseOrder.number,
      details: `Pedido de compra ${purchaseOrder.number} excluído`,
    })

    return { success: true }
  }

  async changeStatus(id: string, status: string, userId: string) {
    if (['partially_received', 'received'].includes(status)) {
      throw new BadRequestException('Use o endpoint de recebimento para dar entrada de mercadoria')
    }

    const purchaseOrder = (await purchaseOrderRepository.findById(id)) as PurchaseOrderRecord | null
    if (!purchaseOrder) throw new NotFoundException('Pedido de compra não encontrado')

    const transitionError = checkTransition(purchaseOrder.status, status, ALLOWED_TRANSITIONS, VALID_STATUSES)
    if (transitionError) throw new BadRequestException(transitionError)

    const updateData: Record<string, unknown> = { status }
    if (status === 'approved') {
      updateData.approvedBy = userId
      updateData.approvedAt = new Date()
    }
    if (status === 'sent') updateData.sentAt = new Date()
    if (status === 'confirmed') updateData.confirmedAt = new Date()
    if (status === 'cancelled') updateData.cancelledAt = new Date()

    const updated = await purchaseOrderRepository.updateStatus(id, updateData)

    await statusHistoryService.record('purchase_order', id, purchaseOrder.status, status, userId)

    await auditService.log({
      userId,
      action: 'PATCH',
      module: 'compras',
      entityId: id,
      entityName: purchaseOrder.number,
      details: `Status do pedido de compra ${purchaseOrder.number} alterado de "${purchaseOrder.status}" para "${status}"`,
      beforeValue: { status: purchaseOrder.status },
      afterValue: { status },
    })

    return updated
  }

  async receive(id: string, data: ReceivePurchaseOrderDto, userId: string) {
    const purchaseOrder = (await purchaseOrderRepository.findByIdWithItems(id)) as
      | (PurchaseOrderRecord & {
          supplierId: string | null
          items: Array<{ id: string; materialId: string; quantity: number; quantityReceived: number; unitPrice: number; material: { lotControlled: boolean } }>
        })
      | null
    if (!purchaseOrder) throw new NotFoundException('Pedido de compra não encontrado')
    if (!['confirmed', 'partially_received'].includes(purchaseOrder.status)) {
      throw new BadRequestException('Apenas pedidos de compra confirmados ou parcialmente recebidos podem receber mercadoria')
    }

    const itemsById = new Map(purchaseOrder.items.map((i) => [i.id, i]))
    for (const entry of data.items) {
      const item = itemsById.get(entry.purchaseOrderItemId)
      if (!item) throw new BadRequestException(`Item ${entry.purchaseOrderItemId} não pertence a este pedido de compra`)
      const outstanding = item.quantity - item.quantityReceived
      if (entry.quantityReceived > outstanding) {
        throw new BadRequestException(`Quantidade recebida excede a quantidade em aberto do item (${outstanding} restante)`)
      }
    }

    // Resolve o número de lote de fallback FORA da transação (Service chama Service — a mesma
    // disciplina já usada em ProductionOrderService.produce()/ReservationReconciliationService,
    // ADR-012): só materiais lotControlled precisam de um número, e só quando o próprio fornecedor
    // não informou um (Fase 10, ADR-013).
    const resolvedEntries = []
    for (const entry of data.items) {
      const item = itemsById.get(entry.purchaseOrderItemId)!
      let batchNumber = entry.batchNumber
      if (item.material.lotControlled && !batchNumber) {
        batchNumber = await numberingService.getNextNumber('lote_material')
      }
      resolvedEntries.push({ ...entry, batchNumber })
    }

    const { updated, newStatus } = await purchaseOrderRepository.receiveItems(purchaseOrder, itemsById, resolvedEntries, userId)

    await auditService.log({
      userId,
      action: 'UPDATE',
      module: 'compras',
      entityId: id,
      entityName: purchaseOrder.number,
      details: `Recebimento registrado no pedido de compra ${purchaseOrder.number} (${data.items.length} item(ns)) — status: "${newStatus}"`,
    })

    // Emitido depois que a transação já foi commitada — notificação de um fato que já
    // aconteceu, sem consumidor nesta fase (ADR-003). A entrada de estoque em si continua
    // na transação atômica existente, não se move para dentro de um handler de evento.
    await domainEvents.publish<PedidoCompraRecebidoPayload, void>(DOMAIN_EVENTS.PEDIDO_COMPRA_RECEBIDO, {
      purchaseOrderId: id,
      purchaseOrderNumber: purchaseOrder.number,
      supplierId: purchaseOrder.supplierId,
      userId,
    })

    return updated
  }

  /**
   * ADR-023 (Decisão #1, Estorno) — reverte UM lançamento de recebimento (não o pedido inteiro).
   * Recusa nesta rodada quando o lote já foi consumido por uma produção — sem estorno em cascata
   * (decisão explícita do usuário: casos assim exigem uma correção administrativa especializada
   * futura, não um estorno comum). Ao recusar, a mensagem já nomeia o lote, as OPs que o consumiram
   * e os produtos gerados, para quem for analisar o caso não precisar investigar do zero.
   */
  async reverseReceipt(movementId: string, reason: string, userId: string) {
    const movement = await db.stockMovement.findUnique({ where: { id: movementId } })
    if (!movement) throw new NotFoundException('Movimentação de estoque não encontrada')
    if (movement.itemType !== 'material' || movement.type !== 'IN' || movement.referenceType !== 'purchase_order') {
      throw new BadRequestException('Esta movimentação não é um recebimento de compra e não pode ser estornada por aqui')
    }
    if (movement.reversedAt) throw new BadRequestException('Este recebimento já foi estornado')
    if (movement.reversalOfId) throw new BadRequestException('Não é possível estornar um estorno')

    const purchaseOrder = (await purchaseOrderRepository.findById(movement.referenceId)) as { id: string; number: string } | null
    if (!purchaseOrder) throw new NotFoundException('Pedido de compra não encontrado')

    let purchaseOrderItemId: string
    if (movement.materialBatchId) {
      const batch = await db.materialBatch.findUnique({ where: { id: movement.materialBatchId } })
      if (!batch?.purchaseOrderItemId) {
        throw new BadRequestException('Não é possível identificar automaticamente o item deste recebimento — contate um administrador')
      }
      purchaseOrderItemId = batch.purchaseOrderItemId

      // Bloqueio central desta decisão: o saldo disponível do lote caiu abaixo do que este
      // recebimento contribuiu, ou seja, produção já consumiu parte ou todo o lote.
      if (batch.quantityAvailable < movement.quantity - 1e-9) {
        const consumptions = await db.batchConsumption.findMany({
          where: { materialBatchId: batch.id },
          include: { productBatch: { include: { productionOrder: { select: { number: true } }, product: { select: { name: true } } } } },
        })
        const opNumbers = [...new Set(consumptions.map((c) => c.productBatch.productionOrder.number))]
        const productNames = [...new Set(consumptions.map((c) => c.productBatch.product.name))]
        throw new BadRequestException(
          `Não é possível estornar: o lote ${batch.batchNumber || batch.id} já foi consumido` +
          (opNumbers.length ? ` na(s) Ordem(ns) de Produção ${opNumbers.join(', ')}` : '') +
          (productNames.length ? `, gerando ${productNames.join(', ')}` : '') +
          '. Para reverter esse caso, é necessária uma correção administrativa especializada (Central de Administração), não um estorno comum.'
        )
      }
    } else {
      const candidates = await db.purchaseOrderItem.findMany({
        where: { purchaseOrderId: purchaseOrder.id, materialId: movement.materialId },
      })
      if (candidates.length !== 1) {
        throw new BadRequestException('Não é possível identificar automaticamente o item deste recebimento — contate um administrador')
      }
      purchaseOrderItemId = candidates[0].id
    }

    const { updatedPurchaseOrder, reversalMovement } = await purchaseOrderRepository.reverseReceipt(
      { id: movement.id, materialId: movement.materialId!, quantity: movement.quantity, materialBatchId: movement.materialBatchId },
      purchaseOrder,
      purchaseOrderItemId,
      reason,
      userId
    )

    await auditService.log({
      userId,
      action: 'PATCH',
      module: 'compras',
      entityId: purchaseOrder.id,
      entityName: purchaseOrder.number,
      details: `Estorno de recebimento no pedido de compra ${purchaseOrder.number} (${movement.quantity} un.)${reason ? ` — motivo: ${reason}` : ''}`,
      beforeValue: { movementId: movement.id, quantity: movement.quantity },
      afterValue: { reversalMovementId: reversalMovement.id },
    })

    return updatedPurchaseOrder
  }

  /**
   * Ao avançar a Requisição para "ordered", gera um Pedido de Compra formal por
   * fornecedor vencedor, agrupando os itens cuja cotação vencedora aponta pro mesmo
   * fornecedor. Chamada pelo RequisitionService (Service-a-Service).
   */
  async createFromRequisition(requisitionId: string, requisitionNumber: string, items: RequisitionItemForPurchase[], userId: string) {
    const bySupplier = new Map<string, RequisitionItemForPurchase[]>()
    for (const item of items) {
      if (!item.supplierId) continue
      const list = bySupplier.get(item.supplierId) || []
      list.push(item)
      bySupplier.set(item.supplierId, list)
    }

    const created = []
    for (const [supplierId, supplierItems] of bySupplier) {
      const number = await numberingService.getNextNumber('compra')
      const subtotal = supplierItems.reduce((sum, i) => sum + i.estimatedPrice * i.quantity, 0)
      const order = await purchaseOrderRepository.createFromRequisition({
        number,
        status: 'draft',
        supplierId,
        requisitionId,
        date: formatDate(new Date()),
        subtotal,
        total: subtotal,
        userId,
        items: {
          create: supplierItems.map((item) => ({
            requisitionItemId: item.id,
            materialId: item.materialId,
            quantity: item.quantity,
            unit: item.unit,
            unitPrice: item.estimatedPrice,
            total: item.estimatedPrice * item.quantity,
          })),
        },
      })
      created.push(order)
    }
    return created
  }
}

export const purchaseOrderService = new PurchaseOrderService()
