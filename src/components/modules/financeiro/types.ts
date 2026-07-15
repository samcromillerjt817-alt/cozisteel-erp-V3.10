export const FINANCEIRO_STATUS_LABELS: Record<string, string> = {
  open: 'Em aberto',
  partially_paid: 'Parcialmente pago',
  paid: 'Pago',
  cancelled: 'Cancelado',
}

export interface PaymentRow {
  id: string
  amount: number
  paidAt: string
  notes: string
  userId: string
}

export interface ReceiptRow {
  id: string
  amount: number
  paidAt: string
  notes: string
  userId: string
}

/** Lista e detalhe usam o mesmo `include` no backend (`account-payable.repository.ts::DETAIL_INCLUDE`)
 * — um único tipo cobre as duas telas, sem uma versão "leve" artificial para a listagem. */
export interface AccountPayableRow {
  id: string
  number: string
  amount: number
  dueDate: string
  status: string
  notes: string
  createdAt: string
  userId: string
  purchaseOrder: {
    id: string
    number: string
    supplier: { id: string; corporateName: string; tradeName: string } | null
  } | null
  payments: PaymentRow[]
}

export interface AccountReceivableRow {
  id: string
  number: string
  amount: number
  dueDate: string
  status: string
  notes: string
  createdAt: string
  userId: string
  invoice: {
    id: string
    number: string
    total: number
    issuedAt: string
    salesOrder: { id: string; number: string; clientName: string } | null
  } | null
  receipts: ReceiptRow[]
}

export function outstandingAmount(amount: number, movements: Array<{ amount: number }>): number {
  return amount - movements.reduce((sum, m) => sum + m.amount, 0)
}
