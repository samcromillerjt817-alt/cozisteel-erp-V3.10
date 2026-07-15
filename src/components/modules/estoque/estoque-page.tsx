'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Eye, SlidersHorizontal } from 'lucide-react'
import { PageHeader } from '@/components/platform/page-header'
import { FilterBar } from '@/components/platform/filter-bar'
import { DataTable, type DataTableColumn } from '@/components/platform/data-table'
import { StatusBadge } from '@/components/domain/status-badge'
import { SearchInput } from '@/components/domain/search-input'
import { FormDialog } from '@/components/domain/form-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { QuantityInput } from '@/components/form/quantity-input'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { STOCK_MOVEMENT_TYPE_LABELS, type StockSummaryItem, type StockMovementRow, type StockAdjustForm } from './types'

const MOVEMENT_PAGE_SIZE = 20

/**
 * Módulo Estoque (Fase 11.5, Subetapa 11.5.12) — o mais simples dos 3 desta subetapa: nenhum estado
 * compartilhado com outro módulo (autocontido), sem máquina de estados/transição de status.
 *
 * 2 achados fechados nesta migração: (1) os dois efeitos que disparavam `loadMovements()` ao entrar na
 * aba "Movimentações" (um no `useEffect` de troca de aba/filtro, outro no gatilho cross-module de
 * Produção) podiam disparar a mesma busca duas vezes seguidas no mesmo mount — agora há só um `load()`
 * por aba, cada um com seu próprio efeito único. (2) `stockService.summary()` não pagina (retorna todo o
 * conjunto filtrado de uma vez) — comportamento preexistente mantido como está nesta migração (mudança
 * de contrato do backend fica fora do escopo de uma migração puramente estrutural de UI).
 */
