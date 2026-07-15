import { db } from '@/lib/db'
import { BaseRepository } from './base.repository'

const DETAIL_INCLUDE = {
  purchaseOrder: { select: { id: true, number: true, supplier: { select: { id: true, corporateName: true, tradeName: true } } } },
  user: { select: { id: true, name: true } },
  payments: { orderBy: { paidAt: 'desc' as const } },
}

class AccountPayableRepository extends BaseRepository<typeof db.accountPayable> {
  constructor() {
    super(db.accountPayable)
  }

  findManyPaginated(where: Record<string, unknown>, skip: number, take: number) {
    return Promise.all([
      this.delegate.findMany({ where, include: DETAIL_INCLUDE, orderBy: { dueDate: 'asc' }, skip, take }),
      this.delegate.count({ where }),
    ]).then(([data, total]) => ({ data, total }))
  }

  findByIdDetailed(id: string) {
    return this.delegate.findUnique({ where: { id }, include: DETAIL_INCLUDE })
  }

  findByPurchaseOrderId(purchaseOrderId: string) {
    return this.delegate.findUnique({ where: { purchaseOrderId } })
  }

  createFromPurchaseOrder(data: { number: string; purchaseOrderId: string; amount: number; dueDate: Date; userId: string }) {
    return this.delegate.create({ data: { ...data, status: 'open' }, include: DETAIL_INCLUDE })
  }

  /** Recalcula `amount` do zero (Σ dos itens recebidos até agora) e reavalia `status` contra
   * pagamentos já registrados — chamado a cada recebimento parcial adicional sobre um título que já
   * existe (a criação do primeiro título é `createFromPurchaseOrder`, decidida pelo Service). */
  async updateAmountFromPurchaseOrder(id: string, amount: number) {
    return db.$transaction(async (tx) => {
      const existing = await tx.accountPayable.findUniqueOrThrow({ where: { id } })
      if (existing.status === 'cancelled') return tx.accountPayable.findUniqueOrThrow({ where: { id }, include: DETAIL_INCLUDE })

      const payments = await tx.payment.findMany({ where: { accountPayableId: id } })
      const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0)
      const status = totalPaid >= amount ? 'paid' : totalPaid > 0 ? 'partially_paid' : 'open'

      return tx.accountPayable.update({ where: { id }, data: { amount, status }, include: DETAIL_INCLUDE })
    })
  }

  /** Registra um pagamento e recalcula o status do título — leitura+escrita numa única transação,
   * mesmo princípio de `purchaseOrderRepository.receiveItems()` (sem window de corrida entre o `Σ`
   * de pagamentos já feitos e a definição do novo status). */
  async registerPayment(accountPayableId: string, amount: number, paidAt: Date, notes: string, userId: string) {
    return db.$transaction(async (tx) => {
      await tx.payment.create({ data: { accountPayableId, amount, paidAt, notes, userId } })

      const [account, payments] = await Promise.all([
        tx.accountPayable.findUniqueOrThrow({ where: { id: accountPayableId } }),
        tx.payment.findMany({ where: { accountPayableId } }),
      ])
      const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0)
      const status = totalPaid >= account.amount ? 'paid' : totalPaid > 0 ? 'partially_paid' : 'open'

      return tx.accountPayable.update({ where: { id: accountPayableId }, data: { status }, include: DETAIL_INCLUDE })
    })
  }

  updateStatus(id: string, status: string) {
    return this.delegate.update({ where: { id }, data: { status }, include: DETAIL_INCLUDE })
  }

  /** Fase 12 (Subetapa 6) — mesmo propósito de `AccountReceivableRepository.findOpenWithReceipts()`,
   * lado Contas a Pagar. */
  findOpenWithPayments() {
    return this.delegate.findMany({
      where: { status: { in: ['open', 'partially_paid'] } },
      include: { payments: true },
    })
  }
}

export const accountPayableRepository = new AccountPayableRepository()
