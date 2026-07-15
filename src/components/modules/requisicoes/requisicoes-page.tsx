'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Plus, Users, FileOutput, Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/platform/page-header'
import { FilterBar } from '@/components/platform/filter-bar'
import { DataTable, type DataTableColumn } from '@/components/platform/data-table'
import { DetailDrawer } from '@/components/platform/detail-drawer'
import { FormDialog } from '@/components/domain/form-dialog'
import { StatusBadge } from '@/components/domain/status-badge'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { useConfirm } from '@/components/domain/confirm-dialog'
import { useActionResult } from '@/components/domain/action-result-dialog'
import { RequisicaoFormFields } from './requisicao-form-fields'
import { RequisicaoCotacao } from './requisicao-cotacao'
import {
  REQUISITION_STATUS_LABELS, REQUISITION_TRANSITIONS, EMPTY_REQUISITION_FORM, EMPTY_REQUISITION_ITEM, EMPTY_QUOTE_DRAFT,
  type RequisitionListRow, type RequisitionRecord, type RequisitionFormData, type NewQuoteDraft,
} from './types'

interface ProductionOrderOption { id: string; number: string; productName: string }
interface MaterialOption { id: string; name: string }
interface SupplierOption { id: string; corporateName: string; tradeName: string }

interface RequisicoesPageProps {
  materialsFull: MaterialOption[]
  suppliers: SupplierOption[]
  productionOrders: ProductionOrderOption[]
  /** Disparo cross-module: o módulo Produção pede para abrir "Nova Requisição" já sugerida a partir
   * de uma OP específica ("Gerar requisição de matéria-prima" na listagem de Ordens de Produção).
   * `page.tsx` é quem guarda esse estado (não é deste módulo) — `RequisicoesPage` só reage a ele e
   * avisa quando já consumiu, sem nunca importar nada do módulo Produção. */
  pendingSuggestionFromOP?: string | null
  onConsumePendingSuggestion?: () => void
  /** Hardening pós-11.5, Prioridade 1 — quando um `purchaseOrderId` é informado, Compras abre o
   * `DetailDrawer` daquele registro direto, em vez de só trocar de aba. */
  onNavigateToCompras: (purchaseOrderId?: string) => void
}

const PAGE_SIZE = 20

/**
 * Módulo Requisições + Cotação (Fase 11.5, Subetapa 11.5.8 — drill-down pesado). A cotação, que era um
 * segundo `Dialog` aninhado aberto a partir da linha da tabela, vira o `DetailDrawer` — mesma decisão
 * de design já aplicada a Compras: mudança de status também se move para dentro do painel de detalhe
 * (era um `Select` inline na linha da tabela), estabelecendo um único padrão de interação para os 3
 * módulos de drill-down pesado desta subetapa.
 */
