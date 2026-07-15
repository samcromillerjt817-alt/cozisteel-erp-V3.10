'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Eye, FileOutput } from 'lucide-react'
import { PageHeader } from '@/components/platform/page-header'
import { FilterBar } from '@/components/platform/filter-bar'
import { DataTable, type DataTableColumn } from '@/components/platform/data-table'
import { DetailDrawer } from '@/components/platform/detail-drawer'
import { StatusBadge } from '@/components/domain/status-badge'
import { SearchInput } from '@/components/domain/search-input'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { formatCurrency } from '@/lib/format'
import {
  SALES_ORDER_STATUS_LABELS, SALES_ORDER_TRANSITIONS,
  type SalesOrderListRow, type SalesOrderRecord,
} from './types'

const PAGE_SIZE = 20

interface PedidosPageProps {
  /** Deep-link vindo de fora (Hardening pós-11.5, Prioridade 1) — quando um Pedido de Venda acaba de
   * nascer da conversão de um Orçamento, o usuário pode ir direto pro seu detalhe em vez de procurá-lo
   * manualmente na lista. Mesmo padrão de `pendingSuggestionFromOP` (Produção→Requisições). */
  initialDetailId?: string | null
  onConsumeInitialDetail?: () => void
}

/**
 * Módulo Pedidos de Venda (Fase 11.5, Subetapa 11.5.12). Nunca tem criação manual (só nasce da
 * conversão de um Orçamento aprovado) — mesmo espírito estrutural de Compras (11.5.8): listagem +
 * `DetailDrawer` com transição de status, sem `FormDialog`.
 *
 * **2 achados fechados nesta migração**: (1) busca por número/cliente já existia no backend
 * (`sales-order.service.ts::list()`) mas nunca tinha `SearchInput` na UI — adicionado ao `FilterBar`.
 * (2) não havia nenhuma visão de detalhe apesar de `GET /api/sales-orders/[id]` já devolver itens,
 * cliente completo e Ordens de Produção vinculadas — vira o `DetailDrawer` abaixo. Mesma correção de
 * transição de status inatingível já aplicada em Compras/Requisições/Produção.
 */
