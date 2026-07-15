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
import { ClienteFormFields } from './cliente-form-fields'
import { EMPTY_CLIENT_FORM, clientToFormData, type ClientRecord, type ClientFormData } from './types'

interface ClientesPageProps {
  /** Notifica o app-shell para recarregar o catálogo completo de clientes (usado pelo select de
   * cliente do Orçamento) depois de criar/editar/excluir — estado compartilhado fora deste módulo,
   * nunca duplicado aqui. */
  onCatalogChanged?: () => void
}

const PAGE_SIZE = 20

/**
 * Módulo Clientes — TEMPLATE OFICIAL da Fase 11.5 (Subetapa 11.5.6, piloto). Toda página nova do ERP
 * deve seguir esta mesma estrutura: `PageHeader` → `FilterBar` → `DataTable` → `FormDialog`/
 * `DetailDrawer`, cada camada um componente de `platform` independente, esta página só orquestra —
 * nenhuma lógica de apresentação espalhada aqui, nenhum componente conhece o outro internamente
 * (ADR-018 §0.1). Autocontido: busca seus próprios dados, sem depender de estado externo de
 * `page.tsx` além do callback `onCatalogChanged`.
 */
export function ClientesPage({ onCatalogChanged }: ClientesPageProps) {
  const confirmAction = useConfirm()
  const [rows, setRows] = useState<ClientRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<ClientFormData>(EMPTY_CLIENT_FORM)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (debouncedSearch) params.set('search', debouncedSearch)
      params.set('page', String(page))
      params.set('limit', String(PAGE_SIZE))
      const r = await fetch(`/api/clients?${params}`)
      if (r.ok) {
        const json = await r.json()
        setRows(json.data || [])
        setTotal(json.total || 0)
      }
    } catch {
      toast.error('Erro ao carregar clientes')
    } finally {
      setLoading(false)
    }
  }, [debouncedSearch, page])

  useEffect(() => {
    load()
  }, [load])

  function handleSearchChange(value: string) {
    setSearch(value)
    setPage(1) // reação direta ao evento de digitação, não a um efeito observando o valor debounced
  }

  function openNew() {
    setEditingId(null)
    setForm(EMPTY_CLIENT_FORM)
    setDialogOpen(true)
  }

  // Correção definitiva do bug conhecido (Fase 13/ADR-015; ADR-018 Decisão 7): busca o registro
  // COMPLETO por id (`GET /api/clients/[id]`, nunca a linha da lista, que pode um dia vir enxuta) e
  // popula o formulário via `clientToFormData`, que itera a mesma lista de campos usada por
  // `EMPTY_CLIENT_FORM` — impossível esquecer um campo silenciosamente como acontecia antes (6 campos
  // eram hardcoded como string vazia em vez de vir do cliente real).
  async function openEdit(id: string) {
    try {
      const r = await fetch(`/api/clients/${id}`)
      if (!r.ok) {
        toast.error('Erro ao carregar cliente')
        return
      }
      const client: ClientRecord = await r.json()
      setEditingId(client.id)
      setForm(clientToFormData(client))
      setDialogOpen(true)
    } catch {
      toast.error('Erro ao carregar cliente')
    }
  }

  async function save() {
    setSaving(true)
    try {
      const url = editingId ? `/api/clients/${editingId}` : '/api/clients'
      const method = editingId ? 'PUT' : 'POST'
      const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      if (r.ok) {
        toast.success(editingId ? 'Cliente atualizado!' : 'Cliente criado!')
        setDialogOpen(false)
        load()
        onCatalogChanged?.()
      } else {
        const err = await r.json()
        toast.error(err.error || 'Erro ao salvar')
      }
    } catch {
      toast.error('Erro ao salvar cliente')
    } finally {
      setSaving(false)
    }
  }

  async function remove(id: string) {
    if (!(await confirmAction({ description: 'Deseja realmente excluir este cliente?', destructive: true }))) return
    try {
      const r = await fetch(`/api/clients/${id}`, { method: 'DELETE' })
      if (r.ok) {
        toast.success('Cliente excluído!')
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

  const columns: DataTableColumn<ClientRecord>[] = [
    { id: 'name', header: 'Nome', cell: (c) => c.corporateName || c.tradeName || '-' },
    { id: 'cpfCnpj', header: 'CNPJ / CPF', cell: (c) => c.cpfCnpj || '-' },
    { id: 'city', header: 'Cidade / UF', cell: (c) => (c.city ? `${c.city}/${c.state}` : '-'), hideBelow: 'md' },
    { id: 'phone', header: 'Telefone', cell: (c) => c.phone || '-', hideBelow: 'sm' },
  ]

  return (
    <div className="space-y-4">
      <PageHeader title="Clientes" actions={<Button onClick={openNew}><Plus className="w-4 h-4" /> Novo</Button>} />

      <FilterBar>
        <SearchInput value={search} onChange={handleSearchChange} />
      </FilterBar>

      <DataTable
        columns={columns}
        rows={rows}
        getRowId={(c) => c.id}
        loading={loading}
        emptyMessage="Nenhum cliente encontrado"
        rowActions={[
          { label: 'Editar', icon: <Pencil />, onClick: (c) => openEdit(c.id) },
          { label: 'Excluir', icon: <Trash2 />, variant: 'destructive', onClick: (c) => remove(c.id) },
        ]}
        pagination={{ page, pageSize: PAGE_SIZE, total, onPageChange: setPage }}
      />

      <FormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={editingId ? 'Editar Cliente' : 'Novo Cliente'}
        maxWidth="sm:max-w-3xl"
        onSave={save}
        saving={saving}
      >
        <ClienteFormFields form={form} onChange={setForm} />
      </FormDialog>
    </div>
  )
}
