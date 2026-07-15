'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/platform/page-header'
import { FilterBar } from '@/components/platform/filter-bar'
import { DataTable, type DataTableColumn } from '@/components/platform/data-table'
import { FormDialog } from '@/components/domain/form-dialog'
import { SearchInput } from '@/components/domain/search-input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { useConfirm } from '@/components/domain/confirm-dialog'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { formatCurrency } from '@/lib/format'
import { MaterialFormFields } from './material-form-fields'
import { MaterialLinksReadonly } from './material-links-readonly'
import { EMPTY_MATERIAL_FORM, materialToFormData, type MaterialRecord, type MaterialListRow, type MaterialFormData, type MaterialSupplierLink, type MaterialProductLink } from './types'

interface MateriaisPageProps {
  categories: { id: string; name: string }[]
  onCatalogChanged?: () => void
}

const PAGE_SIZE = 20

/**
 * Módulo Materiais — 4ª migração para o template oficial (Fase 11.5, Subetapa 11.5.7). Tem a
 * combinação de filtro mais rica encontrada na auditoria original (busca + categoria + checkbox de
 * estoque baixo) — os 3 controles convivem no mesmo `FilterBar`, sem componente de filtro próprio.
 */
export function MateriaisPage({ categories, onCatalogChanged }: MateriaisPageProps) {
  const confirmAction = useConfirm()
  const [rows, setRows] = useState<MaterialListRow[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search)
  const [categoryFilter, setCategoryFilter] = useState('')
  const [lowStockOnly, setLowStockOnly] = useState(false)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<MaterialFormData>(EMPTY_MATERIAL_FORM)
  const [detailSuppliers, setDetailSuppliers] = useState<MaterialSupplierLink[]>([])
  const [detailProducts, setDetailProducts] = useState<MaterialProductLink[]>([])
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (debouncedSearch) params.set('search', debouncedSearch)
      if (categoryFilter) params.set('categoryId', categoryFilter)
      if (lowStockOnly) params.set('lowStock', 'true')
      params.set('page', String(page))
      params.set('limit', String(PAGE_SIZE))
      const r = await fetch(`/api/materials?${params}`)
      if (r.ok) {
        const json = await r.json()
        setRows(json.data || [])
        setTotal(json.total || 0)
      }
    } catch {
      toast.error('Erro ao carregar matérias-primas')
    } finally {
      setLoading(false)
    }
  }, [debouncedSearch, categoryFilter, lowStockOnly, page])

  useEffect(() => {
    load()
  }, [load])

  function handleSearchChange(value: string) {
    setSearch(value)
    setPage(1)
  }

  function handleCategoryChange(value: string) {
    setCategoryFilter(value === 'all' ? '' : value)
    setPage(1)
  }

  function handleLowStockChange(checked: boolean) {
    setLowStockOnly(checked)
    setPage(1)
  }

  function openNew() {
    setEditingId(null)
    setForm(EMPTY_MATERIAL_FORM)
    setDetailSuppliers([])
    setDetailProducts([])
    setDialogOpen(true)
  }

  // Mesmo princípio da 11.5.6/11.5.7: registro completo por id, fonte única para formulário e
  // vínculos somente-leitura.
  async function openEdit(id: string) {
    try {
      const r = await fetch(`/api/materials/${id}`)
      if (!r.ok) {
        toast.error('Erro ao carregar matéria-prima')
        return
      }
      const material: MaterialRecord = await r.json()
      setEditingId(material.id)
      setForm(materialToFormData(material))
      setDetailSuppliers(material.suppliers || [])
      setDetailProducts(material.productMaterials || [])
      setDialogOpen(true)
    } catch {
      toast.error('Erro ao carregar matéria-prima')
    }
  }

  async function save() {
    setSaving(true)
    try {
      const url = editingId ? `/api/materials/${editingId}` : '/api/materials'
      const method = editingId ? 'PUT' : 'POST'
      const payload = { ...form, categoryId: form.categoryId || null }
      const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (r.ok) {
        toast.success(editingId ? 'Matéria-prima atualizada!' : 'Matéria-prima criada!')
        setDialogOpen(false)
        load()
        onCatalogChanged?.()
      } else {
        const err = await r.json()
        toast.error(err.error || 'Erro ao salvar matéria-prima')
      }
    } catch {
      toast.error('Erro ao salvar matéria-prima')
    } finally {
      setSaving(false)
    }
  }

  async function remove(id: string) {
    if (!(await confirmAction({ description: 'Deseja realmente excluir esta matéria-prima?', destructive: true }))) return
    try {
      const r = await fetch(`/api/materials/${id}`, { method: 'DELETE' })
      if (r.ok) {
        toast.success('Matéria-prima excluída!')
        load()
        onCatalogChanged?.()
      } else {
        const err = await r.json()
        toast.error(err.error || 'Erro ao excluir')
      }
    } catch {
      toast.error('Erro ao excluir')
    }
  }

  const columns: DataTableColumn<MaterialListRow>[] = [
    { id: 'internalCode', header: 'Código', cell: (m) => m.internalCode || '-', hideBelow: 'sm' },
    { id: 'name', header: 'Nome', cell: (m) => m.name },
    { id: 'category', header: 'Categoria', cell: (m) => m.category?.name || '-', hideBelow: 'md' },
    { id: 'stock', header: 'Estoque', cell: (m) => <span className={m.stockQty <= m.minStockQty ? 'font-mono font-bold text-destructive' : 'font-mono'}>{m.stockQty} {m.unit}</span>, align: 'right' },
    { id: 'cost', header: 'Custo', cell: (m) => formatCurrency(m.costPrice), align: 'right', hideBelow: 'md' },
    { id: 'suppliers', header: 'Fornecedores', cell: (m) => m._count?.suppliers ?? 0, align: 'right', hideBelow: 'lg' },
    { id: 'products', header: 'Produtos', cell: (m) => m._count?.products ?? 0, align: 'right', hideBelow: 'lg' },
  ]

  return (
    <div className="space-y-4">
      <PageHeader title="Matérias-Primas" actions={<Button onClick={openNew}><Plus className="w-4 h-4" /> Nova</Button>} />

      <FilterBar onClear={() => { setSearch(''); setCategoryFilter(''); setLowStockOnly(false); setPage(1) }}>
        <SearchInput value={search} onChange={handleSearchChange} placeholder="Buscar por nome ou código..." />
        <Select value={categoryFilter || 'all'} onValueChange={handleCategoryChange}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Categoria" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as categorias</SelectItem>
            {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-sm px-3 border rounded-md h-9">
          <input type="checkbox" checked={lowStockOnly} onChange={(e) => handleLowStockChange(e.target.checked)} />
          Só estoque baixo
        </label>
      </FilterBar>

      <DataTable
        columns={columns}
        rows={rows}
        getRowId={(m) => m.id}
        loading={loading}
        emptyMessage="Nenhuma matéria-prima cadastrada"
        rowActions={[
          { label: 'Editar', icon: <Pencil />, onClick: (m) => openEdit(m.id) },
          { label: 'Excluir', icon: <Trash2 />, variant: 'destructive', onClick: (m) => remove(m.id) },
        ]}
        pagination={{ page, pageSize: PAGE_SIZE, total, onPageChange: setPage }}
      />

      <FormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={editingId ? 'Editar Matéria-Prima' : 'Nova Matéria-Prima'}
        maxWidth="sm:max-w-3xl"
        onSave={save}
        saving={saving}
      >
        <MaterialFormFields form={form} onChange={setForm} categories={categories} />
        {editingId && <MaterialLinksReadonly suppliers={detailSuppliers} products={detailProducts} />}
      </FormDialog>
    </div>
  )
}
