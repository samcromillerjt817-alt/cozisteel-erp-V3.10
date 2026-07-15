'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Plus, FileOutput, Package, Edit, Trash2, Eye } from 'lucide-react'
import { PageHeader } from '@/components/platform/page-header'
import { DataTable, type DataTableColumn } from '@/components/platform/data-table'
import { DetailDrawer } from '@/components/platform/detail-drawer'
import { FormDialog } from '@/components/domain/form-dialog'
import { StatusBadge } from '@/components/domain/status-badge'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { AsyncButton } from '@/components/domain/async-button'
import { QuantityInput } from '@/components/form/quantity-input'
import { useConfirm } from '@/components/domain/confirm-dialog'
import { ProducaoFormFields } from './producao-form-fields'
import {
  PRODUCTION_ORDER_STATUS_LABELS, PRODUCTION_ORDER_TRANSITIONS, EMPTY_PRODUCTION_ORDER_FORM, productionOrderToFormData,
  type ProductionOrderListRow, type ProductionOrderRecord, type ProductionOrderFormData,
} from './types'

interface ProductOption { id: string; name: string }
interface SalesOrderOption { id: string; number: string; clientName: string; items?: { id: string; description: string; quantity: number; unit: string; productId: string | null }[] }

interface ProducaoPageProps {
  products: ProductOption[]
  salesOrders: SalesOrderOption[]
  onGenerateRequisitionFromOP: (productionOrderId: string) => void
  /** Deep-link vindo de fora (Hardening pós-11.5, Prioridade 1) — quando um Orçamento aprovado gera
   * exatamente 1 Ordem de Produção, o usuário pode ir direto pro seu detalhe. Mesmo padrão de
   * `pendingSuggestionFromOP` (Produção→Requisições), na direção oposta. */
  initialDetailId?: string | null
  onConsumeInitialDetail?: () => void
}

const PAGE_SIZE = 20

/**
 * Módulo Produção / Ordens de Produção (Fase 11.5, Subetapa 11.5.8 — drill-down pesado, a migração
 * mais complexa das três). Status e progresso de produção migram para o `DetailDrawer` (mesma
 * unificação de Compras/Requisições); o `FormDialog` fica só com os campos de negócio.
 *
 * **Achado de backend fechado nesta subetapa**: o endpoint `POST /production-orders/[id]/produce`
 * (produção parcial/total, `ProductionOrderService.produce()`) já existia desde a Fase 9 (ADR-011),
 * mas nenhuma tela jamais o chamava — a única forma de "concluir" uma OP era o Select genérico de
 * status marcando "completed" de uma vez (que internamente chama `produce()` para o saldo inteiro).
 * Produção parcial por rodada, um recurso já pronto no backend, nunca teve UI. O `DetailDrawer` abaixo
 * é essa UI, pela primeira vez.
 */
