'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Receipt, Ban } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { QuantityInput } from '@/components/form/quantity-input'
import { StatusBadge } from '@/components/domain/status-badge'
import { useConfirm } from '@/components/domain/confirm-dialog'
import { formatCurrency } from '@/lib/format'
import { INVOICE_STATUS_LABELS, type InvoiceableItemBalance, type InvoiceRecord } from './types'

interface InvoicingSectionProps {
  salesOrderId: string
  salesOrderStatus: string
}

/**
 * ADR-023 (Decisão #2, 2026-07-27) — primeira tela do Faturamento: `Invoice`/`InvoiceService` já
 * existiam desde a Fase 12 (ADR-016), nunca tinham rota nem UI. Abre com o saldo faturável de cada
 * item já pré-preenchido por inteiro (decisão do usuário: "a tela deve iniciar com todo o saldo
 * faturável selecionado, mas permitir alterar quantidades") — faturamento total por padrão, parcial
 * permitido ajustando o campo. Preço unitário nunca é editável aqui, só a quantidade.
 */
export function InvoicingSection({ salesOrderId, salesOrderStatus }: InvoicingSectionProps) {
  const confirmAction = useConfirm()
  const [loading, setLoading] = useState(true)
  const [balance, setBalance] = useState<InvoiceableItemBalance[]>([])
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([])
  const [quantities, setQuantities] = useState<Record<string, number>>({})
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/sales-orders/${salesOrderId}/invoices`)
      if (r.ok) {
        const json = await r.json()
        setBalance(json.balance || [])
        setInvoices(json.invoices || [])
        // Reabre sempre com o saldo restante inteiro pré-selecionado (decisão do usuário) — nunca
        // preserva um valor parcial editado numa carga anterior.
        const next: Record<string, number> = {}
        for (const item of json.balance || []) next[item.salesOrderItemId] = item.quantityRemaining
        setQuantities(next)
      }
    } catch {
      toast.error('Erro ao carregar faturamento do pedido')
    } finally {
      setLoading(false)
    }
  }, [salesOrderId])

  useEffect(() => {
    load()
  }, [load])

  const selectedTotal = balance.reduce((sum, item) => sum + (quantities[item.salesOrderItemId] || 0) * item.unitPrice, 0)
  const hasSomethingToInvoice = balance.some((item) => (quantities[item.salesOrderItemId] || 0) > 0)
  const isFullInvoice = balance.every((item) => Math.abs((quantities[item.salesOrderItemId] || 0) - item.quantityRemaining) < 1e-9)

  async function handleInvoice() {
    const items = balance
      .map((item) => ({ salesOrderItemId: item.salesOrderItemId, quantity: quantities[item.salesOrderItemId] || 0 }))
      .filter((i) => i.quantity > 0)
    if (items.length === 0) return

    if (!(await confirmAction({
      title: isFullInvoice ? 'Emitir fatura total' : 'Emitir fatura parcial',
      description: `Emitir fatura de ${formatCurrency(selectedTotal)}${isFullInvoice ? '' : ' (parcial)'}? Isso gera a Conta a Receber correspondente no Financeiro.`,
    }))) return

    setSaving(true)
    try {
      const r = await fetch(`/api/sales-orders/${salesOrderId}/invoices`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items, notes: '' }),
      })
      if (r.ok) {
        toast.success('Fatura emitida!')
        load()
      } else {
        const err = await r.json()
        toast.error(err.error || 'Erro ao emitir fatura')
      }
    } catch {
      toast.error('Erro ao emitir fatura')
    } finally {
      setSaving(false)
    }
  }

  async function handleCancel(invoice: InvoiceRecord) {
    if (!(await confirmAction({
      description: `Cancelar a fatura ${invoice.number}? Só é possível enquanto a Conta a Receber ainda não teve nenhum recebimento registrado.`,
      destructive: true,
    }))) return
    try {
      const r = await fetch(`/api/invoices/${invoice.id}/cancel`, { method: 'POST' })
      if (r.ok) {
        toast.success('Fatura cancelada!')
        load()
      } else {
        const err = await r.json()
        toast.error(err.error || 'Erro ao cancelar fatura — se já houver recebimento, isso exige estorno financeiro')
      }
    } catch {
      toast.error('Erro ao cancelar fatura')
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">Carregando faturamento...</p>
  if (salesOrderStatus === 'cancelled') return null

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label className="text-xs">Saldo faturável</Label>
        <div className="space-y-2">
          {balance.map((item) => (
            <div key={item.salesOrderItemId} className="border rounded p-2 text-sm space-y-1.5">
              <div className="flex justify-between">
                <span className="font-medium">{item.description}</span>
                <span className="text-muted-foreground">{formatCurrency(item.unitPrice)}/un</span>
              </div>
              <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                <span>Pedido: {item.quantityOrdered} · Faturado: {item.quantityInvoiced} · Restante: {item.quantityRemaining}</span>
                <QuantityInput
                  className="w-24 h-8"
                  value={quantities[item.salesOrderItemId] ?? 0}
                  max={item.quantityRemaining}
                  onChange={(v) => setQuantities((prev) => ({ ...prev, [item.salesOrderItemId]: v }))}
                />
              </div>
            </div>
          ))}
          {balance.length === 0 && <p className="text-sm text-muted-foreground">Nenhum item neste pedido.</p>}
        </div>
        <div className="flex items-center justify-between pt-1">
          <span className="text-sm text-muted-foreground">Total a faturar</span>
          <span className="font-semibold">{formatCurrency(selectedTotal)}</span>
        </div>
        <Button className="w-full" disabled={!hasSomethingToInvoice || saving} onClick={handleInvoice}>
          <Receipt className="w-4 h-4" /> {saving ? 'Emitindo...' : isFullInvoice ? 'Faturar tudo' : 'Faturar parcial'}
        </Button>
      </div>

      {invoices.length > 0 && (
        <div className="space-y-2">
          <Label className="text-xs">Faturas emitidas</Label>
          <div className="space-y-1.5">
            {invoices.map((invoice) => (
              <div key={invoice.id} className="border rounded p-2 text-sm space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-mono">{invoice.number}</span>
                  <StatusBadge domain="invoice" status={invoice.status} label={INVOICE_STATUS_LABELS[invoice.status] || invoice.status} />
                </div>
                <div className="flex items-center justify-between text-muted-foreground text-xs">
                  <span>{invoice.issuedAt?.slice(0, 10)} · {formatCurrency(invoice.total)}</span>
                  {invoice.accountReceivable && (
                    <span>Conta a Receber {invoice.accountReceivable.number} ({invoice.accountReceivable.status})</span>
                  )}
                </div>
                {invoice.status === 'issued' && (
                  <Button variant="ghost" size="sm" className="text-destructive h-7 px-2" onClick={() => handleCancel(invoice)}>
                    <Ban className="w-3.5 h-3.5" /> Cancelar fatura
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
