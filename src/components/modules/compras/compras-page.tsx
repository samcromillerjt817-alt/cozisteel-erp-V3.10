'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Eye, Package, FileOutput } from 'lucide-react'
import { PageHeader } from '@/components/platform/page-header'
import { FilterBar } from '@/components/platform/filter-bar'
import { DataTable, type DataTableColumn } from '@/components/platform/data-table'
import { DetailDrawer } from '@/components/platform/detail-drawer'
import { StatusBadge } from '@/components/domain/status-badge'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { formatCurrency } from '@/lib/format'
import { PurchaseOrderReceiveDialog } from './purchase-order-receive-dialog'
import {
  PURCHASE_ORDER_STATUS_LABELS, PURCHASE_ORDER_TRANSITIONS,
  type PurchaseOrderListRow, type PurchaseOrderRecord,
} from './types'

const PAGE_SIZE = 20
const RECEIVABLE_STATUSES = ['confirmed', 'partially_received']

interface ComprasPageProps {
  /** Deep-link vindo de fora (Hardening pós-11.5, Prioridade 1) — quando uma Requisição avançada gera
   * exatamente 1 Pedido de Compra, o usuário pode ir direto pro seu detalhe. Mesmo padrão de
   * `pendingSuggestionFromOP` (Produção→Requisições). */
  initialDetailId?: string | null
  onConsumeInitialDetail?: () => void
}

/**
 * Módulo Compras (Fase 11.5, Subetapa 11.5.8 — drill-down pesado). Nunca tem criação manual: um
 * Pedido de Compra só nasce quando uma Requisição avança para "ordered". A única ação de escrita no
 * frontend é mudar o status (respeitando a máquina de estados) e registrar recebimento.
 */
