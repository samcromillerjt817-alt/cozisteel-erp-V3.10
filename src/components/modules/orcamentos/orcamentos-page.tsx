'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Plus, Edit, Copy, FileOutput, Image as ImageIcon, Truck, ShoppingCart, Trash2, X } from 'lucide-react'
import { PageHeader } from '@/components/platform/page-header'
import { FilterBar } from '@/components/platform/filter-bar'
import { DataTable, type DataTableColumn } from '@/components/platform/data-table'
import { FormDialog } from '@/components/domain/form-dialog'
import { StatusBadge } from '@/components/domain/status-badge'
import { SearchInput } from '@/components/domain/search-input'
import { useConfirm } from '@/components/domain/confirm-dialog'
import { useActionResult } from '@/components/domain/action-result-dialog'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { DatePicker } from '@/components/form/date-picker'
import { CurrencyInput } from '@/components/form/currency-input'
import { PercentInput } from '@/components/form/percent-input'
import { QuantityInput } from '@/components/form/quantity-input'
import { CepInput } from '@/components/form/cep-input'
import { CnpjInput } from '@/components/form/cnpj-input'
import { PhoneInput } from '@/components/form/phone-input'
import { EmailInput } from '@/components/form/email-input'
import { handleCepLookup, handleCnpjLookup } from '@/lib/cnpj-cep-lookup'
import { PAYMENT_TERMS_OPTIONS } from '@/lib/payment-terms'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { formatCurrency, statusLabels } from '@/lib/format'
import {
  QUOTE_TRANSITIONS, emptyQuoteItem, emptyQuoteForm,
  type QuoteItem, type QuoteFormData, type QuoteListRow, type ClientOption, type ProductOption,
} from './types'

const PAGE_SIZE = 20

interface OrcamentosPageProps {
  clients: ClientOption[]
  products: ProductOption[]
  /** Aprovar um orçamento gera Ordens de Produção; converter em Pedido de Venda gera um SalesOrder —
   * ambos catálogos compartilhados vivem em `page.tsx` (usados por Produção/Requisições) e precisam
   * ser recarregados fora deste módulo. Achado fechado nesta migração: `convertQuoteToOrder` nunca
   * disparava esse refresh antes — o Pedido de Venda recém-criado só aparecia no seletor de Produção
   * depois que o usuário saísse e voltasse pra aba. */
  onDataChanged: () => void
  /** Hardening pós-11.5, Prioridade 1 — quando um `pedidoId`/`productionOrderId` é informado, a página
   * de destino abre o `DetailDrawer` daquele registro direto, em vez de só trocar de aba (o usuário não
   * precisa mais procurar manualmente o registro recém-criado). */
  onNavigateToPedidos: (pedidoId?: string) => void
  onNavigateToProducao: (productionOrderId?: string) => void
}

/**
 * Módulo Orçamentos (Fase 11.5, Subetapa 11.5.12) — última e mais complexa migração da fase: CRUD
 * completo + grid de itens de largura fixa + duplicar + converter em Pedido de Venda + 2 PDFs.
 *
 * **3 achados fechados nesta migração**: (1) as abas de status filtravam só Rascunho/Enviado/
 * Aprovado/Rejeitado — Cancelado e Expirado nunca tinham aba própria, mesmo já existindo como status
 * reais (`statusLabels`, `status-tokens.ts`). (2) o `Select` de status na tabela listava todos os 6
 * status incondicionalmente — mesma classe de bug já corrigida em Compras/Requisições/Produção/
 * Pedidos, agora usando `QUOTE_TRANSITIONS` (espelha `ALLOWED_TRANSITIONS` de `quote.service.ts`).
 * (3) o resumo de totais dentro do formulário nunca somava o frete (`quoteSubtotal - quoteDiscount`),
 * mesmo o backend já somando `freightValue` no `total` persistido (bug de frete fechado antes, nesta
 * mesma subetapa, mas só no backend/PDF — o preview ao vivo do formulário ainda não refletia).
 */
