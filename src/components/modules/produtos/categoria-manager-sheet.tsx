'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, ArrowLeft, FolderOpen } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { AsyncButton } from '@/components/domain/async-button'
import { SearchInput } from '@/components/domain/search-input'
import { useConfirm } from '@/components/domain/confirm-dialog'
import { hasPermission, type Role } from '@/app/middleware/rbac'

interface CategoryRow {
  id: string
  name: string
  slug: string
  parentId: string | null
  order: number
  active: boolean
  _count: { products: number; materials: number; children: number }
}

interface CategoriaManagerSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  role: Role
  /** Avisa o pai (`ProdutosPage`) pra atualizar a lista leve de categorias usada no dropdown do
   * formulário de Produto — mesmo papel de `onAuxiliaryCatalogChanged` já existente. */
  onChanged?: () => void
}

/** Gera o slug a partir do nome (achado do usuário: campo era 100% manual, digitação duplicada).
 * Remove acentos, minúsculo, troca qualquer sequência não-alfanumérica por um único hífen. */
function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove marcas de acento isoladas pelo NFD
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function linkedDescription(count: CategoryRow['_count']): string | null {
  const parts: string[] = []
  if (count.products > 0) parts.push(`${count.products} produto(s)`)
  if (count.materials > 0) parts.push(`${count.materials} matéria(s)-prima(s)`)
  if (count.children > 0) parts.push(`${count.children} subcategoria(s)`)
  return parts.length > 0 ? parts.join(', ') : null
}

/**
 * "Gerenciar categorias" — drawer lateral (mesmo padrão de `catalogo-requests-page.tsx`), tira o
 * card "Cadastros auxiliares" de baixo da tabela de Produtos (achado do usuário: com dezenas/
 * centenas de produtos, rolar a página inteira só pra cadastrar categoria não é prático). Lista +
 * busca + criar/editar tudo na mesma janela — o formulário de nova/editar categoria troca o corpo
 * da janela (`mode`), nunca abre uma segunda janela empilhada por cima.
 */
