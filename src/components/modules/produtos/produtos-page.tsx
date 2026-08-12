'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Plus, Pencil, Ban, Package, FolderCog } from 'lucide-react'
import { PageHeader } from '@/components/platform/page-header'
import { FilterBar } from '@/components/platform/filter-bar'
import { DataTable, type DataTableColumn } from '@/components/platform/data-table'
import { FormDialog } from '@/components/domain/form-dialog'
import { SearchInput } from '@/components/domain/search-input'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/domain/confirm-dialog'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { formatCurrency } from '@/lib/format'
import type { Role } from '@/app/middleware/rbac'
import { ProdutoFormFields } from './produto-form-fields'
import { ProdutoImages } from './produto-images'
import { ProdutoMaterialLinks } from './produto-material-links'
import { CategoriaManagerSheet } from './categoria-manager-sheet'
import { ProdutoBomSection } from './produto-bom-section'
import { EMPTY_PRODUCT_FORM, productToFormData, type ProductListItem, type ProductFormData, type ProductImage, type ProductMaterialLink } from './types'

interface ProdutosPageProps {
  role: Role
  categories: { id: string; name: string }[]
  materials: { id: string; name: string }[]
  materialsFull: { id: string; name: string }[]
  onCatalogChanged?: () => void
  onAuxiliaryCatalogChanged?: () => void
  onNavigateToMateriais: () => void
}

const PAGE_SIZE = 20

/**
 * Módulo Produtos — `PageHeader`→`FilterBar`→`DataTable`→`FormDialog`. Categorias saíram do card
 * "Cadastros auxiliares" (embaixo da tabela — achado do usuário: rolar a página inteira só pra
 * cadastrar categoria não é prático com dezenas/centenas de produtos) e viraram a janela
 * "Gerenciar categorias" (`CategoriaManagerSheet`), acionada pelo cabeçalho — gerenciável a
 * qualquer momento em 1 clique, sem sair da tela nem rolar a listagem.
 */