export function ProducaoPage({ products, salesOrders, onGenerateRequisitionFromOP, initialDetailId, onConsumeInitialDetail }: ProducaoPageProps) {
  const confirmAction = useConfirm()
  const [rows, setRows] = useState<ProductionOrderListRow[]>([])
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<ProductionOrderFormData>(EMPTY_PRODUCTION_ORDER_FORM())
  const [saving, setSaving] = useState(false)
  const [selectedSalesOrderId, setSelectedSalesOrderId] = useState('')

  const [detailOpen, setDetailOpen] = useState(() => !!initialDetailId)
  const [detail, setDetail] = useState<ProductionOrderRecord | null>(null)
  const [detailLoading, setDetailLoading] = useState(() => !!initialDetailId)
  const [statusChanging, setStatusChanging] = useState(false)
  const [produceQty, setProduceQty] = useState(0)
  const [producing, setProducing] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('page', String(page))
      params.set('limit', String(PAGE_SIZE))
      const r = await fetch(`/api/production-orders?${params}`)
      if (r.ok) {
        const json = await r.json()
        setRows(json.data || [])
        setTotal(json.total || 0)
      }
    } catch {
      toast.error('Erro ao carregar ordens de produção')
    } finally {
      setLoading(false)
    }
  }, [page])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!initialDetailId) return
    fetchDetail(initialDetailId).then((full) => {
      setDetail(full)
      setProduceQty(full ? Math.max(0, full.quantity - full.quantityCompleted) : 0)
      setDetailLoading(false)
    })
    onConsumeInitialDetail?.()
  }, [initialDetailId, onConsumeInitialDetail])

  function openNew() {
    setEditingId(null)
    setSelectedSalesOrderId('')
    setForm(EMPTY_PRODUCTION_ORDER_FORM())
    setDialogOpen(true)
  }

  function openEdit(row: ProductionOrderListRow) {
    setEditingId(row.id)
    setSelectedSalesOrderId('')
    setForm(productionOrderToFormData(row))
    setDialogOpen(true)
  }

  function pickSalesOrderItem(salesOrderId: string, itemId: string) {
    const so = salesOrders.find((s) => s.id === salesOrderId)
    const item = so?.items?.find((i) => i.id === itemId)
    if (!item) return
    setForm((prev) => ({
      ...prev,
      productId: item.productId || '',
      productName: item.description || '',
      quantity: item.quantity || 1,
      unit: item.unit || 'UN',
      salesOrderId,
    }))
  }

  async function save() {
    setSaving(true)
    try {
      const url = editingId ? `/api/production-orders/${editingId}` : '/api/production-orders'
      const method = editingId ? 'PUT' : 'POST'
      const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      if (r.ok) {
        toast.success(editingId ? 'Ordem atualizada!' : 'Ordem criada!')
        setDialogOpen(false)
        load()
        if (editingId && detail?.id === editingId) setDetail(await fetchDetail(editingId))
      } else {
        const err = await r.json()
        toast.error(err.error || 'Erro ao salvar ordem')
      }
    } catch {
      toast.error('Erro ao salvar ordem')
    } finally {
      setSaving(false)
    }
  }

  async function remove(id: string) {
    if (!(await confirmAction({ description: 'Deseja realmente excluir esta ordem de produção?', destructive: true }))) return
    try {
      const r = await fetch(`/api/production-orders/${id}`, { method: 'DELETE' })
      if (r.ok) {
        toast.success('Ordem excluída!')
        load()
      } else {
        const err = await r.json()
        toast.error(err.error || 'Erro ao excluir')
      }
    } catch {
      toast.error('Erro ao excluir')
    }
  }

  async function fetchDetail(id: string): Promise<ProductionOrderRecord | null> {
    try {
      const r = await fetch(`/api/production-orders/${id}`)
      if (!r.ok) {
        toast.error('Erro ao carregar ordem de produção')
        return null
      }
      return await r.json()
    } catch {
      toast.error('Erro ao carregar ordem de produção')
      return null
    }
  }

  async function openDetail(row: ProductionOrderListRow) {
    setDetailOpen(true)
    setDetailLoading(true)
    const full = await fetchDetail(row.id)
    setDetail(full)
    setProduceQty(full ? Math.max(0, full.quantity - full.quantityCompleted) : 0)
    setDetailLoading(false)
  }

  async function changeStatus(id: string, status: string) {
    setStatusChanging(true)
    try {
      const r = await fetch(`/api/production-orders/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
      })
      if (r.ok) {
        toast.success('Status atualizado!')
        load()
        const full = await fetchDetail(id)
        setDetail(full)
        if (full) setProduceQty(Math.max(0, full.quantity - full.quantityCompleted))
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

  async function registerProduction() {
    if (!detail) return
    if (produceQty <= 0) {
      toast.error('Informe uma quantidade maior que zero')
      return
    }
    setProducing(true)
    try {
      const r = await fetch(`/api/production-orders/${detail.id}/produce`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity: produceQty, clientRequestId: crypto.randomUUID() }),
      })
      if (r.ok) {
        toast.success('Produção registrada!')
        load()
        const full = await fetchDetail(detail.id)
        setDetail(full)
        if (full) setProduceQty(Math.max(0, full.quantity - full.quantityCompleted))
      } else {
        const err = await r.json()
        toast.error(err.error || 'Erro ao registrar produção')
      }
    } catch {
      toast.error('Erro ao registrar produção')
    } finally {
      setProducing(false)
    }
  }

  const columns: DataTableColumn<ProductionOrderListRow>[] = [
    { id: 'number', header: 'Número', cell: (o) => <span className="font-mono font-medium text-primary">{o.number}</span> },
    { id: 'product', header: 'Produto', cell: (o) => o.product?.name || o.productName || '-' },
    { id: 'quantity', header: 'Quantidade', cell: (o) => `${o.quantity} ${o.unit}` },
    { id: 'status', header: 'Status', cell: (o) => <StatusBadge domain="productionOrder" status={o.status} label={PRODUCTION_ORDER_STATUS_LABELS[o.status] || o.status} /> },
    { id: 'dueDate', header: 'Prazo', cell: (o) => o.dueDate || '-', hideBelow: 'sm' },
  ]

  const currentTransitions = detail ? (PRODUCTION_ORDER_TRANSITIONS[detail.status] || []) : []
  const canProduce = detail ? ['planned', 'in_progress', 'paused'].includes(detail.status) : false
  const outstanding = detail ? Math.max(0, detail.quantity - detail.quantityCompleted) : 0
  const progressPct = detail && detail.quantity > 0 ? Math.min(100, Math.round((detail.quantityCompleted / detail.quantity) * 100)) : 0

  return (
    <div className="space-y-4">
      <PageHeader title="Ordens de Produção" actions={<Button onClick={openNew}><Plus className="w-4 h-4" /> Nova OP</Button>} />

      <DataTable
        columns={columns}
        rows={rows}
        getRowId={(o) => o.id}
        loading={loading}
        emptyMessage="Nenhuma ordem de produção encontrada"
        rowActions={[
          { label: 'Ver detalhes', icon: <Eye />, onClick: (o) => openDetail(o) },
          { label: 'PDF', icon: <FileOutput />, onClick: (o) => window.open(`/api/production-orders/${o.id}/pdf`, '_blank') },
          { label: 'Gerar requisição de matéria-prima', icon: <Package />, onClick: (o) => onGenerateRequisitionFromOP(o.id) },
          { label: 'Editar', icon: <Edit />, onClick: (o) => openEdit(o) },
          { label: 'Excluir', icon: <Trash2 />, variant: 'destructive', onClick: (o) => remove(o.id), disabled: (o) => o.quantityCompleted > 0 },
        ]}
        pagination={{ page, pageSize: PAGE_SIZE, total, onPageChange: setPage }}
      />

      <FormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={editingId ? 'Editar Ordem de Produção' : 'Nova Ordem de Produção'}
        maxWidth="sm:max-w-3xl"
        onSave={save}
        saving={saving}
      >
        <ProducaoFormFields
          form={form}
          onChange={setForm}
          products={products}
          salesOrders={salesOrders}
          isEditing={editingId !== null}
          selectedSalesOrderId={selectedSalesOrderId}
          onSelectedSalesOrderChange={setSelectedSalesOrderId}
          onPickSalesOrderItem={pickSalesOrderItem}
        />
      </FormDialog>

      <DetailDrawer
        open={detailOpen}
        onOpenChange={setDetailOpen}
        title={detail ? `OP ${detail.number}` : 'Ordem de Produção'}
        description={detail?.product?.name || detail?.productName}
      >
        {detailLoading || !detail ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs">Status</Label>
              {currentTransitions.length > 0 ? (
                <Select value={detail.status} disabled={statusChanging} onValueChange={(v) => changeStatus(detail.id, v)}>
                  <SelectTrigger className="w-full"><SelectValue><StatusBadge domain="productionOrder" status={detail.status} label={PRODUCTION_ORDER_STATUS_LABELS[detail.status] || detail.status} /></SelectValue></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={detail.status}>{PRODUCTION_ORDER_STATUS_LABELS[detail.status]}</SelectItem>
                    {currentTransitions.map((s) => <SelectItem key={s} value={s}>{PRODUCTION_ORDER_STATUS_LABELS[s]}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <div><StatusBadge domain="productionOrder" status={detail.status} label={PRODUCTION_ORDER_STATUS_LABELS[detail.status] || detail.status} /></div>
              )}
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Produzido</span>
                <span>{detail.quantityCompleted} / {detail.quantity} {detail.unit} ({progressPct}%)</span>
              </div>
              <Progress value={progressPct} />
            </div>

            {canProduce && (
              <div className="border rounded-lg p-3 space-y-2">
                <Label className="text-xs font-semibold">Registrar produção desta rodada</Label>
                <p className="text-xs text-muted-foreground">Saldo restante: {outstanding} {detail.unit}</p>
                <div className="flex gap-2 items-end">
                  <div className="flex-1"><QuantityInput min={0.01} max={outstanding} value={produceQty} onChange={setProduceQty} /></div>
                  <AsyncButton onClick={registerProduction} loading={producing}>Produzir</AsyncButton>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div><Label className="text-xs">Prioridade</Label><p>{detail.priority}</p></div>
              <div><Label className="text-xs">Prazo</Label><p>{detail.dueDate || '-'}</p></div>
            </div>
            {detail.description && (
              <div className="text-sm"><Label className="text-xs">Descrição</Label><p className="whitespace-pre-wrap">{detail.description}</p></div>
            )}
            {detail.notes && (
              <div className="text-sm"><Label className="text-xs">Observações</Label><p className="whitespace-pre-wrap">{detail.notes}</p></div>
            )}

            {detail.requisitions.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs">Requisições vinculadas</Label>
                <div className="space-y-1">
                  {detail.requisitions.map((r) => (
                    <div key={r.id} className="flex justify-between text-sm border rounded px-3 py-1.5">
                      <span className="font-mono">{r.number}</span>
                      <span className="text-muted-foreground">{r.status}</span>
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