export function ComprasPage({ initialDetailId, onConsumeInitialDetail }: ComprasPageProps) {
  const [rows, setRows] = useState<PurchaseOrderListRow[]>([])
  const [loading, setLoading] = useState(false)
  const [statusFilter, setStatusFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)

  const [detailOpen, setDetailOpen] = useState(() => !!initialDetailId)
  const [detail, setDetail] = useState<PurchaseOrderRecord | null>(null)
  const [detailLoading, setDetailLoading] = useState(() => !!initialDetailId)
  const [statusChanging, setStatusChanging] = useState(false)

  const [receiveOpen, setReceiveOpen] = useState(false)
  const [receiveTarget, setReceiveTarget] = useState<PurchaseOrderRecord | null>(null)
  const [receiveQuantities, setReceiveQuantities] = useState<Record<string, number>>({})
  const [receiveSaving, setReceiveSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter !== 'all') params.set('status', statusFilter)
      params.set('page', String(page))
      params.set('limit', String(PAGE_SIZE))
      const r = await fetch(`/api/purchase-orders?${params}`)
      if (r.ok) {
        const json = await r.json()
        setRows(json.data || [])
        setTotal(json.total || 0)
      }
    } catch {
      toast.error('Erro ao carregar pedidos de compra')
    } finally {
      setLoading(false)
    }
  }, [statusFilter, page])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!initialDetailId) return
    fetchDetail(initialDetailId).then((full) => { setDetail(full); setDetailLoading(false) })
    onConsumeInitialDetail?.()
  }, [initialDetailId, onConsumeInitialDetail])

  function handleStatusFilterChange(value: string) {
    setStatusFilter(value)
    setPage(1)
  }

  async function fetchDetail(id: string): Promise<PurchaseOrderRecord | null> {
    try {
      const r = await fetch(`/api/purchase-orders/${id}`)
      if (!r.ok) {
        toast.error('Erro ao carregar pedido de compra')
        return null
      }
      return await r.json()
    } catch {
      toast.error('Erro ao carregar pedido de compra')
      return null
    }
  }

  async function openDetail(row: PurchaseOrderListRow) {
    setDetailOpen(true)
    setDetailLoading(true)
    const full = await fetchDetail(row.id)
    setDetail(full)
    setDetailLoading(false)
  }

  async function changeStatus(id: string, status: string) {
    setStatusChanging(true)
    try {
      const r = await fetch(`/api/purchase-orders/${id}/status`, {
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

  async function openReceive(row: PurchaseOrderListRow) {
    const full = await fetchDetail(row.id)
    if (!full) return
    setReceiveTarget(full)
    setReceiveQuantities(Object.fromEntries(full.items.map((i) => [i.id, Math.max(0, i.quantity - i.quantityReceived)])))
    setReceiveOpen(true)
  }

  async function confirmReceive() {
    if (!receiveTarget) return
    const items = Object.entries(receiveQuantities)
      .filter(([, q]) => Number(q) > 0)
      .map(([purchaseOrderItemId, quantityReceived]) => ({ purchaseOrderItemId, quantityReceived: Number(quantityReceived) }))
    if (items.length === 0) {
      toast.error('Informe ao menos uma quantidade recebida')
      return
    }
    setReceiveSaving(true)
    try {
      const r = await fetch(`/api/purchase-orders/${receiveTarget.id}/receive`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items }),
      })
      if (r.ok) {
        toast.success('Recebimento registrado!')
        setReceiveOpen(false)
        load()
        if (detail?.id === receiveTarget.id) setDetail(await fetchDetail(receiveTarget.id))
      } else {
        const err = await r.json()
        toast.error(err.error || 'Erro ao registrar recebimento')
      }
    } catch {
      toast.error('Erro ao registrar recebimento')
    } finally {
      setReceiveSaving(false)
    }
  }

  const columns: DataTableColumn<PurchaseOrderListRow>[] = [
    { id: 'number', header: 'Número', cell: (po) => <span className="font-mono text-sm">{po.number}</span> },
    { id: 'supplier', header: 'Fornecedor', cell: (po) => po.supplier?.corporateName || po.supplier?.tradeName || '-' },
    { id: 'requisition', header: 'Requisição de origem', cell: (po) => po.requisition?.number || '-', hideBelow: 'md' },
    { id: 'status', header: 'Status', cell: (po) => <StatusBadge domain="purchaseOrder" status={po.status} label={PURCHASE_ORDER_STATUS_LABELS[po.status] || po.status} /> },
    { id: 'total', header: 'Total', cell: (po) => formatCurrency(po.total), align: 'right' },
  ]

  const currentTransitions = detail ? (PURCHASE_ORDER_TRANSITIONS[detail.status] || []) : []
  const canReceive = detail ? RECEIVABLE_STATUSES.includes(detail.status) : false

  return (
    <div className="space-y-4">
      <PageHeader title="Pedidos de Compra" />

      <FilterBar onClear={() => { setStatusFilter('all'); setPage(1) }}>
        <Select value={statusFilter} onValueChange={handleStatusFilterChange}>
          <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            {Object.entries(PURCHASE_ORDER_STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
      </FilterBar>

      <DataTable
        columns={columns}
        rows={rows}
        getRowId={(po) => po.id}
        loading={loading}
        emptyMessage="Nenhum pedido de compra encontrado"
        rowActions={[
          { label: 'Ver detalhes', icon: <Eye />, onClick: (po) => openDetail(po) },
          { label: 'Receber mercadoria', icon: <Package />, onClick: (po) => openReceive(po), disabled: (po) => !RECEIVABLE_STATUSES.includes(po.status) },
          { label: 'PDF', icon: <FileOutput />, onClick: (po) => window.open(`/api/purchase-orders/${po.id}/pdf`, '_blank') },
        ]}
        pagination={{ page, pageSize: PAGE_SIZE, total, onPageChange: setPage }}
      />

      <DetailDrawer
        open={detailOpen}
        onOpenChange={setDetailOpen}
        title={detail ? `Pedido de Compra ${detail.number}` : 'Pedido de Compra'}
        description={detail?.supplier ? (detail.supplier.corporateName || detail.supplier.tradeName) : undefined}
      >
        {detailLoading || !detail ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div><Label className="text-xs">Requisição de origem</Label><p>{detail.requisition?.number || '-'}</p></div>
              <div><Label className="text-xs">Prazo esperado</Label><p>{detail.expectedDate || '-'}</p></div>
              <div><Label className="text-xs">Condições de pagamento</Label><p>{detail.paymentTerms || '-'}</p></div>
              <div><Label className="text-xs">Total</Label><p>{formatCurrency(detail.total)}</p></div>
            </div>
            {detail.notes && (
              <div className="text-sm"><Label className="text-xs">Observações</Label><p className="whitespace-pre-wrap">{detail.notes}</p></div>
            )}

            <div className="space-y-2">
              <Label className="text-xs">Status</Label>
              {currentTransitions.length > 0 ? (
                <Select value={detail.status} disabled={statusChanging} onValueChange={(v) => changeStatus(detail.id, v)}>
                  <SelectTrigger className="w-full"><SelectValue><StatusBadge domain="purchaseOrder" status={detail.status} label={PURCHASE_ORDER_STATUS_LABELS[detail.status] || detail.status} /></SelectValue></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={detail.status}>{PURCHASE_ORDER_STATUS_LABELS[detail.status]}</SelectItem>
                    {currentTransitions.map((s) => <SelectItem key={s} value={s}>{PURCHASE_ORDER_STATUS_LABELS[s]}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <div><StatusBadge domain="purchaseOrder" status={detail.status} label={PURCHASE_ORDER_STATUS_LABELS[detail.status] || detail.status} /></div>
              )}
            </div>

            {canReceive && (
              <Button className="w-full" onClick={() => { setReceiveTarget(detail); setReceiveQuantities(Object.fromEntries(detail.items.map((i) => [i.id, Math.max(0, i.quantity - i.quantityReceived)]))); setReceiveOpen(true) }}>
                <Package className="w-4 h-4" /> Receber mercadoria
              </Button>
            )}

            <div className="space-y-2">
              <Label className="text-xs">Itens</Label>
              <div className="space-y-2">
                {detail.items.map((item) => (
                  <div key={item.id} className="border rounded p-2 text-sm space-y-1">
                    <p className="font-medium">{item.material.name}</p>
                    <div className="flex justify-between text-muted-foreground">
                      <span>{item.quantity} {item.unit} × {formatCurrency(item.unitPrice)}</span>
                      <span>{formatCurrency(item.total)}</span>
                    </div>
                    {item.quantityReceived > 0 && (
                      <p className="text-xs text-muted-foreground">Recebido: {item.quantityReceived} {item.unit}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </DetailDrawer>

      <PurchaseOrderReceiveDialog
        open={receiveOpen}
        onOpenChange={setReceiveOpen}
        purchaseOrder={receiveTarget}
        quantities={receiveQuantities}
        onQuantityChange={(itemId, value) => setReceiveQuantities((prev) => ({ ...prev, [itemId]: value }))}
        onConfirm={confirmReceive}
        saving={receiveSaving}
      />
    </div>
  )
}
