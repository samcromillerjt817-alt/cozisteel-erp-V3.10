import { db } from '@/lib/db'
import { BaseRepository } from './base.repository'

const DETAIL_INCLUDE = {
  salesOrder: { select: { id: true, number: true, clientName: true } },
  user: { select: { id: true, name: true } },
  accountReceivable: true,
  items: { include: { salesOrderItem: { select: { id: true, description: true, code: true } } } },
}

class InvoiceRepository extends BaseRepository<typeof db.invoice> {
  constructor() {
    super(db.invoice)
  }

  findManyPaginated(where: Record<string, unknown>, skip: number, take: number) {
    return Promise.all([
      this.delegate.findMany({ where, include: DETAIL_INCLUDE, orderBy: { createdAt: 'desc' }, skip, take }),
      this.delegate.count({ where }),
    ]).then(([data, total]) => ({ data, total }))
  }

  findByIdDetailed(id: string) {
    return this.delegate.findUnique({ where: { id }, include: DETAIL_INCLUDE })
  }

  // ADR-023 (Decisão #2) — lista de faturas de UM pedido, para a tela de faturamento mostrar o
  // histórico e o vínculo Pedido → Fatura → Conta a Receber.
  findManyBySalesOrder(salesOrderId: string) {
    return this.delegate.findMany({
      where: { salesOrderId },
      include: DETAIL_INCLUDE,
      orderBy: { createdAt: 'desc' },
    })
  }

  createDetailed(data: Record<string, unknown>) {
    return this.delegate.create({ data: data as any, include: DETAIL_INCLUDE })
  }
}

export const invoiceRepository = new InvoiceRepository()
