'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { Pencil, Trash2, Download } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/domain/status-badge'
import { DataTable, type DataTableColumn, type DataTableSort } from '@/components/platform/data-table'

// Página de validação isolada do `DataTable` (Fase 11.5, Subetapa 11.5.2) — dado fixo (fixture), zero
// módulo real conectado ainda. Existe só para o usuário validar o componente antes de qualquer
// migração real começar (ADR-018 §6, Subetapa 11.5.6+). Protegida por sessão (não é dado real, mas
// não deve ficar acessível sem login em produção). Remover/mover para um catálogo permanente de
// componentes quando a fase terminar — decisão em aberto, não tomada agora.

interface DemoRow {
  id: string
  name: string
  category: string
  status: 'draft' | 'sent' | 'approved' | 'rejected' | 'cancelled' | 'expired'
  quantity: number
  price: number
  supplier: string
  createdAt: string
}

function makeFixture(count: number): DemoRow[] {
  const categories = ['Chapas', 'Perfis', 'Tubos', 'Barras', 'Acessórios']
  const statuses: DemoRow['status'][] = ['draft', 'sent', 'approved', 'rejected', 'cancelled', 'expired']
  const suppliers = ['Aço Sul Ltda', 'Metalúrgica Fortaleza', 'Ferro & Cia', 'Industrial Norte']
  return Array.from({ length: count }).map((_, i) => ({
    id: `demo-${i + 1}`,
    name: `Item de demonstração ${i + 1}`,
    category: categories[i % categories.length],
    status: statuses[i % statuses.length],
    quantity: (i + 1) * 7,
    price: Math.round((i + 1) * 123.45 * 100) / 100,
    supplier: suppliers[i % suppliers.length],
    createdAt: new Date(2026, 0, (i % 28) + 1).toLocaleDateString('pt-BR'),
  }))
}

const FIXTURE = makeFixture(23)

const SIMPLE_COLUMNS: DataTableColumn<DemoRow>[] = [
  { id: 'name', header: 'Nome', cell: (r) => r.name, sortable: true },
  { id: 'category', header: 'Categoria', cell: (r) => r.category },
  { id: 'status', header: 'Status', cell: (r) => <StatusBadge domain="quote" status={r.status} label={r.status} /> },
]

const WIDE_COLUMNS: DataTableColumn<DemoRow>[] = [
  { id: 'id', header: 'ID', cell: (r) => r.id, hideBelow: 'lg' },
  { id: 'name', header: 'Nome', cell: (r) => r.name, sortable: true },
  { id: 'category', header: 'Categoria', cell: (r) => r.category, hideBelow: 'md' },
  { id: 'status', header: 'Status', cell: (r) => <StatusBadge domain="quote" status={r.status} label={r.status} /> },
  { id: 'quantity', header: 'Quantidade', cell: (r) => r.quantity, align: 'right', sortable: true },
  { id: 'price', header: 'Preço unit.', cell: (r) => r.price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), align: 'right', sortable: true },
  { id: 'total', header: 'Total', cell: (r) => (r.quantity * r.price).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), align: 'right' },
  { id: 'supplier', header: 'Fornecedor', cell: (r) => r.supplier, hideBelow: 'lg' },
  { id: 'createdAt', header: 'Criado em', cell: (r) => r.createdAt, hideBelow: 'md' },
]

