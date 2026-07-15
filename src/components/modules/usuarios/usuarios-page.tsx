'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/platform/page-header'
import { FilterBar } from '@/components/platform/filter-bar'
import { DataTable, type DataTableColumn } from '@/components/platform/data-table'
import { FormDialog } from '@/components/domain/form-dialog'
import { SearchInput } from '@/components/domain/search-input'
import { StatusBadge } from '@/components/domain/status-badge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/domain/confirm-dialog'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { ROLE_LABELS } from '@/lib/role-labels'
import { UsuarioFormFields } from './usuario-form-fields'
import { EMPTY_USER_FORM, userToFormData, type UserRecord, type UserFormData } from './types'

const PAGE_SIZE = 20

/**
 * Módulo Usuários — 2ª migração para o template oficial (Fase 11.5, Subetapa 11.5.7). O backend já
 * suportava `search`/`page`/`limit` em `/api/users` (mesmo padrão de Clientes), mas o frontend nunca
 * usava — a lista ficava sempre travada nos 20 primeiros registros, sem busca. Corrigido ao adotar
 * `FilterBar`+`DataTable`, mesma classe de achado do bug `openEditClient` (capacidade que já existia
 * no backend, nunca ligada no frontend) — sem nenhuma mudança de backend.
 */
export function UsuariosPage() {
  const confirmAction = useConfirm()
  const [rows, setRows] = useState<UserRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<UserFormData>(EMPTY_USER_FORM)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (debouncedSearch) params.set('search', debouncedSearch)
      params.set('page', String(page))
      params.set('limit', String(PAGE_SIZE))
      const r = await fetch(`/api/users?${params}`)
      if (r.ok) {
        const json = await r.json()
        setRows(json.data || [])
        setTotal(json.total || 0)
      }
    } catch {
      toast.error('Erro ao carregar usuários')
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
    setForm(EMPTY_USER_FORM)
    setDialogOpen(true)
  }

  function openEdit(user: UserRecord) {
    setEditingId(user.id)
    setForm(userToFormData(user))
    setDialogOpen(true)
  }

  async function save() {
    setSaving(true)
    try {
      const url = editingId ? `/api/users/${editingId}` : '/api/users'
      const method = editingId ? 'PUT' : 'POST'
      const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      if (r.ok) {
        toast.success(editingId ? 'Usuário atualizado!' : 'Usuário criado!')
        setDialogOpen(false)
        load()
      } else {
        const err = await r.json()
        toast.error(err.error || 'Erro ao salvar')
      }
    } catch {
      toast.error('Erro ao salvar usuário')
    } finally {
      setSaving(false)
    }
  }

  async function remove(id: string) {
    if (!(await confirmAction({ description: 'Deseja realmente excluir este usuário?', destructive: true }))) return
    try {
      const r = await fetch(`/api/users/${id}`, { method: 'DELETE' })
      if (r.ok) {
        toast.success('Usuário excluído!')
        load()
      } else {
        const err = await r.json()
        toast.error(err.error || 'Erro ao excluir')
      }
    } catch {
      toast.error('Erro ao excluir')
    }
  }

  const columns: DataTableColumn<UserRecord>[] = [
    { id: 'name', header: 'Nome', cell: (u) => u.name },
    { id: 'username', header: 'Usuário', cell: (u) => <span className="font-mono text-sm">{u.username}</span>, hideBelow: 'sm' },
    { id: 'role', header: 'Perfil', cell: (u) => <Badge variant="outline">{ROLE_LABELS[u.role] || u.role}</Badge> },
    {
      id: 'active',
      header: 'Status',
      cell: (u) => (
        <StatusBadge domain="userStatus" status={u.active ? 'active' : 'inactive'} label={u.active ? 'Ativo' : 'Inativo'} />
      ),
    },
  ]

  return (
    <div className="space-y-4">
      <PageHeader title="Usuários" actions={<Button onClick={openNew}><Plus className="w-4 h-4" /> Novo</Button>} />

      <FilterBar>
        <SearchInput value={search} onChange={handleSearchChange} placeholder="Buscar usuário..." />
      </FilterBar>

      <DataTable
        columns={columns}
        rows={rows}
        getRowId={(u) => u.id}
        loading={loading}
        emptyMessage="Nenhum usuário encontrado"
        rowActions={[
          { label: 'Editar', icon: <Pencil />, onClick: (u) => openEdit(u) },
          { label: 'Excluir', icon: <Trash2 />, variant: 'destructive', onClick: (u) => remove(u.id) },
        ]}
        pagination={{ page, pageSize: PAGE_SIZE, total, onPageChange: setPage }}
      />

      <FormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={editingId ? 'Editar Usuário' : 'Novo Usuário'}
        maxWidth="sm:max-w-md"
        onSave={save}
        saving={saving}
      >
        <UsuarioFormFields form={form} onChange={setForm} isEditing={editingId !== null} />
      </FormDialog>
    </div>
  )
}
