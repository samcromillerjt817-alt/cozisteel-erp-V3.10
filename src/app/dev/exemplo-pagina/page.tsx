'use client'

import { useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import { Plus, Eye, Download } from 'lucide-react'
import { PageHeader } from '@/components/platform/page-header'
import { FilterBar } from '@/components/platform/filter-bar'
import { DetailDrawer } from '@/components/platform/detail-drawer'
import { DataTable, type DataTableColumn, type DataTableSort } from '@/components/platform/data-table'
import { SearchInput } from '@/components/domain/search-input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'

// Página de exemplo completa (Fase 11.5, Subetapa 11.5.3) — demonstra a estrutura padrão de página
// (ADR-018 §0.1) com dado fixo, modelada no módulo Materiais (o caso real com a combinação de filtro
// mais rica encontrada na auditoria: busca + categoria + checkbox). Serve como REFERÊNCIA VISUAL para
// a migração real de qualquer módulo (Subetapas 11.5.6+) — nenhum módulo real foi tocado ainda.
//
// Composição: PageHeader → FilterBar → DataTable → DetailDrawer. Nenhum desses componentes importa o
// outro — esta página é quem os monta (ADR-018 §0.1, componibilidade). KpiRow/AlertCenter (camadas
// opcionais da estrutura padrão) ficam de fora deste exemplo — ainda não promovidos à camada
// `platform` (pendente, fora do escopo desta subetapa).

interface MaterialRow {
  id: string
  name: string
  category: string
  stockQty: number
  minStockQty: number
  unit: string
}

function makeFixture(): MaterialRow[] {
  const categories = ['Chapas', 'Perfis', 'Tubos', 'Barras']
  return Array.from({ length: 18 }).map((_, i) => ({
    id: `mat-${i + 1}`,
    name: `Material de exemplo ${i + 1}`,
    category: categories[i % categories.length],
    stockQty: (i % 5) * 10,
    minStockQty: 25,
    unit: 'KG',
  }))
}

const FIXTURE = makeFixture()

function DemoPageContent() {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<string>('all')
  const [onlyLowStock, setOnlyLowStock] = useState(false)
  const [sort, setSort] = useState<DataTableSort | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [page, setPage] = useState(1)
  const [detailRow, setDetailRow] = useState<MaterialRow | null>(null)
  const pageSize = 6

  const filtered = useMemo(() => {
    return FIXTURE.filter((row) => {
      if (search && !row.name.toLowerCase().includes(search.toLowerCase())) return false
      if (category !== 'all' && row.category !== category) return false
      if (onlyLowStock && row.stockQty > row.minStockQty) return false
      return true
    })
  }, [search, category, onlyLowStock])

  const sorted = useMemo(() => {
    if (!sort) return filtered
    const dir = sort.direction === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => {
      const av = a[sort.columnId as keyof MaterialRow]
      const bv = b[sort.columnId as keyof MaterialRow]
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir
      return String(av).localeCompare(String(bv)) * dir
    })
  }, [filtered, sort])

  const paged = sorted.slice((page - 1) * pageSize, page * pageSize)

  const columns: DataTableColumn<MaterialRow>[] = [
    { id: 'name', header: 'Material', cell: (r) => r.name, sortable: true },
    { id: 'category', header: 'Categoria', cell: (r) => r.category, hideBelow: 'md' },
    { id: 'stockQty', header: 'Saldo', cell: (r) => `${r.stockQty} ${r.unit}`, align: 'right', sortable: true },
    { id: 'minStockQty', header: 'Mínimo', cell: (r) => `${r.minStockQty} ${r.unit}`, align: 'right', hideBelow: 'lg' },
    {
      id: 'status',
      header: 'Status',
      cell: (r) => (r.stockQty <= r.minStockQty ? <Badge className="bg-red-600/20 text-red-400 border-red-600/30">Baixo estoque</Badge> : <Badge className="bg-emerald-600/20 text-emerald-400 border-emerald-600/30">Normal</Badge>),
    },
  ]

  return (
    <div className="max-w-5xl mx-auto p-8 space-y-6">
      <p className="text-xs text-muted-foreground">Página de exemplo — Subetapa 11.5.3, dado fixo, referência visual para a migração real de módulos.</p>

      <PageHeader
        title="Materiais"
        description="Exemplo de página completa: PageHeader → FilterBar → DataTable → DetailDrawer."
        actions={<Button size="sm"><Plus className="w-4 h-4" /> Novo Material</Button>}
      />

      <FilterBar onClear={() => { setSearch(''); setCategory('all'); setOnlyLowStock(false) }}>
        <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1) }} placeholder="Buscar material..." />
        <Select value={category} onValueChange={(v) => { setCategory(v); setPage(1) }}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas categorias</SelectItem>
            <SelectItem value="Chapas">Chapas</SelectItem>
            <SelectItem value="Perfis">Perfis</SelectItem>
            <SelectItem value="Tubos">Tubos</SelectItem>
            <SelectItem value="Barras">Barras</SelectItem>
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={onlyLowStock} onCheckedChange={(v) => { setOnlyLowStock(v === true); setPage(1) }} />
          Só estoque baixo
        </label>
      </FilterBar>

      <DataTable
        columns={columns}
        rows={paged}
        getRowId={(r) => r.id}
        sort={sort}
        onSortChange={setSort}
        selectable
        selectedIds={selected}
        onSelectionChange={setSelected}
        rowActions={[{ label: 'Ver detalhes', icon: <Eye />, onClick: (r) => setDetailRow(r) }]}
        bulkActions={[{ label: 'Exportar selecionados', icon: <Download />, onClick: (rows) => alert(`Exportar ${rows.length} materiais`) }]}
        pagination={{ page, pageSize, total: sorted.length, onPageChange: setPage }}
        emptyMessage="Nenhum material encontrado com os filtros atuais"
      />

      <DetailDrawer
        open={detailRow !== null}
        onOpenChange={(open) => !open && setDetailRow(null)}
        title={detailRow?.name ?? ''}
        description="Detalhe de exemplo — qualquer conteúdo pode entrar aqui (campos, sub-lista, sub-formulário)."
        footer={<Button variant="outline" onClick={() => setDetailRow(null)}>Fechar</Button>}
      >
        {detailRow && (
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between"><dt className="text-muted-foreground">Categoria</dt><dd>{detailRow.category}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Saldo atual</dt><dd>{detailRow.stockQty} {detailRow.unit}</dd></div>
            <div className="flex justify-between"><dt className="text-muted-foreground">Estoque mínimo</dt><dd>{detailRow.minStockQty} {detailRow.unit}</dd></div>
          </dl>
        )}
      </DetailDrawer>
    </div>
  )
}

export default function ExemploPaginaPage() {
  const { status } = useSession()

  if (status === 'loading') return null
  if (status !== 'authenticated') {
    return <div className="max-w-md mx-auto p-8 text-center text-muted-foreground">Faça login no Cozisteel ERP para acessar esta página de validação.</div>
  }

  return <DemoPageContent />
}