export function RequisicoesPage({ materialsFull, suppliers, productionOrders, pendingSuggestionFromOP, onConsumePendingSuggestion, onNavigateToCompras }: RequisicoesPageProps) {
  const confirmAction = useConfirm()
  const showActionResult = useActionResult()
  const [rows, setRows] = useState<RequisitionListRow[]>([])
  const [loading, setLoading] = useState(false)
  const [statusFilter, setStatusFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState<RequisitionFormData>(EMPTY_REQUISITION_FORM())
  const [saving, setSaving] = useState(false)

  const [detailOpen, setDetailOpen] = useState(false)
  const [detail, setDetail] = useState<RequisitionRecord | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [statusChanging, setStatusChanging] = useState(false)
  const [quoteDrafts, setQuoteDrafts] = useState<Record<string, NewQuoteDraft>>({})

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter !== 'all') params.set('status', statusFilter)
      params.set('page', String(page))
      params.set('limit', String(PAGE_SIZE))
      const r = await fetch(`/api/requisitions?${params}`)
      if (r.ok) {
        const json = await r.json()
        setRows(json.data || [])
        setTotal(json.total || 0)
      }
    } catch {
      toast.error('Erro ao carregar requisições')
    } finally {
      setLoading(false)
    }
  }, [statusFilter, page])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!pendingSuggestionFromOP) return
    suggestFromProductionOrder(pendingSuggestionFromOP)
    setDialogOpen(true)
    onConsumePendingSuggestion?.()
  }, [pendingSuggestionFromOP])

  function handleStatusFilterChange(value: string) {
    setStatusFilter(value)
    setPage(1)
  }

  function openNew() {
    setForm(EMPTY_REQUISITION_FORM())
    setDialogOpen(true)
  }

  async function suggestFromProductionOrder(poId: string) {
    if (!poId) return
    try {
      const r = await fetch('/api/requisitions/suggest', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productionOrderId: poId }),
      })
      const json = await r.json()
      if (!r.ok) {
        toast.error(json.error || 'Erro ao calcular sugestão')
        return
      }
      if (!json.items || json.items.length === 0) {
        toast.success(json.message || 'Nenhuma matéria-prima faltando para esta OP (estoque suficiente)')
        setForm({ productionOrderId: poId, neededBy: '', notes: '', items: [EMPTY_REQUISITION_ITEM()] })
        return
      }
      setForm({
        productionOrderId: poId,
        neededBy: '',
        notes: `Sugerido automaticamente a partir da OP (produto: ${json.productName || ''})`,
        items: json.items.map((i: { materialId: string; suggestedSupplierId?: string; missingQty: number; unit: string; estimatedPrice?: number }) => ({
          materialId: i.materialId, supplierId: i.suggestedSupplierId || '', quantity: i.missingQty,
          unit: i.unit, estimatedPrice: i.estimatedPrice || 0, notes: '',
        })),
      })
      toast.success('Sugestão calculada a partir da OP!')
    } catch {
      toast.error('Erro ao calcular sugestão')
    }
  }

  async function save() {
    const validItems = form.items.filter((i) => i.materialId && i.quantity > 0)
    if (validItems.length === 0) {
      toast.error('Adicione ao menos um item válido (matéria-prima + quantidade)')
      return
    }
    setSaving(true)
    try {
      const r = await fetch('/api/requisitions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productionOrderId: form.productionOrderId || undefined,
          originModule: form.productionOrderId ? 'production_order' : 'manual',
          neededBy: form.neededBy, notes: form.notes,
          items: validItems.map((i) => ({ ...i, supplierId: i.supplierId || undefined })),
        }),
      })
      if (r.ok) {
        toast.success('Requisição criada!')
        setDialogOpen(false)
        load()
      } else {
        const err = await r.json()
        toast.error(err.error || 'Erro ao criar requisição')
      }
    } catch {
      toast.error('Erro ao criar requisição')
    } finally {
      setSaving(false)
    }
  }

  async function remove(id: string) {
    if (!(await confirmAction({ description: 'Deseja realmente excluir esta requisição?', destructive: true }))) return
    try {
      const r = await fetch(`/api/requisitions/${id}`, { method: 'DELETE' })
      if (r.ok) {
        toast.success('Requisição excluída!')
        load()
      } else {
        const err = await r.json()
        toast.error(err.error || 'Erro ao excluir')
      }
    } catch {
      toast.error('Erro ao excluir')
    }
  }

  async function fetchDetail(id: string): Promise<RequisitionRecord | null> {
    try {
      const r = await fetch(`/api/requisitions/${id}`)
      if (!r.ok) {
        toast.error('Erro ao carregar requisição')
        return null
      }
      return await r.json()
    } catch {
      toast.error('Erro ao carregar requisição')
      return null
    }
  }

  // Reseta os rascunhos de cotação ao trocar de requisição — corrige o achado da auditoria (Subetapa
  // 11.5.8): o estado antigo, indexado por itemId, nunca era limpo entre uma requisição e outra, então
  // um rascunho digitado numa requisição podia reaparecer em outra se os ids de item colidissem.
  async function openDetail(row: RequisitionListRow) {
    setDetailOpen(true)
    setDetailLoading(true)
    setQuoteDrafts({})
    const full = await fetchDetail(row.id)
    setDetail(full)
    setDetailLoading(false)
  }

  async function reloadDetail() {
    if (!detail) return
    const full = await fetchDetail(detail.id)
    setDetail(full)
  }

  async function changeStatus(id: string, status: string) {
    setStatusChanging(true)
    try {
      const r = await fetch(`/api/requisitions/${id}/status`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
      })
      if (r.ok) {
        const json = await r.json()
        const generated = json.generatedPurchaseOrders as Array<{ id: string; number: string }> | undefined
        if (generated && generated.length > 0) {
          showActionResult({
            title: 'Requisição avançada para compra',
            description: `${generated.length} Pedido(s) de Compra gerado(s): ${generated.map((o) => o.number).join(', ')}.`,
            actions: [
              {
                label: generated.length === 1 ? 'Abrir Pedido de Compra' : 'Ver Pedidos de Compra',
                onClick: () => onNavigateToCompras(generated.length === 1 ? generated[0].id : undefined),
                variant: 'default',
              },
              { label: 'Continuar em Requisições', onClick: () => {} },
            ],
          })
        } else {
          toast.success('Status atualizado!')
        }
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

  async function addQuote(itemId: string) {
    if (!detail) return
    const draft = quoteDrafts[itemId]
    if (!draft || !draft.supplierId || !draft.price) {
      toast.error('Preencha fornecedor e preço')
      return
    }
    try {
      const r = await fetch(`/api/requisitions/${detail.id}/items/${itemId}/quotes`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft),
      })
      if (r.ok) {
        toast.success('Cotação registrada!')
        setQuoteDrafts((prev) => ({ ...prev, [itemId]: EMPTY_QUOTE_DRAFT() }))
        reloadDetail()
      } else {
        const err = await r.json()
        toast.error(err.error || 'Erro ao registrar cotação')
      }
    } catch {
      toast.error('Erro ao registrar cotação')
    }
  }

  async function selectQuote(itemId: string, quoteId: string) {
    if (!detail) return
    try {
      const r = await fetch(`/api/requisitions/${detail.id}/items/${itemId}/quotes/${quoteId}/select`, { method: 'POST' })
      if (r.ok) {
        toast.success('Cotação vencedora selecionada!')
        reloadDetail()
      } else {
        const err = await r.json()
        toast.error(err.error || 'Erro ao selecionar cotação')
      }
    } catch {
      toast.error('Erro ao selecionar cotação')
    }
  }

  const columns: DataTableColumn<RequisitionListRow>[] = [
    { id: 'number', header: 'Número', cell: (req) => <span className="font-mono text-sm">{req.number}</span> },
    { id: 'date', header: 'Data', cell: (req) => req.date, hideBelow: 'sm' },
    { id: 'origin', header: 'Origem', cell: (req) => req.productionOrder ? `OP ${req.productionOrder.number}` : 'Manual', hideBelow: 'md' },
    { id: 'items', header: 'Itens', cell: (req) => req.items?.length || 0, align: 'center' },
    { id: 'status', header: 'Status', cell: (req) => <StatusBadge domain="requisition" status={req.status} label={REQUISITION_STATUS_LABELS[req.status] || req.status} /> },
  ]

  const currentTransitions = detail ? (REQUISITION_TRANSITIONS[detail.status] || []) : []

  return (
    <div className="space-y-4">
      <PageHeader title="Requisições de Matéria-Prima" actions={<Button onClick={openNew}><Plus className="w-4 h-4" /> Nova</Button>} />

      <FilterBar onClear={() => { setStatusFilter('all'); setPage(1) }}>
        <Select value={statusFilter} onValueChange={handleStatusFilterChange}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            {Object.entries(REQUISITION_STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
      </FilterBar>

      <DataTable
        columns={columns}
        rows={rows}
        getRowId={(req) => req.id}
        loading={loading}
        emptyMessage="Nenhuma requisição encontrada"
        rowActions={[
          { label: 'Cotar fornecedores', icon: <Users />, onClick: (req) => openDetail(req) },
          { label: 'PDF', icon: <FileOutput />, onClick: (req) => window.open(`/api/requisitions/${req.id}/pdf`, '_blank') },
          { label: 'Excluir', icon: <Trash2 />, variant: 'destructive', onClick: (req) => remove(req.id), disabled: (req) => req.status !== 'draft' },
        ]}
        pagination={{ page, pageSize: PAGE_SIZE, total, onPageChange: setPage }}
      />

      <FormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title="Nova Requisição de Matéria-Prima"
        maxWidth="sm:max-w-4xl"
        onSave={save}
        saving={saving}
      >
        <RequisicaoFormFields
          form={form}
          onChange={setForm}
          productionOrders={productionOrders}
          materialsFull={materialsFull}
          suppliers={suppliers}
          onSuggestFromProductionOrder={suggestFromProductionOrder}
        />
      </FormDialog>

      <DetailDrawer
        open={detailOpen}
        onOpenChange={setDetailOpen}
        title={detail ? `Cotação — ${detail.number}` : 'Cotação'}
      >
        {detailLoading || !detail ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs">Status</Label>
              {currentTransitions.length > 0 ? (
                <Select value={detail.status} disabled={statusChanging} onValueChange={(v) => changeStatus(detail.id, v)}>
                  <SelectTrigger className="w-full"><SelectValue><StatusBadge domain="requisition" status={detail.status} label={REQUISITION_STATUS_LABELS[detail.status] || detail.status} /></SelectValue></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={detail.status}>{REQUISITION_STATUS_LABELS[detail.status]}</SelectItem>
                    {currentTransitions.map((s) => <SelectItem key={s} value={s}>{REQUISITION_STATUS_LABELS[s]}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <div><StatusBadge domain="requisition" status={detail.status} label={REQUISITION_STATUS_LABELS[detail.status] || detail.status} /></div>
              )}
            </div>

            <RequisicaoCotacao
              requisition={detail}
              drafts={quoteDrafts}
              onDraftChange={(itemId, patch) => setQuoteDrafts((prev) => ({ ...prev, [itemId]: { ...(prev[itemId] || EMPTY_QUOTE_DRAFT()), ...patch } }))}
              onAddQuote={addQuote}
              onSelectQuote={selectQuote}
              suppliers={suppliers}
            />
          </div>
        )}
      </DetailDrawer>
    </div>
  )
}
