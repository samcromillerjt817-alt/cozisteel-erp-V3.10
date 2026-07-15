import { db } from '@/lib/db'
import { BaseRepository } from './base.repository'

const DETAIL_INCLUDE = {
  invoice: { include: { salesOrder: { select: { id: true, number: true, clientName: true } } } },
  user: { select: { id: true, name: true } },
  receipts: { orderBy: { paidAt: 'desc' as const } },
}

class AccountReceivableRepository extends BaseRepository<typeof db.accountReceivable> {
  constructor() {
    super(db.accountReceivable)
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

  findByInvoiceId(invoiceId: string) {
    return this.delegate.findUnique({ where: { invoiceId } })
  }

  createDetailed(data: Record<string, unknown>) {
    return this.delegate.create({ data: data as any, include: DETAIL_INCLUDE })
  }

  /** Registra uma baixa (recebimento) e recalcula o status do título — numa única transação, mesmo
   * princípio de `purchaseOrderRepository.receiveItems()` (leitura+escrita consistente, sem window
   * de corrida entre o `Σ` de recebimentos já feitos e a definição do novo status). */
  async registerReceipt(accountReceivableId: string, amount: number, paidAt: Date, notes: string, userId: string) {
    return db.$transaction(async (tx) => {
      await tx.receipt.create({
        data: { accountReceivableId, amount, paidAt, notes, userId },
      })

      const [account, receipts] = await Promise.all([
        tx.accountReceivable.findUniqueOrThrow({ where: { id: accountReceivableId } }),
        tx.receipt.findMany({ where: { accountReceivableId } }),
      ])
      const totalPaid = receipts.reduce((sum, r) => sum + r.amount, 0)
      const status = totalPaid >= account.amount ? 'paid' : totalPaid > 0 ? 'partially_paid' : 'open'

      return tx.accountReceivable.update({
        where: { id: accountReceivableId },
        data: { status },
        include: DETAIL_INCLUDE,
      })
    })
  }

  updateStatus(id: string, status: string) {
    return this.delegate.update({ where: { id }, data: { status }, include: DETAIL_INCLUDE })
  }

  /** Fase 12 (Subetapa 6) — todo título ainda não quitado/cancelado, com seus recebimentos, para o
   * `FinancialReportService` somar saldo em aberto/vencido e projetar fluxo de caixa. Leitura simples,
   * sem agregação SQL — mesmo padrão já usado em `financial-account.service.ts` (soma em JS depois de
   * buscar, dataset pequeno o bastante para não justificar SQL agregado ainda). */
  findOpenWithReceipts() {
    return this.delegate.findMany({
      where: { status: { in: ['open', 'partially_paid'] } },
      include: { receipts: true },
    })
  }
}

export const accountReceivableRepository = new AccountReceivableRepository()