export function ProdutosPage({ role, categories, materials, materialsFull, onCatalogChanged, onAuxiliaryCatalogChanged, onNavigateToMateriais }: ProdutosPageProps) {
  const confirmAction = useConfirm()
  const [rows, setRows] = useState<ProductListItem[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<ProductFormData>(EMPTY_PRODUCT_FORM)
  const [images, setImages] = useState<ProductImage[]>([])
  const [imageUploading, setImageUploading] = useState(false)
  const [materialLinks, setMaterialLinks] = useState<ProductMaterialLink[]>([])
  const [saving, setSaving] = useState(false)

  const [categoriaManagerOpen, setCategoriaManagerOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (debouncedSearch) params.set('search', debouncedSearch)
      params.set('page', String(page))
      params.set('limit', String(PAGE_SIZE))
      const r = await fetch(`/api/products?${params}`)
      if (r.ok) {
        const json = await r.json()
        setRows(json.data || [])
        setTotal(json.total || 0)
      }
    } catch {
      toast.error('Erro ao carregar produtos')
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
    setForm(EMPTY_PRODUCT_FORM)
    setImages([])
    setMaterialLinks([])
    setDialogOpen(true)
  }

  // `openEditProduct` original nunca teve o bug de campo perdido (todos os campos já vinham da linha
  // da lista corretamente) — mantido igual, só reorganizado. Imagens/vínculos continuam vindo de
  // endpoints próprios (não existe um "GET completo" único que já traga os dois).
  function openEdit(product: ProductListItem) {
    setEditingId(product.id)
    setForm(productToFormData(product))
    setMaterialLinks([])
    setImages([])
    setDialogOpen(true)
    fetch(`/api/products/${product.id}/materials`).then((r) => (r.ok ? r.json() : [])).then((links) => setMaterialLinks(links || [])).catch(() => {})
    fetch(`/api/products/${product.id}/images`).then((r) => (r.ok ? r.json() : [])).then((imgs) => setImages(imgs || [])).catch(() => {})
  }

  async function save() {
    setSaving(true)
    try {
      const url = editingId ? `/api/products/${editingId}` : '/api/products'
      const method = editingId ? 'PUT' : 'POST'
      const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      if (r.ok) {
        toast.success(editingId ? 'Produto atualizado!' : 'Produto criado!')
        setDialogOpen(false)
        load()
        onCatalogChanged?.()
      } else {
        const err = await r.json()
        toast.error(err.error || 'Erro ao salvar')
      }
    } catch {
      toast.error('Erro ao salvar produto')
    } finally {
      setSaving(false)
    }
  }

  async function remove(id: string) {
    if (!(await confirmAction('Deseja realmente desativar este produto?'))) return
    try {
      const r = await fetch(`/api/products/${id}`, { method: 'DELETE' })
      if (r.ok) {
        toast.success('Produto desativado!')
        load()
        onCatalogChanged?.()
      } else {
        toast.error('Erro ao desativar')
      }
    } catch {
      toast.error('Erro ao desativar')
    }
  }

  async function linkMaterial(data: { materialId: string; quantity: number; unit: string; scrapPct: number }) {
    if (!editingId) return
    try {
      const r = await fetch(`/api/products/${editingId}/materials`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      if (r.ok) {
        toast.success('Matéria-prima vinculada ao produto!')
        const links = await (await fetch(`/api/products/${editingId}/materials`)).json()
        setMaterialLinks(links || [])
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
      const r = await fetch(`/api/products/${editingId}/materials/${materialId}`, { method: 'DELETE' })
      if (r.ok) {
        toast.success('Vínculo removido')
        setMaterialLinks((prev) => prev.filter((l) => l.materialId !== materialId))
      } else {
        toast.error('Erro ao remover vínculo')
      }
    } catch {
      toast.error('Erro ao remover vínculo')
    }
  }

  async function uploadImage(file: File) {
    if (!editingId) return
    if (file.size > 8 * 1024 * 1024) {
      toast.error('Arquivo muito grande (máx. 8MB)')
      return
    }
    setImageUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const r = await fetch(`/api/products/${editingId}/images`, { method: 'POST', body: formData })
      if (r.ok) {
        toast.success('Imagem enviada!')
        const imgs = await (await fetch(`/api/products/${editingId}/images`)).json()
        setImages(imgs || [])
      } else {
        const err = await r.json()
        toast.error(err.error || 'Erro ao enviar imagem')
      }
    } catch {
      toast.error('Erro ao enviar imagem')
    } finally {
      setImageUploading(false)
    }
  }

  async function deleteImage(imageId: string) {
    if (!editingId) return
    try {
      const r = await fetch(`/api/products/${editingId}/images/${imageId}`, { method: 'DELETE' })
      if (r.ok) {
        toast.success('Imagem removida')
        const imgs = await (await fetch(`/api/products/${editingId}/images`)).json()
        setImages(imgs || [])
      } else {
        toast.error('Erro ao remover imagem')
      }
    } catch {
      toast.error('Erro ao remover imagem')
    }
  }

  async function setPrimaryImage(imageId: string) {
    if (!editingId) return
    try {
      const r = await fetch(`/api/products/${editingId}/images/${imageId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isPrimary: true }) })
      if (r.ok) {
        const imgs = await (await fetch(`/api/products/${editingId}/images`)).json()
        setImages(imgs || [])
      }
    } catch {
      toast.error('Erro ao definir imagem principal')
    }
  }

  const columns: DataTableColumn<ProductListItem>[] = [
    {
      id: 'image',
      header: '',
      width: '56px',
      cell: (p) =>
        p.images?.[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/uploads/${p.images[0].url}`} alt="" className="w-10 h-10 object-cover rounded border" />
        ) : (
          <div className="w-10 h-10 rounded border bg-muted flex items-center justify-center"><Package className="w-4 h-4 text-muted-foreground" /></div>
        ),
    },
    { id: 'internalCode', header: 'Código', cell: (p) => p.internalCode || '-', hideBelow: 'sm' },
    { id: 'name', header: 'Nome', cell: (p) => p.name },
    { id: 'category', header: 'Categoria', cell: (p) => p.category?.name || '-', hideBelow: 'md' },
    { id: 'salePrice', header: 'Preço Venda', cell: (p) => formatCurrency(p.salePrice), align: 'right' },
    { id: 'weight', header: 'Peso', cell: (p) => (p.weight ? `${p.weight} kg` : '-'), align: 'right', hideBelow: 'lg' },
  ]

  return (
    <div className="space-y-4">
      <PageHeader
        title="Produtos"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onNavigateToMateriais}><Package className="w-4 h-4" /> Matérias-primas</Button>
            <Button variant="outline" onClick={() => setCategoriaManagerOpen(true)}><FolderCog className="w-4 h-4" /> Gerenciar categorias</Button>
            <Button onClick={openNew}><Plus className="w-4 h-4" /> Novo</Button>
          </div>
        }
      />

      <FilterBar>
        <SearchInput value={search} onChange={handleSearchChange} />
      </FilterBar>

      <DataTable
        columns={columns}
        rows={rows}
        getRowId={(p) => p.id}
        loading={loading}
        emptyMessage="Nenhum produto encontrado"
        emptyAction={{ label: 'Cadastrar o primeiro produto', onClick: openNew }}
        rowActions={[
          { label: 'Editar', icon: <Pencil />, onClick: (p) => openEdit(p), primary: true },
          { label: 'Desativar', icon: <Ban />, onClick: (p) => remove(p.id) },
        ]}
        pagination={{ page, pageSize: PAGE_SIZE, total, onPageChange: setPage }}
      />

      <CategoriaManagerSheet
        open={categoriaManagerOpen}
        onOpenChange={setCategoriaManagerOpen}
        role={role}
        onChanged={onAuxiliaryCatalogChanged}
      />

      <FormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={editingId ? 'Editar Produto' : 'Novo Produto'}
        maxWidth="sm:max-w-4xl"
        onSave={save}
        saving={saving}
      >
        <ProdutoFormFields form={form} onChange={setForm} categories={categories} materials={materials} />
        {editingId && <ProdutoImages images={images} uploading={imageUploading} onUpload={uploadImage} onSetPrimary={setPrimaryImage} onDelete={deleteImage} />}
        {editingId && <ProdutoMaterialLinks links={materialLinks} materialsFull={materialsFull} onLink={linkMaterial} onUnlink={unlinkMaterial} />}
        {editingId && <ProdutoBomSection productId={editingId} materialsFull={materialsFull} />}
      </FormDialog>
    </div>
  )
}
