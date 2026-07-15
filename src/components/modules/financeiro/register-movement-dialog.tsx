'use client'

import { toast } from 'sonner'
import { FormDialog } from '@/components/domain/form-dialog'
import { CurrencyInput } from '@/components/form/currency-input'
import { DateInput, isValidDate } from '@/components/form/date-input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { formatCurrency } from '@/lib/format'

export function todayDDMMYYYY(): string {
  const d = new Date()
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

interface RegisterMovementDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 'pagamento' = Conta a Pagar (POST .../pagamentos), 'recebimento' = Conta a Receber (POST
   * .../recebimentos) — a mesma distinção que decide o endpoint no chamador. */
  kind: 'pagamento' | 'recebimento'
  targetNumber: string
  outstanding: number
  amount: number
  onAmountChange: (value: number) => void
  dateText: string
  onDateChange: (value: string) => void
  notes: string
  onNotesChange: (value: string) => void
  onConfirm: (amount: number, paidAtIso: string, notes: string) => Promise<void>
  saving: boolean
}

/**
 * Financeiro (Fase 12, Subetapa 7-UI) — um único diálogo para as duas ações de baixa (Contas a
 * Pagar/Receber têm exatamente os mesmos 3 campos: valor, data, observações), seguindo o mesmo
 * `FormDialog` das demais telas do ERP. Totalmente controlado pelo chamador (mesmo padrão de
 * `purchase-order-receive-dialog.tsx`) — sem `useEffect` próprio ressincronizando estado a partir de
 * `open`: `FinanceiroPage` já semeia `amount`/`dateText`/`notes` no próprio handler de clique que abre
 * o diálogo (`openRegisterPayment`/`openRegisterReceipt`), o mesmo lugar onde `compras-page.tsx` semeia
 * `receiveQuantities` antes de abrir `PurchaseOrderReceiveDialog`.
 */
export function RegisterMovementDialog({
  open, onOpenChange, kind, targetNumber, outstanding,
  amount, onAmountChange, dateText, onDateChange, notes, onNotesChange,
  onConfirm, saving,
}: RegisterMovementDialogProps) {
  const label = kind === 'pagamento' ? 'Pagamento' : 'Recebimento'

  async function handleSave() {
    if (amount <= 0) {
      toast.error(`Informe um valor de ${label.toLowerCase()} maior que zero`)
      return
    }
    if (!isValidDate(dateText)) {
      toast.error('Informe uma data válida')
      return
    }
    const [day, month, year] = dateText.split('/')
    await onConfirm(amount, `${year}-${month}-${day}`, notes)
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Registrar ${label} — ${targetNumber}`}
      onSave={handleSave}
      saving={saving}
      saveLabel={`Confirmar ${label}`}
    >
      <div className="space-y-4">
        <div className="flex justify-between text-sm bg-muted/50 rounded p-3">
          <span>Saldo em aberto</span>
          <span className="font-mono font-semibold">{formatCurrency(outstanding)}</span>
        </div>
        <div className="space-y-1.5">
          <Label>Valor do {label.toLowerCase()}</Label>
          <CurrencyInput value={amount} onChange={onAmountChange} />
        </div>
        <div className="space-y-1.5">
          <Label>Data</Label>
          <DateInput value={dateText} onChange={onDateChange} />
        </div>
        <div className="space-y-1.5">
          <Label>Observações</Label>
          <Textarea rows={3} placeholder="Opcional" value={notes} onChange={(e) => onNotesChange(e.target.value)} />
        </div>
      </div>
    </FormDialog>
  )
}