export function OrcamentosPage({ clients, products, onDataChanged, onNavigateToPedidos, onNavigateToProducao }: OrcamentosPageProps) {
  const confirmAction = useConfirm()
  const showActionResult = useActionResult()

  const [rows, setRows] = useState<QuoteListRow[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search)
  const [statusFilter, setStatusFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [pendingStatusIds, setPendingStatusIds] = useState<Set<string>>(new Set())

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<QuoteFormData>(emptyQuoteForm())
  const [saving, setSaving] = useState(false)

  const runStatusChange = async (id: string, fn: () => Promise<void>) => {
    setPendingStatusIds((prev) => new Set(prev).add(id))
    try {
      await fn()
    } finally {
      setPendingStatusIds((prev) => { const next = new Set(prev); next.delete(id); return next })
    }
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (debouncedSearch) params.set('search', debouncedSearch)
      params.set('page', String(page))
      params.set('limit', String(PAGE_SIZE))
      const r = await fetch(`/api/quotes?${params}`)
      if (r.ok) {
        const json = await r.json()
        setRows(json.data || [])
        setTotal(json.total || 0)
      }
    } catch {
      toast.error('Erro ao carregar orçamentos')
    } finally {
      setLoading(false)
    }
  }, [statusFilter, debouncedSearch, page])

  useEffect(() => {
    load()
  }, [load])

  function handleSearchChange(value: string) {
    setSearch(value)
    setPage(1)
  }

  function handleStatusFilterChange(value: string) {
    setStatusFilter(value)
    setPage(1)
  }

  function openNew() {
    setEditingId(null)
    setForm(emptyQuoteForm())
    setDialogOpen(true)
  }

  function selectClient(clientId: string) {
    const c = clients.find((cl) => cl.id === clientId)
    if (!c) return
    setForm((prev) => ({
      ...prev,
      clientId,
      clientName: c.corporateName || c.tradeName || '',
      clientCnpj: c.cpfCnpj || '',
      clientContact: c.contactName || '',
      clientPhone: c.phone || c.contactPhone || '',
      clientEmail: c.email || '',
      clientAddress: [c.address, c.number].filter(Boolean).join(', '),
      clientNeighborhood: c.neighborhood || '',
      clientCep: c.zipCode || '',
    }))
  }

  async function openEdit(id: string) {
    try {
      const r = await fetch(`/api/quotes/${id}`)
      if (!r.ok) { toast.error('Erro ao carregar orçamento'); return }
      const q = await r.json()
      setEditingId(id)
      setForm({
        clientId: q.clientId || '', clientName: q.clientName || '', clientCnpj: q.clientCnpj || '',
        clientContact: q.clientContact || '', clientPhone: q.clientPhone || '', clientEmail: q.clientEmail || '',
        clientAddress: q.clientAddress || '', clientNeighborhood: q.clientNeighborhood || '', clientCep: q.clientCep || '',
        items: (q.items || []).length > 0 ? q.items : [emptyQuoteItem()],
        discountType: q.discountType || 'value', discountValue: q.discountValue || 0,
        freightMode: q.freightMode || 'combined', freightValue: q.freightValue || 0, freightText: q.freightText || 'A COMBINAR',
        paymentTerms: q.paymentTerms || '', warranty: q.warranty || '', validity: q.validity || '',
        deliveryTime: q.deliveryTime || '', notes: q.notes || '', status: q.status || 'draft',
      })
      setDialogOpen(true)
    } catch {
      toast.error('Erro ao carregar orçamento')
    }
  }

  async function save() {
    setSaving(true)
    try {
      const items = form.items.map((item, idx) => ({ ...item, total: item.quantity * item.unitPrice, order: item.order ?? idx }))
      const body = { ...form, items }
      const url = editingId ? `/api/quotes/${editingId}` : '/api/quotes'
      const method = editingId ? 'PUT' : 'POST'
      const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (r.ok) {
        toast.success(editingId ? 'Orçamento atualizado!' : 'Orçamento criado!')
        setDialogOpen(false)
        load()
      } else {
        const err = await r.json()
        toast.error(err.error || 'Erro ao salvar')
      }
    } catch {
      toast.error('Erro ao salvar orçamento')
    } finally {
      setSaving(false)
    }
  }

  async function duplicateQuote(id: string) {
    try {
      const r = await fetch(`/api/quotes/${id}/duplicate`, { method: 'POST' })
      if (r.ok) { toast.success('Orçamento duplicado!'); load() }
      else toast.error('Erro ao duplicar')
    } catch {
      toast.error('Erro ao duplicar')
    }
  }

  async function changeStatus(id: string, status: string) {
    await runStatusChange(id, async () => {
      try {
        const r = await fetch(`/api/quotes/${id}/status`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
        })
        const json = await r.json()
        if (!r.ok) { toast.error(json.error || 'Erro ao alterar status'); return }
        const generated = json.generatedProductionOrders as Array<{ id: string; number: string }> | undefined
        if (generated && generated.length > 0) {
          showActionResult({
            title: 'Orçamento aprovado',
            description: `${generated.length} Ordem(ns) de Produção gerada(s): ${generated.map((o) => o.number).join(', ')}.`,
            actions: [
              {
                label: generated.length === 1 ? 'Abrir Ordem de Produção' : 'Ver Ordens de Produção',
                onClick: () => onNavigateToProducao(generated.length === 1 ? generated[0].id : undefined),
                variant: 'default',
              },
              { label: 'Continuar em Orçamentos', onClick: () => {} },
            ],
          })
        } else {
          toast.success('Status atualizado!')
        }
        load()
        onDataChanged()
      } catch {
        toast.error('Erro ao alterar status')
      }
    })
  }

  async function convertToOrder(id: string) {
    if (!(await confirmAction('Converter este orçamento aprovado em Pedido de Venda?'))) return
    await runStatusChange(id, async () => {
      try {
        const r = await fetch(`/api/quotes/${id}/convert-to-order`, { method: 'POST' })
        const json = await r.json()
        if (r.ok) {
          showActionResult({
            title: 'Pedido de Venda criado',
            description: `${json.number} foi gerado a partir deste orçamento.`,
            actions: [
              { label: 'Abrir Pedido', onClick: () => onNavigateToPedidos(json.id), variant: 'default' },
              { label: 'Voltar ao Orçamento', onClick: () => {} },
            ],
          })
          load()
          onDataChanged()
        } else {
          toast.error(json.error || 'Erro ao converter orçamento')
        }
      } catch {
        toast.error('Erro ao converter orçamento')
      }
    })
  }

  async function deleteQuote(id: string) {
    if (!(await confirmAction({ description: 'Deseja realmente excluir este orçamento?', destructive: true }))) return
    try {
      const r = await fetch(`/api/quotes/${id}`, { method: 'DELETE' })
      if (r.ok) { toast.success('Orçamento excluído!'); load() }
      else {
        const err = await r.json()
        toast.error(err.error || 'Erro ao excluir')
      }
    } catch {
      toast.error('Erro ao excluir')
    }
  }

  function updateItem(idx: number, field: keyof QuoteItem, value: unknown) {
    const items = [...form.items]
    items[idx] = { ...items[idx], [field]: value }
    if (field === 'quantity' || field === 'unitPrice') {
      items[idx].total = items[idx].quantity * items[idx].unitPrice
    }
    setForm({ ...form, items })
  }

  function selectItemProduct(idx: number, productId: string) {
    const items = [...form.items]
    const product = products.find((p) => p.id === productId)
    if (!product) return
    items[idx] = {
      ...items[idx],
      productId,
      code: product.internalCode || items[idx].code,
      description: product.name || items[idx].description,
      unit: product.unit || items[idx].unit || 'UN',
      unitPrice: product.salePrice || 0,
      weight: product.weight || items[idx].weight || 0,
    }
    items[idx].total = items[idx].quantity * items[idx].unitPrice
    setForm({ ...form, items })
  }

  function addItem() {
    setForm({ ...form, items: [...form.items, emptyQuoteItem()] })
  }

  function removeItem(idx: number) {
    const items = form.items.filter((_, i) => i !== idx)
    setForm({ ...form, items: items.length > 0 ? items : [emptyQuoteItem()] })
  }

  const columns: DataTableColumn<QuoteListRow>[] = [
    { id: 'number', header: 'Número', cell: (q) => <span className="font-mono font-medium text-primary">{q.number}</span> },
    { id: 'client', header: 'Cliente', cell: (q) => q.clientName || '-' },
    { id: 'date', header: 'Data', cell: (q) => q.date, hideBelow: 'sm' },
    { id: 'total', header: 'Valor', align: 'right', cell: (q) => <span className="font-mono">{formatCurrency(q.total)}</span> },
    {
      id: 'status', header: 'Status', cell: (q) => {
        const transitions = QUOTE_TRANSITIONS[q.status] || []
        return transitions.length > 0 ? (
          <Select value={q.status} disabled={pendingStatusIds.has(q.id)} onValueChange={(v) => changeStatus(q.id, v)}>
            <SelectTrigger className="w-36 h-8">
              <SelectValue><StatusBadge domain="quote" status={q.status} label={statusLabels[q.status] || q.status} /></SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={q.status}>{statusLabels[q.status]}</SelectItem>
              {transitions.map((s) => <SelectItem key={s} value={s}>{statusLabels[s]}</SelectItem>)}
            </SelectContent>
          </Select>
        ) : (
          <StatusBadge domain="quote" status={q.status} label={statusLabels[q.status] || q.status} />
        )
      },
    },
  ]

  const quoteSubtotal = form.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0)
  const quoteDiscount = form.discountType === 'percent' ? quoteSubtotal * ((form.discountValue || 0) / 100) : (form.discountValue || 0)
  const quoteFreight = form.freightValue || 0
  const quoteTotal = quoteSubtotal - quoteDiscount + quoteFreight

  return (
    <div className="space-y-4">
      <PageHeader
        title="Orçamentos"
        actions={<Button onClick={openNew}><Plus className="w-4 h-4 mr-1" /> Novo</Button>}
      />

      <FilterBar onClear={() => { setSearch(''); setStatusFilter('all'); setPage(1) }}>
        <SearchInput value={search} onChange={handleSearchChange} placeholder="Buscar orçamento..." />
      </FilterBar>

      <Tabs value={statusFilter} onValueChange={handleStatusFilterChange}>
        <TabsList>
          <TabsTrigger value="all">Todos</TabsTrigger>
          <TabsTrigger value="draft">Rascunho</TabsTrigger>
          <TabsTrigger value="sent">Enviado</TabsTrigger>
          <TabsTrigger value="approved">Aprovado</TabsTrigger>
          <TabsTrigger value="rejected">Rejeitado</TabsTrigger>
          <TabsTrigger value="cancelled">Cancelado</TabsTrigger>
          <TabsTrigger value="expired">Expirado</TabsTrigger>
        </TabsList>
      </Tabs>

      <DataTable
        columns={columns}
        rows={rows}
        getRowId={(q) => q.id}
        loading={loading}
        emptyMessage="Nenhum orçamento encontrado"
        rowActions={[
          {
            label: 'Converter em Pedido de Venda', icon: <ShoppingCart />, onClick: (q) => convertToOrder(q.id),
            disabled: (q) => q.status !== 'approved' || !!q.salesOrder || pendingStatusIds.has(q.id),
          },
          { label: 'Editar', icon: <Edit />, onClick: (q) => openEdit(q.id) },
          { label: 'Duplicar', icon: <Copy />, onClick: (q) => duplicateQuote(q.id) },
          { label: 'PDF Comercial', icon: <FileOutput />, onClick: (q) => window.open(`/api/quotes/${q.id}/pdf?variant=comercial`, '_blank') },
          { label: 'PDF Técnico (com foto)', icon: <ImageIcon />, onClick: (q) => window.open(`/api/quotes/${q.id}/pdf?variant=tecnico`, '_blank') },
          { label: 'Romaneio de Transporte (PDF)', icon: <Truck />, onClick: (q) => window.open(`/api/quotes/${q.id}/transport-pdf`, '_blank') },
          { label: 'Ver Pedido de Venda gerado', icon: <ShoppingCart />, onClick: (q) => onNavigateToPedidos(q.salesOrder?.id), disabled: (q) => !q.salesOrder },
          { label: 'Excluir', icon: <Trash2 />, onClick: (q) => deleteQuote(q.id), disabled: (q) => !!q.salesOrder, variant: 'destructive' },
        ]}
        pagination={{ page, pageSize: PAGE_SIZE, total, onPageChange: setPage }}
      />

      <FormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={editingId ? 'Editar Orçamento' : 'Novo Orçamento'}
        maxWidth="sm:max-w-6xl"
        onSave={save}
        saving={saving}
      >
        <div className="space-y-6">
          <div>
            <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wider">Dados do Cliente</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
                <Label>Cliente cadastrado</Label>
                <Select value={form.clientId || undefined} onValueChange={selectClient}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Selecionar um cliente já cadastrado (preenche os campos abaixo)" /></SelectTrigger>
                  <SelectContent>{clients.map((c) => <SelectItem key={c.id} value={c.id}>{(c.tradeName || c.corporateName) + (c.cpfCnpj ? ` — ${c.cpfCnpj}` : '')}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Nome / Razão Social</Label><Input value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} /></div>
              <div className="space-y-1.5">
                <Label>CNPJ / CPF</Label>
                <CnpjInput
                  value={form.clientCnpj}
                  onChange={(v) => setForm({ ...form, clientCnpj: v })}
                  onLookup={(cnpj) => handleCnpjLookup<QuoteFormData>(cnpj, setForm, { corporateName: 'clientName', address: 'clientAddress', neighborhood: 'clientNeighborhood', zipCode: 'clientCep', phone: 'clientPhone', email: 'clientEmail' }, toast)}
                />
              </div>
              <div className="space-y-1.5"><Label>Contato</Label><Input value={form.clientContact} onChange={(e) => setForm({ ...form, clientContact: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Telefone</Label><PhoneInput value={form.clientPhone} onChange={(v) => setForm({ ...form, clientPhone: v })} /></div>
              <div className="space-y-1.5"><Label>E-mail</Label><EmailInput value={form.clientEmail} onChange={(v) => setForm({ ...form, clientEmail: v })} /></div>
              <div className="space-y-1 sm:col-span-2 lg:col-span-2"><Label>Endereço</Label><Input value={form.clientAddress} onChange={(e) => setForm({ ...form, clientAddress: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Bairro</Label><Input value={form.clientNeighborhood} onChange={(e) => setForm({ ...form, clientNeighborhood: e.target.value })} /></div>
              <div className="space-y-1.5">
                <Label>CEP</Label>
                <CepInput value={form.clientCep} onChange={(v) => setForm({ ...form, clientCep: v })} onLookup={(cep) => handleCepLookup<QuoteFormData>(cep, setForm, { address: 'clientAddress', neighborhood: 'clientNeighborhood' })} />
              </div>
            </div>
          </div>

          <Separator />

          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Itens</h3>
              <Button variant="outline" size="sm" onClick={addItem}><Plus className="w-4 h-4 mr-1" /> Item</Button>
            </div>
            <div className="border rounded-lg overflow-x-auto">
              <div className="min-w-[900px]">
                <div className="grid grid-cols-[28px_200px_110px_1fr_100px_130px_120px_36px] gap-2 px-3 py-2 bg-muted/50 text-xs font-semibold text-muted-foreground uppercase tracking-wide border-b">
                  <span>#</span>
                  <span>Produto</span>
                  <span>Código</span>
                  <span>Descrição</span>
                  <span>Qtd</span>
                  <span>Valor Unit.</span>
                  <span className="text-right">Total</span>
                  <span></span>
                </div>
                {form.items.map((item, idx) => (
                  <div key={idx} className="grid grid-cols-[28px_200px_110px_1fr_100px_130px_120px_36px] gap-2 px-3 py-2 items-center border-b last:border-b-0">
                    <span className="text-muted-foreground text-xs">{idx + 1}</span>
                    <Select value={item.productId || undefined} onValueChange={(v) => selectItemProduct(idx, v)}>
                      <SelectTrigger className="w-full"><SelectValue placeholder="Avulso" /></SelectTrigger>
                      <SelectContent>{products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                    </Select>
                    <Input value={item.code} onChange={(e) => updateItem(idx, 'code', e.target.value)} />
                    <Input value={item.description} onChange={(e) => updateItem(idx, 'description', e.target.value)} />
                    <QuantityInput className="text-right" value={item.quantity} onChange={(v) => updateItem(idx, 'quantity', v)} />
                    <CurrencyInput value={item.unitPrice} onChange={(v) => updateItem(idx, 'unitPrice', v)} />
                    <span className="text-right font-mono text-sm">{formatCurrency(item.quantity * item.unitPrice)}</span>
                    <Button variant="ghost" size="icon" onClick={() => removeItem(idx)}><X className="w-4 h-4 text-destructive" /></Button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <Separator />

          <div>
            <h3 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wider">Condições</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="space-y-1.5">
                <Label>Desconto</Label>
                <div className="flex gap-2">
                  <Select value={form.discountType} onValueChange={(v) => setForm({ ...form, discountType: v })}>
                    <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="value">R$</SelectItem><SelectItem value="percent">%</SelectItem></SelectContent>
                  </Select>
                  {form.discountType === 'percent' ? (
                    <PercentInput className="flex-1 min-w-0" value={form.discountValue} onChange={(v) => setForm({ ...form, discountValue: v })} />
                  ) : (
                    <CurrencyInput className="flex-1 min-w-0" value={form.discountValue} onChange={(v) => setForm({ ...form, discountValue: v })} />
                  )}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Frete</Label>
                <Select value={form.freightMode} onValueChange={(v) => setForm({ ...form, freightMode: v })}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="combined">A combinar</SelectItem><SelectItem value="seller">Emitente</SelectItem><SelectItem value="buyer">Destinatário</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Valor Frete</Label>
                <CurrencyInput value={form.freightValue} onChange={(v) => setForm({ ...form, freightValue: v })} />
              </div>
              <div className="space-y-1.5">
                <Label>Observações Frete</Label>
                <Input value={form.freightText} onChange={(e) => setForm({ ...form, freightText: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Condição Pgto</Label>
                <Select value={form.paymentTerms || undefined} onValueChange={(v) => setForm({ ...form, paymentTerms: v })}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{PAYMENT_TERMS_OPTIONS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Garantia</Label><Input value={form.warranty} onChange={(e) => setForm({ ...form, warranty: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Validade</Label><DatePicker value={form.validity} onChange={(v) => setForm({ ...form, validity: v })} /></div>
              <div className="space-y-1.5"><Label>Prazo Entrega</Label><Input value={form.deliveryTime} onChange={(e) => setForm({ ...form, deliveryTime: e.target.value })} /></div>
            </div>
            <div className="mt-3 space-y-1.5">
              <Label>Observações</Label>
              <Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>

          <div className="flex justify-end">
            <div className="w-64 space-y-2 text-sm border rounded-lg p-4">
              <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="font-mono">{formatCurrency(quoteSubtotal)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Desconto</span><span className="font-mono text-destructive">- {formatCurrency(quoteDiscount)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Frete</span><span className="font-mono">+ {formatCurrency(quoteFreight)}</span></div>
              <Separator />
              <div className="flex justify-between font-bold text-lg"><span>Total</span><span className="font-mono text-primary">{formatCurrency(quoteTotal)}</span></div>
            </div>
          </div>
        </div>
      </FormDialog>
    </div>
  )
}
