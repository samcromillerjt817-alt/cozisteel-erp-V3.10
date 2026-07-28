import { db } from '@/lib/db'
import { BaseRepository } from './base.repository'

const LIST_INCLUDE = {
  items: true,
  quote: { select: { id: true, number: true } },
  client: { select: { id: true, corporateName: true } },
  user: { select: { id: true, name: true } },
  productionOrders: { select: { id: true, number: true, status: true } },
}
const DETAIL_INCLUDE = {
  items: { include: { product: { select: { id: true, name: true, internalCode: true } } } },
  quote: { select: { id: true, number: true, status: true } },
  client: true,
  user: { select: { id: true, name: true } },
  productionOrders: { select: { id: true, number: true, status: true, productName: true, quantity: true } },
}
const MUTATION_INCLUDE = {
  items: true,
  quote: { select: { id: true, number: true } },
}

class SalesOrderRepository extends BaseRepository<typeof db.salesOrder> {
  constructor() {
    super(db.salesOrder)
  }

  async findManyPaginated(where: Record<string, unknown>, skip: number, take: number) {
    const [data, total] = await Promise.all([
      this.delegate.findMany({ where, include: LIST_INCLUDE, orderBy: { createdAt: 'desc' }, skip, take }),
      this.delegate.count({ where }),
    ])
    return { data, total }
  }

  findByIdDetailed(id: string) {
    return this.delegate.findUnique({ where: { id }, include: DETAIL_INCLUDE })
  }

  findByIdWithProductionOrders(id: string) {
    return this.delegate.findUnique({
      where: { id },
      include: {
        productionOrders: { select: { id: true, number: true, status: true } },
        // ADR-023 (item 6) — mesma guarda de cancelamento já aplicada a Ordem de Produção, agora
        // também considera Expedição ativa vinculada.
        shipments: { select: { id: true, number: true, status: true } },
      },
    })
  }

  // ADR-023 (Decisão #2, Faturamento) — saldo faturável por item: soma só as `InvoiceItem` de faturas
  // NÃO canceladas, para "quantidade já faturada" nunca contar uma fatura cancelada.
  findByIdWithInvoiceableItems(id: string) {
    return this.delegate.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            invoiceItems: { where: { invoice: { status: { not: 'cancelled' } } }, select: { quantity: true } },
          },
        },
      },
    })
  }

  // ADR-023 (item 6, Decisão #3, Expedição) — mesmo padrão de findByIdWithInvoiceableItems: só conta
  // `ShipmentItem` de Shipments NÃO canceladas, pra "quantidade já expedida" nunca contar uma
  // expedição cancelada.
  findByIdWithShippableItems(id: string) {
    return this.delegate.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            shipmentItems: { where: { shipment: { status: { not: 'cancelled' } } }, select: { quantity: true } },
          },
        },
      },
    })
  }

  // Usado pela guarda de cancelamento (bloqueia cancelar um Pedido com expedição ativa) e por
  // `recalculateFulfillment` (decide partially_fulfilled vs completed a partir do que já saiu).
  findByIdWithShipments(id: string) {
    return this.delegate.findUnique({
      where: { id },
      include: { shipments: { select: { id: true, number: true, status: true } } },
    })
  }

  createWithItems(data: Record<string, unknown>) {
     
    return this.delegate.create({ data: data as any, include: MUTATION_INCLUDE })
  }

  updateStatus(id: string, status: string) {
    return this.delegate.update({ where: { id }, data: { status } })
  }
}

export const salesOrderRepository = new SalesOrderRepository()