export function CategoriaManagerSheet({ open, onOpenChange, role, onChanged }: CategoriaManagerSheetProps) {
  const confirmAction = useConfirm()
  const [categories, setCategories] = useState<CategoryRow[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [mode, setMode] = useState<'list' | 'form'>('list')

  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [saving, setSaving] = useState(false)

  const canCreate = hasPermission(role, 'categorias', 'create')
  const canUpdate = hasPermission(role, 'categorias', 'update')
  const canDelete = hasPermission(role, 'categorias', 'delete')

  async function load() {
    setLoading(true)
    try {
      const r = await fetch('/api/categories')
      if (r.ok) setCategories(await r.json())
      else toast.error('Erro ao carregar categorias')
    } catch {
      toast.error('Erro ao carregar categorias')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!open) return
    setMode('list')
    setSearch('')
    load()
  }, [open])

  const filtered = categories.filter((c) => {
    const q = search.trim().toLowerCase()
    return !q || c.name.toLowerCase().includes(q) || c.slug.toLowerCase().includes(q)
  })

  function openNewForm() {
    setEditingId(null)
    setName('')
    setSlug('')
    setSlugTouched(false)
    setMode('form')
  }

  function openEditForm(cat: CategoryRow) {
    setEditingId(cat.id)
    setName(cat.name)
    setSlug(cat.slug)
    setSlugTouched(true) // já tem slug definido — editar o nome não deve sobrescrever o slug existente
    setMode('form')
  }

  function handleNameChange(value: string) {
    setName(value)
    if (!slugTouched) setSlug(slugify(value))
  }

  function handleSlugChange(value: string) {
    setSlugTouched(true)
    setSlug(value)
  }

  async function save() {
    if (!name.trim() || !slug.trim()) {
      toast.error('Preencha nome e slug')
      return
    }
    setSaving(true)
    try {
      const url = editingId ? `/api/categories/${editingId}` : '/api/categories'
      const method = editingId ? 'PUT' : 'POST'
      const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim(), slug: slug.trim() }) })
      if (r.ok) {
        toast.success(editingId ? 'Categoria atualizada!' : 'Categoria criada!')
        setMode('list')
        await load()
        onChanged?.()
      } else {
        const err = await r.json()
        toast.error(err.error || 'Erro ao salvar categoria')
      }
    } catch {
      toast.error('Erro ao salvar categoria')
    } finally {
      setSaving(false)
    }
  }

  async function remove(cat: CategoryRow) {
    if (!(await confirmAction({ title: 'Excluir categoria', description: `Deseja realmente excluir "${cat.name}"? Essa ação não pode ser desfeita.`, destructive: true })))
      return
    try {
      const r = await fetch(`/api/categories/${cat.id}`, { method: 'DELETE' })
      if (r.ok) {
        toast.success('Categoria excluída')
        await load()
        onChanged?.()
      } else {
        const err = await r.json()
        toast.error(err.error || 'Erro ao excluir categoria')
      }
    } catch {
      toast.error('Erro ao excluir categoria')
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className="sm:max-w-lg overflow-y-auto"
        // `useConfirm()` (excluir categoria) abre um AlertDialog por cima deste Sheet — os dois são
        // portais Radix independentes, e sem esta checagem QUALQUER interação no AlertDialog
        // (confirmar OU cancelar) era lida como "clique fora" e fechava o Sheet inteiro junto,
        // jogando o usuário de volta pra tela de Produtos (contra o objetivo de gerenciar categorias
        // sem sair da tela). Único ponto do app onde um AlertDialog abre por cima de um Sheet.
        onPointerDownOutside={(e) => {
          if ((e.target as HTMLElement)?.closest('[role="alertdialog"]')) e.preventDefault()
        }}
      >
        {mode === 'list' ? (
          <>
            <SheetHeader>
              <SheetTitle>Gerenciar categorias</SheetTitle>
              <SheetDescription>Categorias de Produtos e Matérias-primas.</SheetDescription>
            </SheetHeader>
            <div className="px-4 space-y-3 flex-1 flex flex-col min-h-0">
              <div className="flex items-center gap-2">
                <SearchInput value={search} onChange={setSearch} placeholder="Buscar categoria..." wrapperClassName="relative flex-1" inputClassName="pl-9 w-full" />
                {canCreate && (
                  <Button size="sm" onClick={openNewForm}><Plus className="w-4 h-4" /> Nova categoria</Button>
                )}
              </div>

              <div className="flex-1 overflow-y-auto -mx-4 px-4 space-y-2">
                {loading ? (
                  <>
                    <Skeleton className="h-14 w-full rounded-md" />
                    <Skeleton className="h-14 w-full rounded-md" />
                    <Skeleton className="h-14 w-full rounded-md" />
                  </>
                ) : filtered.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 text-center py-12">
                    <FolderOpen className="w-8 h-8 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      {categories.length === 0 ? 'Nenhuma categoria cadastrada ainda.' : 'Nenhuma categoria encontrada para esta busca.'}
                    </p>
                  </div>
                ) : (
                  filtered.map((cat) => {
                    const linked = linkedDescription(cat._count)
                    return (
                      <div key={cat.id} className="flex items-start justify-between gap-3 rounded-md border p-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{cat.name}</p>
                          <p className="text-xs text-muted-foreground truncate">/{cat.slug}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {cat._count.products} produto(s) · {cat._count.materials} matéria(s)-prima(s)
                            {cat._count.children > 0 && ` · ${cat._count.children} subcategoria(s)`}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {canUpdate && (
                            <Button variant="ghost" size="icon" aria-label={`Editar ${cat.name}`} onClick={() => openEditForm(cat)}>
                              <Pencil className="w-4 h-4" />
                            </Button>
                          )}
                          {canDelete && (
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={linked ? `Excluir ${cat.name} (bloqueado: ${linked} vinculado(s))` : `Excluir ${cat.name}`}
                              disabled={!!linked}
                              title={linked ? `Não é possível excluir: ${linked} vinculado(s) a esta categoria` : undefined}
                              onClick={() => remove(cat)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </>
        ) : (
          <>
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                <Button variant="ghost" size="icon" aria-label="Voltar para a lista" onClick={() => setMode('list')}>
                  <ArrowLeft className="w-4 h-4" />
                </Button>
                {editingId ? 'Editar categoria' : 'Nova categoria'}
              </SheetTitle>
            </SheetHeader>
            <div className="px-4 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="cat-name">Nome da categoria</Label>
                <Input id="cat-name" autoFocus value={name} onChange={(e) => handleNameChange(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cat-slug">Slug</Label>
                <Input id="cat-slug" value={slug} onChange={(e) => handleSlugChange(e.target.value)} />
                <p className="text-xs text-muted-foreground">Gerado automaticamente a partir do nome — pode editar se precisar.</p>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setMode('list')}>Cancelar</Button>
                <AsyncButton onClick={save} loading={saving}>Salvar</AsyncButton>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