export function PedidosPage({ initialDetailId, onConsumeInitialDetail }: PedidosPageProps) {
  const [rows, setRows] = useState<SalesOrderListRow[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search)
  const [statusFilter, setStatusFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)

  const [detailOpen, setDetailOpen] = useState(() => !!initialDetailId)
  const [detail, setDetail] = useState<SalesOrderRecord | null>(null)
  const [detailLoading, setDetailLoading] = useState(() => !!initialDetailId)
  const [statusChanging, setStatusChanging] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (debouncedSearch) params.set('search', debouncedSearch)
      params.set('page', String(page))
      params.set('limit', String(PAGE_SIZE))
      const r = await fetch(`/api/sales-orders?${params}`)
      if (r.ok) {
        const json = await r.json()
        setRows(json.data || [])
        setTotal(json.total || 0)
      }
    } catch {
      toast.error('Erro ao carregar pedidos de venda')
    } finally {
      setLoading(false)
    }
  }, [statusFilter, debouncedSearch, page])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!initialDetailId) return
    fetchDetail(initialDetailId).then((full) => { setDetail(full); setDetailLoading(false) })
    onConsumeInitialDetail?.()
  }, [initialDetailId, onConsumeInitialDetail])

  function handleSearchChange(value: string) {
    setSearch(value)
    setPage(1)
  }

  function handleStatusFilterChange(value: string) {
    setStatusFilter(value)
    setPage(1)
  }

  async function fetchDetail(id: string): Promise<SalesOrderRecord | null> {
    try {
      const r = await fetch(`/api/sales-orders/${id}`)
      if (!r.ok) {
        toast.error('Erro ao carregar pedido de venda')
        return null
      }
      return await r.json()
    } catch {
      toast.error('Erro ao carregar pedido de venda')
      return null
    }
  }

  async function openDetail(row: SalesOrderListRow) {
    setDetailOpen(true)
    setDetailLoading(true)
    const full = await fetchDetail(row.id)
    setDetail(full)
    setDetailLoading(false)
  }

  async function changeStatus(id: string, status: string) {
    setStatusChanging(true)
    try {
      const r = await fetch(`/api/sales-orders/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
      })
      if (r.ok) {
        toast.success('Status atualizado!')
        load()
        if (detail?.id === id) setDetail(await fetchDetail(id))
      } else {
        const err = await r.json()
        toast.error(err.error || 'Erro ao mudar status')
      }
    } catch {
      toast.error('Erro ao mudar status')
    } finally {
      setStatusChanging(false)
    }
  }

  const columns: DataTableColumn<SalesOrderListRow>[] = [
    { id: 'number', header: 'Número', cell: (so) => <span className="font-mono text-sm">{so.number}</span> },
    { id: 'client', header: 'Cliente', cell: (so) => so.clientName || so.client?.corporateName || '-' },
    { id: 'date', header: 'Data', cell: (so) => so.date, hideBelow: 'sm' },
    { id: 'origin', header: 'Origem', cell: (so) => so.quote ? `Orç. ${so.quote.number}` : '-', hideBelow: 'md' },
    { id: 'total', header: 'Total', cell: (so) => formatCurrency(so.total), align: 'right' },
    { id: 'status', header: 'Status', cell: (so) => <StatusBadge domain="salesOrder" status={so.status} label={SALES_ORDER_STATUS_LABELS[so.status] || so.status} /> },
    { id: 'productionOrders', header: 'OPs geradas', cell: (so) => so.productionOrders?.length || 0, align: 'center', hideBelow: 'lg' },
  ]

  const currentTransitions = detail ? (SALES_ORDER_TRANSITIONS[detail.status] || []) : []

  return (
    <div className="space-y-4">
      <PageHeader
        title="Pedidos de Venda"
        description="Pedidos nascem da conversão de um orçamento aprovado (aba Orçamentos)."
      />

      <FilterBar onClear={() => { setSearch(''); setStatusFilter('all'); setPage(1) }}>
        <SearchInput value={search} onChange={handleSearchChange} placeholder="Buscar por número ou cliente..." />
        <Select value={statusFilter} onValueChange={handleStatusFilterChange}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            {Object.entries(SALES_ORDER_STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
      </FilterBar>

      <DataTable
        columns={columns}
        rows={rows}
        getRowId={(so) => so.id}
        loading={loading}
        emptyMessage="Nenhum pedido de venda ainda"
        rowActions={[
          { label: 'Ver detalhes', icon: <Eye />, onClick: (so) => openDetail(so) },
          { label: 'PDF', icon: <FileOutput />, onClick: (so) => window.open(`/api/sales-orders/${so.id}/pdf`, '_blank') },
        ]}
        pagination={{ page, pageSize: PAGE_SIZE, total, onPageChange: setPage }}
      />

      <DetailDrawer
        open={detailOpen}
        onOpenChange={setDetailOpen}
        title={detail ? `Pedido de Venda ${detail.number}` : 'Pedido de Venda'}
        description={detail?.clientName || detail?.client?.corporateName}
      >
        {detailLoading || !detail ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div><Label className="text-xs">Orçamento de origem</Label><p>{detail.quote?.number || '-'}</p></div>
              <div><Label className="text-xs">Data</Label><p>{detail.date}</p></div>
              <div><Label className="text-xs">Condições de pagamento</Label><p>{detail.paymentTerms || '-'}</p></div>
              <div><Label className="text-xs">Prazo de entrega</Label><p>{detail.deliveryTime || '-'}</p></div>
              <div><Label className="text-xs">Total</Label><p>{formatCurrency(detail.total)}</p></div>
            </div>
            {detail.notes && (
              <div className="text-sm"><Label className="text-xs">Observações</Label><p className="whitespace-pre-wrap">{detail.notes}</p></div>
            )}

            <div className="space-y-2">
              <Label className="text-xs">Status</Label>
              {currentTransitions.length > 0 ? (
                <Select value={detail.status} disabled={statusChanging} onValueChange={(v) => changeStatus(detail.id, v)}>
                  <SelectTrigger className="w-full"><SelectValue><StatusBadge domain="salesOrder" status={detail.status} label={SALES_ORDER_STATUS_LABELS[detail.status] || detail.status} /></SelectValue></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={detail.status}>{SALES_ORDER_STATUS_LABELS[detail.status]}</SelectItem>
                    {currentTransitions.map((s) => <SelectItem key={s} value={s}>{SALES_ORDER_STATUS_LABELS[s]}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <div><StatusBadge domain="salesOrder" status={detail.status} label={SALES_ORDER_STATUS_LABELS[detail.status] || detail.status} /></div>
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Itens</Label>
              <div className="space-y-2">
                {detail.items.map((item) => (
                  <div key={item.id} className="border rounded p-2 text-sm space-y-1">
                    <p className="font-medium">{item.description}</p>
                    <div className="flex justify-between text-muted-foreground">
                      <span>{item.quantity} {item.unit} × {formatCurrency(item.unitPrice)}</span>
                      <span>{formatCurrency(item.total)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {detail.productionOrders.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs">Ordens de Produção geradas</Label>
                <div className="space-y-1">
                  {detail.productionOrders.map((po) => (
                    <div key={po.id} className="flex justify-between text-sm border rounded px-3 py-1.5">
                      <span className="font-mono">{po.number}</span>
                      <span className="text-muted-foreground">{po.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </DetailDrawer>
    </div>
  )
}
