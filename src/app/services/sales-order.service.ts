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
 * Transições permitidas do Pedido de Venda (ADR-002, confirmado com o usuário em 2026-07-09).
 * `* → cancelled` é bloqueado em `changeStatus` quando existir Ordem de Produção vinculada com
 * status ativo (fora de completed/cancelled) — guarda de negócio, não faz parte do mapa em si.
 */
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  open: ['in_production', 'cancelled'],
  in_production: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
}

const ACTIVE_PRODUCTION_ORDER_STATUSES_BLOCKING_CANCEL = ['completed', 'cancelled']

interface SalesOrderRecord {
  id: string
  number: string
  status: string
}

interface SalesOrderWithProductionOrders extends SalesOrderRecord {
  productionOrders: Array<{ id: string; number: string; status: string }>
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
