'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Ban, Eye, Wallet } from 'lucide-react'
import { PageHeader } from '@/components/platform/page-header'
import { FilterBar } from '@/components/platform/filter-bar'
import { DataTable, type DataTableColumn } from '@/components/platform/data-table'
import { DetailDrawer } from '@/components/platform/detail-drawer'
import { StatusBadge } from '@/components/domain/status-badge'
import { SearchInput } from '@/components/domain/search-input'
import { useConfirm } from '@/components/domain/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { formatCurrency } from '@/lib/format'
import { RegisterMovementDialog, todayDDMMYYYY } from './register-movement-dialog'
import { FINANCEIRO_STATUS_LABELS, outstandingAmount, type AccountPayableRow, type AccountReceivableRow } from './types'

const PAGE_SIZE = 20
const OPEN_STATUSES = ['open', 'partially_paid']

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR')
}

/**
 * Módulo Financeiro (Fase 12, Subetapa 7-UI) — Contas a Pagar/Receber. Mesmo padrão de abas dentro do
 * `PageHeader` já usado em Estoque (Saldo/Movimentações): cada aba é autocontida, com seu próprio
 * estado/efeito de carregamento — nunca um único efeito compartilhado disparando as duas listas.
 */
export function FinanceiroPage() {
  const confirmAction = useConfirm()
  const [view, setView] = useState<'pagar' | 'receber'>('pagar')

  // ── Contas a Pagar ──
  const [payableRows, setPayableRows] = useState<AccountPayableRow[]>([])
  const [payableLoading, setPayableLoading] = useState(false)
  const [payableStatusFilter, setPayableStatusFilter] = useState('all')
  const [payableSearch, setPayableSearch] = useState('')
  const debouncedPayableSearch = useDebouncedValue(payableSearch)
  const [payablePage, setPayablePage] = useState(1)
  const [payableTotal, setPayableTotal] = useState(0)

  const [payableDetailOpen, setPayableDetailOpen] = useState(false)
  const [payableDetail, setPayableDetail] = useState<AccountPayableRow | null>(null)
  const [payableDetailLoading, setPayableDetailLoading] = useState(false)

  // ── Contas a Receber ──
  const [receivableRows, setReceivableRows] = useState<AccountReceivableRow[]>([])
  const [receivableLoading, setReceivableLoading] = useState(false)
  const [receivableStatusFilter, setReceivableStatusFilter] = useState('all')
  const [receivableSearch, setReceivableSearch] = useState('')
  const debouncedReceivableSearch = useDebouncedValue(receivableSearch)
  const [receivablePage, setReceivablePage] = useState(1)
  const [receivableTotal, setReceivableTotal] = useState(0)

  const [receivableDetailOpen, setReceivableDetailOpen] = useState(false)
  const [receivableDetail, setReceivableDetail] = useState<AccountReceivableRow | null>(null)
  const [receivableDetailLoading, setReceivableDetailLoading] = useState(false)

  // ── Registrar pagamento/recebimento (diálogo compartilhado, totalmente controlado por esta página —
  // seus valores são semeados aqui, no clique que abre o diálogo, nunca por um efeito dentro dele) ──
  const [registerOpen, setRegisterOpen] = useState(false)
  const [registerKind, setRegisterKind] = useState<'pagamento' | 'recebimento'>('pagamento')
  const [registerTarget, setRegisterTarget] = useState<AccountPayableRow | AccountReceivableRow | null>(null)
  const [registerOutstanding, setRegisterOutstanding] = useState(0)
  const [registerAmount, setRegisterAmount] = useState(0)
  const [registerDateText, setRegisterDateText] = useState('')
  const [registerNotes, setRegisterNotes] = useState('')
  const [registerSaving, setRegisterSaving] = useState(false)

  const loadPayables = useCallback(async () => {
    setPayableLoading(true)
    try {
      const params = new URLSearchParams()
      if (payableStatusFilter !== 'all') params.set('status', payableStatusFilter)
      if (debouncedPayableSearch) params.set('search', debouncedPayableSearch)
      params.set('page', String(payablePage))
      params.set('limit', String(PAGE_SIZE))
      const r = await fetch(`/api/financeiro/contas-a-pagar?${params}`)
      if (r.ok) {
        const json = await r.json()
        setPayableRows(json.data || [])
        setPayableTotal(json.total || 0)
      }
    } catch {
      toast.error('Erro ao carregar contas a pagar')
    } finally {
      setPayableLoading(false)
    }
  }, [payableStatusFilter, debouncedPayableSearch, payablePage])

  const loadReceivables = useCallback(async () => {
    setReceivableLoading(true)
    try {
      const params = new URLSearchParams()
      if (receivableStatusFilter !== 'all') params.set('status', receivableStatusFilter)
      if (debouncedReceivableSearch) params.set('search', debouncedReceivableSearch)
      params.set('page', String(receivablePage))
      params.set('limit', String(PAGE_SIZE))
      const r = await fetch(`/api/financeiro/contas-a-receber?${params}`)
      if (r.ok) {
        const json = await r.json()
        setReceivableRows(json.data || [])
        setReceivableTotal(json.total || 0)
      }
    } catch {
      toast.error('Erro ao carregar contas a receber')
    } finally {
      setReceivableLoading(false)
    }
  }, [receivableStatusFilter, debouncedReceivableSearch, receivablePage])

  useEffect(() => {
    if (view === 'pagar') loadPayables()
  }, [view, loadPayables])

  useEffect(() => {
    if (view === 'receber') loadReceivables()
  }, [view, loadReceivables])

  async function fetchPayableDetail(id: string): Promise<AccountPayableRow | null> {
    try {
      const r = await fetch(`/api/financeiro/contas-a-pagar/${id}`)
      if (!r.ok) {
        toast.error('Erro ao carregar título a pagar')
        return null
      }
      return await r.json()
    } catch {
      toast.error('Erro ao carregar título a pagar')
      return null
    }
  }

  async function fetchReceivableDetail(id: string): Promise<AccountReceivableRow | null> {
    try {
      const r = await fetch(`/api/financeiro/contas-a-receber/${id}`)
      if (!r.ok) {
        toast.error('Erro ao carregar título a receber')
        return null
      }
      return await r.json()
    } catch {
      toast.error('Erro ao carregar título a receber')
      return null
    }
  }

  async function openPayableDetail(row: AccountPayableRow) {
    setPayableDetailOpen(true)
    setPayableDetailLoading(true)
    setPayableDetail(await fetchPayableDetail(row.id))
    setPayableDetailLoading(false)
  }

  async function openReceivableDetail(row: AccountReceivableRow) {
    setReceivableDetailOpen(true)
    setReceivableDetailLoading(true)
    setReceivableDetail(await fetchReceivableDetail(row.id))
    setReceivableDetailLoading(false)
  }

  function openRegisterPayment(row: AccountPayableRow) {
    setRegisterKind('pagamento')
    setRegisterTarget(row)
    setRegisterOutstanding(outstandingAmount(row.amount, row.payments))
    setRegisterAmount(outstandingAmount(row.amount, row.payments))
    setRegisterDateText(todayDDMMYYYY())
    setRegisterNotes('')
    setRegisterOpen(true)
  }

  function openRegisterReceipt(row: AccountReceivableRow) {
    setRegisterKind('recebimento')
    setRegisterTarget(row)
    setRegisterOutstanding(outstandingAmount(row.amount, row.receipts))
    setRegisterAmount(outstandingAmount(row.amount, row.receipts))
    setRegisterDateText(todayDDMMYYYY())
    setRegisterNotes('')
    setRegisterOpen(true)
  }

  async function confirmRegister(amount: number, paidAtIso: string, notes: string) {
    if (!registerTarget) return
    setRegisterSaving(true)
    try {
      const path = registerKind === 'pagamento'
        ? `/api/financeiro/contas-a-pagar/${registerTarget.id}/pagamentos`
        : `/api/financeiro/contas-a-receber/${registerTarget.id}/recebimentos`
      const r = await fetch(path, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount, paidAt: paidAtIso, notes }),
      })
      if (r.ok) {
        toast.success(registerKind === 'pagamento' ? 'Pagamento registrado!' : 'Recebimento registrado!')
        setRegisterOpen(false)
        if (registerKind === 'pagamento') {
          loadPayables()
          if (payableDetail?.id === registerTarget.id) setPayableDetail(await fetchPayableDetail(registerTarget.id))
        } else {
          loadReceivables()
          if (receivableDetail?.id === registerTarget.id) setReceivableDetail(await fetchReceivableDetail(registerTarget.id))
        }
      } else {
        const err = await r.json()
        toast.error(err.error || 'Erro ao registrar')
      }
    } catch {
      toast.error('Erro ao registrar')
    } finally {
      setRegisterSaving(false)
    }
  }

  async function cancelPayable(row: AccountPayableRow) {
    if (!(await confirmAction({ description: `Cancelar o título a pagar ${row.number}? Só é possível cancelar títulos sem nenhum pagamento registrado.`, destructive: true }))) return
    try {
      const r = await fetch(`/api/financeiro/contas-a-pagar/${row.id}/cancelar`, { method: 'POST' })
      if (r.ok) {
        toast.success('Título a pagar cancelado!')
        loadPayables()
        if (payableDetail?.id === row.id) setPayableDetail(await fetchPayableDetail(row.id))
      } else {
        const err = await r.json()
        toast.error(err.error || 'Erro ao cancelar título')
      }
    } catch {
      toast.error('Erro ao cancelar título')
    }
  }

  async function cancelReceivable(row: AccountReceivableRow) {
    if (!(await confirmAction({ description: `Cancelar o título a receber ${row.number}? Só é possível cancelar títulos sem nenhum recebimento registrado.`, destructive: true }))) return
    try {
      const r = await fetch(`/api/financeiro/contas-a-receber/${row.id}/cancelar`, { method: 'POST' })
      if (r.ok) {
        toast.success('Título a receber cancelado!')
        loadReceivables()
        if (receivableDetail?.id === row.id) setReceivableDetail(await fetchReceivableDetail(row.id))
      } else {
        const err = await r.json()
        toast.error(err.error || 'Erro ao cancelar título')
      }
    } catch {
      toast.error('Erro ao cancelar título')
    }
  }

  const payableColumns: DataTableColumn<AccountPayableRow>[] = [
    { id: 'number', header: 'Número', cell: (a) => <span className="font-mono text-sm">{a.number}</span> },
    { id: 'purchaseOrder', header: 'Pedido de Compra', cell: (a) => a.purchaseOrder ? `${a.purchaseOrder.number} — ${a.purchaseOrder.supplier?.corporateName || a.purchaseOrder.supplier?.tradeName || '-'}` : '-' },
    { id: 'dueDate', header: 'Vencimento', cell: (a) => formatDate(a.dueDate), hideBelow: 'sm' },
    { id: 'status', header: 'Status', cell: (a) => <StatusBadge domain="financeiro" status={a.status} label={FINANCEIRO_STATUS_LABELS[a.status] || a.status} /> },
    { id: 'amount', header: 'Valor', align: 'right', cell: (a) => formatCurrency(a.amount) },
  ]

  const receivableColumns: DataTableColumn<AccountReceivableRow>[] = [
    { id: 'number', header: 'Número', cell: (a) => <span className="font-mono text-sm">{a.number}</span> },
    { id: 'invoice', header: 'Fatura / Pedido de Venda', cell: (a) => a.invoice ? `${a.invoice.number}${a.invoice.salesOrder ? ` — ${a.invoice.salesOrder.clientName}` : ''}` : '-' },
    { id: 'dueDate', header: 'Vencimento', cell: (a) => formatDate(a.dueDate), hideBelow: 'sm' },
    { id: 'status', header: 'Status', cell: (a) => <StatusBadge domain="financeiro" status={a.status} label={FINANCEIRO_STATUS_LABELS[a.status] || a.status} /> },
    { id: 'amount', header: 'Valor', align: 'right', cell: (a) => formatCurrency(a.amount) },
  ]

  return (
    <div className="space-y-4">
      <PageHeader
        title="Financeiro"
        description="Contas a Pagar e a Receber — baixa de títulos gerados automaticamente pelo recebimento de Pedidos de Compra e pelo faturamento de Pedidos de Venda."
        actions={
          <Tabs value={view} onValueChange={(v) => setView(v as 'pagar' | 'receber')}>
            <TabsList>
              <TabsTrigger value="pagar">Contas a Pagar</TabsTrigger>
              <TabsTrigger value="receber">Contas a Receber</TabsTrigger>
            </TabsList>
          </Tabs>
        }
      />

      {view === 'pagar' && (
        <>
          <FilterBar onClear={() => { setPayableStatusFilter('all'); setPayableSearch(''); setPayablePage(1) }}>
            <Select value={payableStatusFilter} onValueChange={(v) => { setPayableStatusFilter(v); setPayablePage(1) }}>
              <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                {Object.entries(FINANCEIRO_STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
            <SearchInput value={payableSearch} onChange={setPayableSearch} placeholder="Buscar por número..." />
          </FilterBar>

          <DataTable
            columns={payableColumns}
            rows={payableRows}
            getRowId={(a) => a.id}
            loading={payableLoading}
            emptyMessage="Nenhuma conta a pagar encontrada"
            rowActions={[
              { label: 'Ver detalhes', icon: <Eye />, onClick: openPayableDetail },
              { label: 'Registrar pagamento', icon: <Wallet />, onClick: openRegisterPayment, disabled: (a) => !OPEN_STATUSES.includes(a.status) },
              { label: 'Cancelar', icon: <Ban />, onClick: cancelPayable, disabled: (a) => a.status !== 'open', variant: 'destructive' },
            ]}
            pagination={{ page: payablePage, pageSize: PAGE_SIZE, total: payableTotal, onPageChange: setPayablePage }}
          />
        </>
      )}

      {view === 'receber' && (
        <>
          <FilterBar onClear={() => { setReceivableStatusFilter('all'); setReceivableSearch(''); setReceivablePage(1) }}>
            <Select value={receivableStatusFilter} onValueChange={(v) => { setReceivableStatusFilter(v); setReceivablePage(1) }}>
              <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                {Object.entries(FINANCEIRO_STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
            <SearchInput value={receivableSearch} onChange={setReceivableSearch} placeholder="Buscar por número..." />
          </FilterBar>

          <DataTable
            columns={receivableColumns}
            rows={receivableRows}
            getRowId={(a) => a.id}
            loading={receivableLoading}
            emptyMessage="Nenhuma conta a receber encontrada"
            rowActions={[
              { label: 'Ver detalhes', icon: <Eye />, onClick: openReceivableDetail },
              { label: 'Registrar recebimento', icon: <Wallet />, onClick: openRegisterReceipt, disabled: (a) => !OPEN_STATUSES.includes(a.status) },
              { label: 'Cancelar', icon: <Ban />, onClick: cancelReceivable, disabled: (a) => a.status !== 'open', variant: 'destructive' },
            ]}
            pagination={{ page: receivablePage, pageSize: PAGE_SIZE, total: receivableTotal, onPageChange: setReceivablePage }}
          />
        </>
      )}

      <DetailDrawer
        open={payableDetailOpen}
        onOpenChange={setPayableDetailOpen}
        title={payableDetail ? `Título a Pagar ${payableDetail.number}` : 'Título a Pagar'}
        description={payableDetail?.purchaseOrder ? `Pedido de Compra ${payableDetail.purchaseOrder.number}` : undefined}
      >
        {payableDetailLoading || !payableDetail ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div><Label className="text-xs">Fornecedor</Label><p>{payableDetail.purchaseOrder?.supplier?.corporateName || payableDetail.purchaseOrder?.supplier?.tradeName || '-'}</p></div>
              <div><Label className="text-xs">Vencimento</Label><p>{formatDate(payableDetail.dueDate)}</p></div>
              <div><Label className="text-xs">Valor total</Label><p>{formatCurrency(payableDetail.amount)}</p></div>
              <div><Label className="text-xs">Saldo em aberto</Label><p className="font-semibold">{formatCurrency(outstandingAmount(payableDetail.amount, payableDetail.payments))}</p></div>
            </div>
            {payableDetail.notes && (
              <div className="text-sm"><Label className="text-xs">Observações</Label><p className="whitespace-pre-wrap">{payableDetail.notes}</p></div>
            )}

            <div><StatusBadge domain="financeiro" status={payableDetail.status} label={FINANCEIRO_STATUS_LABELS[payableDetail.status] || payableDetail.status} /></div>

            <div className="flex gap-2">
              {OPEN_STATUSES.includes(payableDetail.status) && (
                <Button className="flex-1" onClick={() => openRegisterPayment(payableDetail)}>
                  <Wallet className="w-4 h-4" /> Registrar pagamento
                </Button>
              )}
              {payableDetail.status === 'open' && (
                <Button variant="outline" className="flex-1" onClick={() => cancelPayable(payableDetail)}>
                  <Ban className="w-4 h-4" /> Cancelar
                </Button>
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Pagamentos</Label>
              {payableDetail.payments.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum pagamento registrado ainda.</p>
              ) : (
                <div className="space-y-2">
                  {payableDetail.payments.map((p) => (
                    <div key={p.id} className="border rounded p-2 text-sm flex justify-between items-start">
                      <div>
                        <p>{formatDate(p.paidAt)}</p>
                        {p.notes && <p className="text-xs text-muted-foreground">{p.notes}</p>}
                      </div>
                      <span className="font-mono font-medium">{formatCurrency(p.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </DetailDrawer>

      <DetailDrawer
        open={receivableDetailOpen}
        onOpenChange={setReceivableDetailOpen}
        title={receivableDetail ? `Título a Receber ${receivableDetail.number}` : 'Título a Receber'}
        description={receivableDetail?.invoice ? `Fatura ${receivableDetail.invoice.number}` : undefined}
      >
        {receivableDetailLoading || !receivableDetail ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div><Label className="text-xs">Cliente</Label><p>{receivableDetail.invoice?.salesOrder?.clientName || '-'}</p></div>
              <div><Label className="text-xs">Vencimento</Label><p>{formatDate(receivableDetail.dueDate)}</p></div>
              <div><Label className="text-xs">Valor total</Label><p>{formatCurrency(receivableDetail.amount)}</p></div>
              <div><Label className="text-xs">Saldo em aberto</Label><p className="font-semibold">{formatCurrency(outstandingAmount(receivableDetail.amount, receivableDetail.receipts))}</p></div>
            </div>
            {receivableDetail.notes && (
              <div className="text-sm"><Label className="text-xs">Observações</Label><p className="whitespace-pre-wrap">{receivableDetail.notes}</p></div>
            )}

            <div><StatusBadge domain="financeiro" status={receivableDetail.status} label={FINANCEIRO_STATUS_LABELS[receivableDetail.status] || receivableDetail.status} /></div>

            <div className="flex gap-2">
              {OPEN_STATUSES.includes(receivableDetail.status) && (
                <Button className="flex-1" onClick={() => openRegisterReceipt(receivableDetail)}>
                  <Wallet className="w-4 h-4" /> Registrar recebimento
                </Button>
              )}
              {receivableDetail.status === 'open' && (
                <Button variant="outline" className="flex-1" onClick={() => cancelReceivable(receivableDetail)}>
                  <Ban className="w-4 h-4" /> Cancelar
                </Button>
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Recebimentos</Label>
              {receivableDetail.receipts.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum recebimento registrado ainda.</p>
              ) : (
                <div className="space-y-2">
                  {receivableDetail.receipts.map((r) => (
                    <div key={r.id} className="border rounded p-2 text-sm flex justify-between items-start">
                      <div>
                        <p>{formatDate(r.paidAt)}</p>
                        {r.notes && <p className="text-xs text-muted-foreground">{r.notes}</p>}
                      </div>
                      <span className="font-mono font-medium">{formatCurrency(r.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </DetailDrawer>

      <RegisterMovementDialog
        open={registerOpen}
        onOpenChange={setRegisterOpen}
        kind={registerKind}
        targetNumber={registerTarget?.number || ''}
        outstanding={registerOutstanding}
        amount={registerAmount}
        onAmountChange={setRegisterAmount}
        dateText={registerDateText}
        onDateChange={setRegisterDateText}
        notes={registerNotes}
        onNotesChange={setRegisterNotes}
        onConfirm={confirmRegister}
        saving={registerSaving}
      />
    </div>
  )
}
