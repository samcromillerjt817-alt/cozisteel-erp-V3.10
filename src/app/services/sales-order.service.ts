import { salesOrderRepository } from '@/app/repositories/sales-order.repository'
import { numberingService } from '@/app/services/numbering.service'
import { auditService } from '@/app/services/audit.service'
import { statusHistoryService } from '@/app/services/status-history.service'
import { NotFoundException, BadRequestException } from '@/app/exceptions'
import { checkTransition } from '@/lib/status-machine'
import { formatDate } from '@/lib/format'

export interface ListSalesOrdersInput {
  status?: string
  search?: string
  page: number
  limit: number
}

/**
 * Transições permitidas do Pedido de Venda (ADR-002, confirmado com o usuário em 2026-07-09;
 * atualizado pelo ADR-023, item 6, Decisão #3). `in_production → completed` direto foi REMOVIDO de
 * propósito: "completed" agora significa 100% expedido, nunca mais um clique manual de "produção
 * terminou" — quem chega lá é `recalculateFulfillment()`, chamado só a partir de uma Expedição real
 * (`shipmentService.changeStatus`). `partially_fulfilled` pelo mesmo motivo não aparece como alvo de
 * nenhuma transição aqui — só o estado FROM (pode cancelar a partir dele), nunca um destino manual.
 * `* → cancelled` é bloqueado em `changeStatus` quando existir Ordem de Produção OU Expedição
 * vinculada com status ativo — guarda de negócio, não faz parte do mapa em si.
 */
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  open: ['in_production', 'cancelled'],
  in_production: ['ready_for_shipping', 'cancelled'],
  ready_for_shipping: ['cancelled'],
  partially_fulfilled: ['cancelled'],
  completed: [],
  cancelled: [],
}

const ACTIVE_PRODUCTION_ORDER_STATUSES_BLOCKING_CANCEL = ['completed', 'cancelled']
const ACTIVE_SHIPMENT_STATUSES_BLOCKING_CANCEL = ['cancelled']

interface SalesOrderRecord {
  id: string
  number: string
  status: string
}

interface SalesOrderWithProductionOrders extends SalesOrderRecord {
  productionOrders: Array<{ id: string; number: string; status: string }>
  shipments: Array<{ id: string; number: string; status: string }>
}

interface QuoteForConversion {
  id: string
  clientId: string | null
  clientName: string
  clientCnpj: string
  subtotal: number
  discountTotal: number
  total: number
  paymentTerms: string
  deliveryTime: string
  notes: string
  items: Array<{
    productId: string | null
    code: string
    description: string
    quantity: number
    unit: string
    unitPrice: number
    total: number
    order: number
  }>
}