export function EstoquePage() {
  const [view, setView] = useState<'saldo' | 'movimentacoes'>('saldo')

  const [summary, setSummary] = useState<StockSummaryItem[]>([])
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [typeFilter, setTypeFilter] = useState<'all' | 'material' | 'product'>('all')
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search)
  const [lowOnly, setLowOnly] = useState(false)

  const [movements, setMovements] = useState<StockMovementRow[]>([])
  const [movementsLoading, setMovementsLoading] = useState(false)
  const [movementFilter, setMovementFilter] = useState<{ itemType: string; itemId: string; itemName: string }>({ itemType: '', itemId: '', itemName: '' })
  const [movementPage, setMovementPage] = useState(1)
  const [movementTotal, setMovementTotal] = useState(0)

  const [adjustDialogOpen, setAdjustDialogOpen] = useState(false)
  const [adjustForm, setAdjustForm] = useState<StockAdjustForm>({ itemType: '', itemId: '', itemName: '', currentQty: 0, unit: '', newQuantity: 0, reason: '' })
  const [adjustSaving, setAdjustSaving] = useState(false)

  const loadSummary = useCallback(async () => {
    setSummaryLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('type', typeFilter)
      if (debouncedSearch) params.set('search', debouncedSearch)
      if (lowOnly) params.set('lowStockOnly', 'true')
      const r = await fetch(`/api/stock/summary?${params}`)
      if (r.ok) setSummary((await r.json()) || [])
    } catch {
      toast.error('Erro ao carregar estoque')
    } finally {
      setSummaryLoading(false)
    }
  }, [typeFilter, debouncedSearch, lowOnly])

  const loadMovements = useCallback(async () => {
    setMovementsLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('page', String(movementPage))
      params.set('limit', String(MOVEMENT_PAGE_SIZE))
      if (movementFilter.itemType) params.set('itemType', movementFilter.itemType)
      if (movementFilter.itemType === 'material' && movementFilter.itemId) params.set('materialId', movementFilter.itemId)
      if (movementFilter.itemType === 'product' && movementFilter.itemId) params.set('productId', movementFilter.itemId)
      const r = await fetch(`/api/stock/movements?${params}`)
      if (r.ok) {
        const json = await r.json()
        setMovements(json.data || [])
        setMovementTotal(json.total || 0)
      }
    } catch {
      toast.error('Erro ao carregar histórico de movimentações')
    } finally {
      setMovementsLoading(false)
    }
  }, [movementFilter, movementPage])

  useEffect(() => {
    if (view === 'saldo') loadSummary()
  }, [view, loadSummary])

  useEffect(() => {
    if (view === 'movimentacoes') loadMovements()
  }, [view, loadMovements])

  useEffect(() => {
    setMovementPage(1)
  }, [movementFilter])

  function openAdjustDialog(item: StockSummaryItem) {
    setAdjustForm({ itemType: item.itemType, itemId: item.id, itemName: item.name, currentQty: item.stockQty, unit: item.unit, newQuantity: item.stockQty, reason: '' })
    setAdjustDialogOpen(true)
  }

  async function saveAdjustment() {
    if (!adjustForm.reason.trim()) { toast.error('Informe o motivo do ajuste'); return }
    setAdjustSaving(true)
    try {
      const r = await fetch('/api/stock/adjust', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemType: adjustForm.itemType, itemId: adjustForm.itemId, newQuantity: adjustForm.newQuantity, reason: adjustForm.reason }),
      })
      if (r.ok) {
        toast.success('Estoque ajustado!')
        setAdjustDialogOpen(false)
        loadSummary()
      } else {
        const err = await r.json()
        toast.error(err.error || 'Erro ao ajustar estoque')
      }
    } catch {
      toast.error('Erro ao ajustar estoque')
    } finally {
      setAdjustSaving(false)
    }
  }

  function openHistoryFor(item: StockSummaryItem) {
    setMovementFilter({ itemType: item.itemType, itemId: item.id, itemName: item.name })
    setView('movimentacoes')
  }

  const summaryColumns: DataTableColumn<StockSummaryItem>[] = [
    { id: 'itemType', header: 'Tipo', cell: (item) => <Badge variant="outline">{item.itemType === 'material' ? 'Matéria-prima' : 'Produto'}</Badge> },
    { id: 'name', header: 'Item', cell: (item) => <span className="font-medium">{item.name}</span> },
    { id: 'stockQty', header: 'Saldo Atual', align: 'right', cell: (item) => <span className={`font-mono ${item.isLow ? 'text-destructive font-bold' : ''}`}>{item.stockQty}</span> },
    { id: 'minStockQty', header: 'Estoque Mínimo', align: 'right', cell: (item) => <span className="font-mono text-muted-foreground">{item.minStockQty}</span>, hideBelow: 'sm' },
    { id: 'unit', header: 'Unid.', cell: (item) => item.unit, hideBelow: 'sm' },
  ]

  const movementColumns: DataTableColumn<StockMovementRow>[] = [
    { id: 'createdAt', header: 'Data', cell: (mv) => <span className="whitespace-nowrap">{new Date(mv.createdAt).toLocaleString('pt-BR')}</span> },
    { id: 'item', header: 'Item', cell: (mv) => mv.material?.name || mv.product?.name || '-' },
    { id: 'type', header: 'Tipo', cell: (mv) => <StatusBadge domain="stockMovement" status={mv.type} label={STOCK_MOVEMENT_TYPE_LABELS[mv.type] || mv.type} /> },
    { id: 'quantity', header: 'Quantidade', align: 'right', cell: (mv) => <span className="font-mono">{mv.quantity}</span> },
    { id: 'balanceAfter', header: 'Saldo Após', align: 'right', cell: (mv) => <span className="font-mono">{mv.balanceAfter}</span>, hideBelow: 'md' },
    { id: 'reason', header: 'Motivo', cell: (mv) => mv.reason, hideBelow: 'md' },
    { id: 'user', header: 'Usuário', cell: (mv) => mv.user?.name || '-', hideBelow: 'lg' },
  ]

  return (
    <div className="space-y-4">
      <PageHeader
        title="Estoque"
        description="Saldo disponível de matéria-prima e produto acabado, e histórico de movimentações."
        actions={
          <Tabs value={view} onValueChange={(v) => setView(v as 'saldo' | 'movimentacoes')}>
            <TabsList>
              <TabsTrigger value="saldo">Saldo Atual</TabsTrigger>
              <TabsTrigger value="movimentacoes">Movimentações</TabsTrigger>
            </TabsList>
          </Tabs>
        }
      />

      {view === 'saldo' && (
        <>
          <FilterBar onClear={() => { setSearch(''); setTypeFilter('all'); setLowOnly(false) }}>
            <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as 'all' | 'material' | 'product')}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os itens</SelectItem>
                <SelectItem value="material">Somente Matéria-prima</SelectItem>
                <SelectItem value="product">Somente Produto acabado</SelectItem>
              </SelectContent>
            </Select>
            <SearchInput value={search} onChange={setSearch} placeholder="Buscar item..." />
            <div className="flex items-center gap-2 px-3 border rounded-md h-9">
              <input type="checkbox" id="lowOnly" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} />
              <Label htmlFor="lowOnly" className="text-sm whitespace-nowrap">Só estoque baixo</Label>
            </div>
          </FilterBar>

          <DataTable
            columns={summaryColumns}
            rows={summary}
            getRowId={(item) => `${item.itemType}-${item.id}`}
            loading={summaryLoading}
            emptyMessage="Nenhum item encontrado"
            rowActions={[
              { label: 'Ver histórico', icon: <Eye />, onClick: openHistoryFor },
              { label: 'Ajustar estoque', icon: <SlidersHorizontal />, onClick: openAdjustDialog },
            ]}
          />
        </>
      )}

      {view === 'movimentacoes' && (
        <>
          {movementFilter.itemId && (
            <div className="text-sm text-muted-foreground">
              Filtrando por: <strong>{movementFilter.itemName}</strong>{' '}
              <Button variant="link" className="h-auto p-0 text-sm" onClick={() => setMovementFilter({ itemType: '', itemId: '', itemName: '' })}>(limpar filtro)</Button>
            </div>
          )}

          <DataTable
            columns={movementColumns}
            rows={movements}
            getRowId={(mv) => mv.id}
            loading={movementsLoading}
            emptyMessage="Nenhuma movimentação encontrada"
            pagination={{ page: movementPage, pageSize: MOVEMENT_PAGE_SIZE, total: movementTotal, onPageChange: setMovementPage }}
          />
        </>
      )}

      <FormDialog
        open={adjustDialogOpen}
        onOpenChange={setAdjustDialogOpen}
        title={`Ajustar Estoque — ${adjustForm.itemName}`}
        onSave={saveAdjustment}
        saving={adjustSaving}
        saveLabel="Confirmar Ajuste"
      >
        <div className="space-y-4">
          <div className="flex justify-between text-sm bg-muted/50 rounded p-3">
            <span>Saldo atual do sistema</span>
            <span className="font-mono font-semibold">{adjustForm.currentQty} {adjustForm.unit}</span>
          </div>
          <div className="space-y-1.5">
            <Label>Novo saldo (contagem física)</Label>
            <QuantityInput value={adjustForm.newQuantity} onChange={(v) => setAdjustForm({ ...adjustForm, newQuantity: v })} />
          </div>
          <div className="space-y-1.5">
            <Label>Motivo do ajuste</Label>
            <Textarea rows={3} placeholder="Ex: Contagem de inventário mensal, divergência encontrada..." value={adjustForm.reason} onChange={(e) => setAdjustForm({ ...adjustForm, reason: e.target.value })} />
          </div>
          {adjustForm.newQuantity !== adjustForm.currentQty && (
            <p className="text-sm text-muted-foreground">
              Diferença: <span className={adjustForm.newQuantity > adjustForm.currentQty ? 'text-emerald-600 font-semibold' : 'text-destructive font-semibold'}>
                {adjustForm.newQuantity > adjustForm.currentQty ? '+' : ''}{(adjustForm.newQuantity - adjustForm.currentQty).toFixed(2)} {adjustForm.unit}
              </span>
            </p>
          )}
        </div>
      </FormDialog>
    </div>
  )
}
