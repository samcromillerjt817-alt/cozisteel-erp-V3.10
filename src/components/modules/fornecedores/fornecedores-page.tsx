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
import { useConfirm } from '@/components/domain/confirm-dialog'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { FornecedorFormFields } from './fornecedor-form-fields'
import { FornecedorMaterialLinks } from './fornecedor-material-links'
import { EMPTY_SUPPLIER_FORM, supplierToFormData, type SupplierRecord, type SupplierListRow, type SupplierFormData, type SupplierMaterialLink } from './types'

interface FornecedoresPageProps {
  /** Catálogo de matérias-primas para o seletor de vínculo — estado compartilhado (Materiais/
   * Requisições também o usam), fornecido pelo app-shell em vez de duplicado aqui. */
  materialsFull: { id: string; name: string }[]
  onCatalogChanged?: () => void
}

const PAGE_SIZE = 20

/**
 * Módulo Fornecedores — 3ª migração para o template oficial (Fase 11.5, Subetapa 11.5.7). A busca por
 * Enter sem debounce (achado da auditoria original) foi substituída pelo mesmo padrão de
 * `SearchInput`+debounce usado em todo o resto do ERP, ao adotar o template — consequência natural da
 * propagação, não uma mudança de escopo à parte.
 */
export function FornecedoresPage({ materialsFull, onCatalogChanged }: FornecedoresPageProps) {
  const confirmAction = useConfirm()
  const [rows, setRows] = useState<SupplierListRow[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<SupplierFormData>(EMPTY_SUPPLIER_FORM)
  const [materialLinks, setMaterialLinks] = useState<SupplierMaterialLink[]>([])
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (debouncedSearch) params.set('search', debouncedSearch)
      params.set('page', String(page))
      params.set('limit', String(PAGE_SIZE))
      const r = await fetch(`/api/suppliers?${params}`)
      if (r.ok) {
        const json = await r.json()
        setRows(json.data || [])
        setTotal(json.total || 0)
      }
    } catch {
      toast.error('Erro ao carregar fornecedores')
    } finally {
      setLoading(false)
    }
  }, [debouncedSearch, page])

  useEffect(() => {
    load()
  }, [load])

  function handleSearchChange(value: string) {
    setSearch(value)
    setPage(1)
  }

  function openNew() {
    setEditingId(null)
    setForm(EMPTY_SUPPLIER_FORM)
    setMaterialLinks([])
    setDialogOpen(true)
  }

  // Mesmo princípio da 11.5.6: busca o registro completo por id (`GET /api/suppliers/[id]`, já
  // existia) para popular tanto os campos do formulário quanto os vínculos de matéria-prima — uma
  // única fonte, em vez de reaproveitar a linha da lista para os campos e um fetch à parte só para
  // os vínculos (como o código original fazia).
  async function openEdit(id: string) {
    try {
      const r = await fetch(`/api/suppliers/${id}`)
      if (!r.ok) {
        toast.error('Erro ao carregar fornecedor')
        return
      }
      const supplier: SupplierRecord = await r.json()
      setEditingId(supplier.id)
      setForm(supplierToFormData(supplier))
      setMaterialLinks(supplier.materials || [])
      setDialogOpen(true)
    } catch {
      toast.error('Erro ao carregar fornecedor')
    }
  }

  async function save() {
    setSaving(true)
    try {
      const url = editingId ? `/api/suppliers/${editingId}` : '/api/suppliers'
      const method = editingId ? 'PUT' : 'POST'
      const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      if (r.ok) {
        toast.success(editingId ? 'Fornecedor atualizado!' : 'Fornecedor criado!')
        setDialogOpen(false)
        load()
        onCatalogChanged?.()
      } else {
        const err = await r.json()
        toast.error(err.error || 'Erro ao salvar fornecedor')
      }
    } catch {
      toast.error('Erro ao salvar fornecedor')
    } finally {
      setSaving(false)
    }
  }

  async function remove(id: string) {
    if (!(await confirmAction({ description: 'Deseja realmente excluir este fornecedor?', destructive: true }))) return
    try {
      const r = await fetch(`/api/suppliers/${id}`, { method: 'DELETE' })
      if (r.ok) {
        toast.success('Fornecedor excluído!')
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

  async function linkMaterial(data: { materialId: string; lastPrice: number; leadTimeDays: number; isPreferred: boolean }) {
    if (!editingId) return
    try {
      const r = await fetch(`/api/suppliers/${editingId}/materials`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      if (r.ok) {
        toast.success('Matéria-prima vinculada ao fornecedor!')
        const full: SupplierRecord = await (await fetch(`/api/suppliers/${editingId}`)).json()
        setMaterialLinks(full.materials || [])
      } else {
        const err = await r.json()
        toast.error(err.error || 'Erro ao vincular')
      }
    } catch {
      toast.error('Erro ao vincular matéria-prima')
    }
  }

  async function unlinkMaterial(materialId: string) {
    if (!editingId) return
    try {
      const r = await fetch(`/api/suppliers/${editingId}/materials/${materialId}`, { method: 'DELETE' })
      if (r.ok) {
        toast.success('Vínculo removido')
        setMaterialLinks((prev) => prev.filter((l) => l.materialId !== materialId))
      } else {
        const err = await r.json()
        toast.error(err.error || 'Erro ao remover vínculo')
      }
    } catch {
      toast.error('Erro ao remover vínculo')
    }
  }

  const columns: DataTableColumn<SupplierListRow>[] = [
    { id: 'name', header: 'Razão Social', cell: (s) => s.corporateName || s.tradeName },
    { id: 'cpfCnpj', header: 'CNPJ/CPF', cell: (s) => s.cpfCnpj || '-', hideBelow: 'sm' },
    { id: 'contactName', header: 'Contato', cell: (s) => s.contactName || '-', hideBelow: 'md' },
    { id: 'phone', header: 'Telefone', cell: (s) => s.phone || '-', hideBelow: 'sm' },
    { id: 'materials', header: 'Matérias-primas', cell: (s) => s._count?.materials ?? 0, align: 'right', hideBelow: 'md' },
  ]

  return (
    <div className="space-y-4">
      <PageHeader title="Fornecedores" actions={<Button onClick={openNew}><Plus className="w-4 h-4" /> Novo</Button>} />

      <FilterBar>
        <SearchInput value={search} onChange={handleSearchChange} placeholder="Buscar fornecedor..." />
      </FilterBar>

      <DataTable
        columns={columns}
        rows={rows}
        getRowId={(s) => s.id}
        loading={loading}
        emptyMessage="Nenhum fornecedor cadastrado"
        rowActions={[
          { label: 'Editar', icon: <Pencil />, onClick: (s) => openEdit(s.id) },
          { label: 'Excluir', icon: <Trash2 />, variant: 'destructive', onClick: (s) => remove(s.id) },
        ]}
        pagination={{ page, pageSize: PAGE_SIZE, total, onPageChange: setPage }}
      />

      <FormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={editingId ? 'Editar Fornecedor' : 'Novo Fornecedor'}
        maxWidth="sm:max-w-4xl"
        onSave={save}
        saving={saving}
      >
        <FornecedorFormFields form={form} onChange={setForm} />
        {editingId && (
          <FornecedorMaterialLinks links={materialLinks} materialsFull={materialsFull} onLink={linkMaterial} onUnlink={unlinkMaterial} />
        )}
      </FormDialog>
    </div>
  )
}