class SalesOrderService {
  async list({ status, search, page, limit }: ListSalesOrdersInput) {
    const where: Record<string, unknown> = {}
    if (status) where.status = status
    if (search) {
      where.OR = [
        { number: { contains: search } },
        { clientName: { contains: search } },
      ]
    }
    const { data, total } = await salesOrderRepository.findManyPaginated(where, (page - 1) * limit, limit)
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) }
  }

  async getById(id: string) {
    const salesOrder = await salesOrderRepository.findByIdDetailed(id)
    if (!salesOrder) throw new NotFoundException('Pedido de venda não encontrado')
    return salesOrder
  }

  async changeStatus(id: string, status: string, userId: string) {
    const salesOrder = (await salesOrderRepository.findByIdWithProductionOrders(id)) as SalesOrderWithProductionOrders | null
    if (!salesOrder) throw new NotFoundException('Pedido de venda não encontrado')

    const transitionError = checkTransition(salesOrder.status, status, ALLOWED_TRANSITIONS)
    if (transitionError) throw new BadRequestException(transitionError)

    if (status === 'cancelled') {
      const activeOrders = salesOrder.productionOrders.filter(
        (po) => !ACTIVE_PRODUCTION_ORDER_STATUSES_BLOCKING_CANCEL.includes(po.status)
      )
      if (activeOrders.length > 0) {
        throw new BadRequestException(
          `Não é possível cancelar: existe(m) Ordem(ns) de Produção ativa(s) vinculada(s) (${activeOrders.map((po) => po.number).join(', ')}) — cancele ou conclua-as primeiro`
        )
      }
      const activeShipments = salesOrder.shipments.filter(
        (sh) => !ACTIVE_SHIPMENT_STATUSES_BLOCKING_CANCEL.includes(sh.status)
      )
      if (activeShipments.length > 0) {
        throw new BadRequestException(
          `Não é possível cancelar: existe(m) Expedição(ões) ativa(s) vinculada(s) (${activeShipments.map((sh) => sh.number).join(', ')}) — cancele-as primeiro`
        )
      }
    }

    const updated = await salesOrderRepository.updateStatus(id, status)

    await statusHistoryService.record('sales_order', id, salesOrder.status, status, userId)

    await auditService.log({
      userId,
      action: 'PATCH',
      module: 'orcamentos',
      entityId: id,
      entityName: salesOrder.number,
      details: `Status do pedido de venda ${salesOrder.number} alterado de "${salesOrder.status}" para "${status}"`,
      beforeValue: { status: salesOrder.status },
      afterValue: { status },
    })

    return updated
  }

  /**
   * ADR-023 (item 6, Decisão #3) — SÓ chamado por `shipmentService.changeStatus()` quando uma
   * Expedição atinge `shipped`. Nunca é uma transição escolhida pelo usuário: as quantidades
   * somadas de todas as Shipments não canceladas decidem sozinhas se o Pedido está parcial ou
   * totalmente atendido, exatamente como a decisão exige. Não faz nada se o Pedido não estiver em
   * `ready_for_shipping`/`partially_fulfilled` (ainda em `open`/`in_production` — não deveria
   * acontecer, já que `shipmentService.create()` já bloqueia expedir fora dessas duas fases — ou já
   * `cancelled`/`completed`, onde recalcular não faz sentido).
   */
  async recalculateFulfillment(salesOrderId: string, userId: string) {
    const salesOrder = (await salesOrderRepository.findByIdWithShippableItems(salesOrderId)) as {
      id: string
      status: string
      items: Array<{ quantity: number; shipmentItems: { quantity: number }[] }>
    } | null
    if (!salesOrder) throw new NotFoundException('Pedido de venda não encontrado')
    if (!['ready_for_shipping', 'partially_fulfilled'].includes(salesOrder.status)) return salesOrder

    const totals = salesOrder.items.map((item) => {
      const shipped = item.shipmentItems.reduce((sum, i) => sum + i.quantity, 0)
      return { shipped, remaining: Math.max(0, item.quantity - shipped) }
    })
    const allFulfilled = totals.every((t) => t.remaining <= 1e-9)
    const anyShipped = totals.some((t) => t.shipped > 1e-9)

    const newStatus = allFulfilled ? 'completed' : anyShipped ? 'partially_fulfilled' : salesOrder.status
    if (newStatus === salesOrder.status) return salesOrder

    const updated = await salesOrderRepository.updateStatus(salesOrderId, newStatus)
    await statusHistoryService.record('sales_order', salesOrderId, salesOrder.status, newStatus, userId)
    return updated
  }

  /**
   * Cria o Pedido de Venda a partir de um Orçamento já validado como elegível
   * (status aprovado, sem conversão prévia) pelo QuoteService — chamada Service-a-Service,
   * mantendo o ponto de integração pronto para virar evento de domínio na Fase 3.
   */
  async createFromQuote(quote: QuoteForConversion, userId: string) {
    const number = await numberingService.getNextNumber('pedido')

    return salesOrderRepository.createWithItems({
      number,
      status: 'open',
      date: formatDate(new Date()),
      quoteId: quote.id,
      clientId: quote.clientId,
      clientName: quote.clientName,
      clientCnpj: quote.clientCnpj,
      subtotal: quote.subtotal,
      discountTotal: quote.discountTotal,
      total: quote.total,
      paymentTerms: quote.paymentTerms,
      deliveryTime: quote.deliveryTime,
      notes: quote.notes,
      userId,
      items: {
        create: quote.items.map((item) => ({
          productId: item.productId || null,
          code: item.code,
          description: item.description,
          quantity: item.quantity,
          unit: item.unit,
          unitPrice: item.unitPrice,
          total: item.total,
          order: item.order,
        })),
      },
    })
  }
}

export const salesOrderService = new SalesOrderService()