function DataTableDemoContent() {
  const [statesScenario, setStatesScenario] = useState<'loading' | 'empty' | 'error' | 'ok'>('ok')
  const [sort, setSort] = useState<DataTableSort | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [page, setPage] = useState(1)
  const pageSize = 5

  const sorted = [...FIXTURE].sort((a, b) => {
    if (!sort) return 0
    const dir = sort.direction === 'asc' ? 1 : -1
    const av = a[sort.columnId as keyof DemoRow]
    const bv = b[sort.columnId as keyof DemoRow]
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir
    return String(av).localeCompare(String(bv)) * dir
  })
  const paged = sorted.slice((page - 1) * pageSize, page * pageSize)

  return (
    <div className="max-w-5xl mx-auto p-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Validação — DataTable (Subetapa 11.5.2)</h1>
        <p className="text-sm text-muted-foreground">
          Dado fixo, nenhum módulo real conectado. 4 cenários pedidos antes de migrar qualquer tela: simples, muitas colunas, estados, responsivo.
        </p>
      </div>

      <Tabs defaultValue="simples">
        <TabsList>
          <TabsTrigger value="simples">Simples</TabsTrigger>
          <TabsTrigger value="colunas">Muitas colunas</TabsTrigger>
          <TabsTrigger value="estados">Estados</TabsTrigger>
          <TabsTrigger value="responsivo">Responsivo</TabsTrigger>
        </TabsList>

        <TabsContent value="simples" className="mt-4 space-y-3">
          <p className="text-sm text-muted-foreground">3 colunas, ordenação por nome, seleção + ações por linha + ação em lote, paginação real.</p>
          <DataTable
            columns={SIMPLE_COLUMNS}
            rows={paged}
            getRowId={(r) => r.id}
            sort={sort}
            onSortChange={setSort}
            selectable
            selectedIds={selected}
            onSelectionChange={setSelected}
            rowActions={[
              { label: 'Editar', icon: <Pencil />, onClick: (r) => alert(`Editar ${r.name}`) },
              { label: 'Excluir', icon: <Trash2 />, variant: 'destructive', onClick: (r) => alert(`Excluir ${r.name}`) },
            ]}
            bulkActions={[{ label: 'Exportar selecionados', icon: <Download />, onClick: (rows) => alert(`Exportar ${rows.length} itens`) }]}
            pagination={{ page, pageSize, total: FIXTURE.length, onPageChange: setPage }}
            toolbar={<div className="text-xs text-muted-foreground">Slot de toolbar (onde a FilterBar da Subetapa 11.5.3 vai entrar)</div>}
          />
        </TabsContent>

        <TabsContent value="colunas" className="mt-4 space-y-3">
          <p className="text-sm text-muted-foreground">9 colunas, 3 delas somem em telas menores (`hideBelow`) — redimensione a janela para ver.</p>
          <DataTable columns={WIDE_COLUMNS} rows={FIXTURE.slice(0, 8)} getRowId={(r) => r.id} />
        </TabsContent>

        <TabsContent value="estados" className="mt-4 space-y-3">
          <div className="flex gap-2">
            <Button size="sm" variant={statesScenario === 'ok' ? 'default' : 'outline'} onClick={() => setStatesScenario('ok')}>Normal</Button>
            <Button size="sm" variant={statesScenario === 'loading' ? 'default' : 'outline'} onClick={() => setStatesScenario('loading')}>Carregando</Button>
            <Button size="sm" variant={statesScenario === 'empty' ? 'default' : 'outline'} onClick={() => setStatesScenario('empty')}>Vazio</Button>
            <Button size="sm" variant={statesScenario === 'error' ? 'default' : 'outline'} onClick={() => setStatesScenario('error')}>Erro</Button>
          </div>
          <DataTable
            columns={SIMPLE_COLUMNS}
            rows={statesScenario === 'empty' ? [] : FIXTURE.slice(0, 5)}
            getRowId={(r) => r.id}
            loading={statesScenario === 'loading'}
            error={statesScenario === 'error' ? 'Erro ao carregar os dados. Tente novamente.' : null}
            emptyMessage="Nenhum item cadastrado ainda"
          />
        </TabsContent>

        <TabsContent value="responsivo" className="mt-4 space-y-3">
          <p className="text-sm text-muted-foreground">Mesma tabela de &ldquo;muitas colunas&rdquo; — reduza a largura da janela do navegador para ver colunas de apoio desaparecerem e a rolagem horizontal assumir o restante.</p>
          <DataTable columns={WIDE_COLUMNS} rows={FIXTURE} getRowId={(r) => r.id} pagination={{ page: 1, pageSize: FIXTURE.length, total: FIXTURE.length, onPageChange: () => {} }} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

export default function DataTableDemoPage() {
  const { status } = useSession()

  if (status === 'loading') return null
  if (status !== 'authenticated') {
    return <div className="max-w-md mx-auto p-8 text-center text-muted-foreground">Faça login no Cozisteel ERP para acessar esta página de validação.</div>
  }

  return <DataTableDemoContent />
}
