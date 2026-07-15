'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { Search, LayoutDashboard, Users, Package, Layers, FileText, ShoppingCart, Warehouse, Factory, FileOutput } from 'lucide-react'
import { CommandPalette, type CommandPaletteGroup } from '@/components/platform/command-palette'
import { Button } from '@/components/ui/button'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import type { GlobalSearchResult } from '@/app/api/search/route'

// Página de validação isolada do `CommandPalette` (Subetapa 11.5.4) + busca global (Subetapa 11.5.5).
// Comandos de navegação continuam fictícios (integração real com `page.tsx` só na Subetapa 11.5.10) —
// mas a busca agora bate no endpoint real `/api/search` (7 entidades, RBAC aplicado no backend).

const TYPE_ICON: Record<GlobalSearchResult['type'], React.ReactNode> = {
  client: <Users />,
  product: <Package />,
  material: <Layers />,
  supplier: <Users />,
  quote: <FileText />,
  salesOrder: <ShoppingCart />,
  productionOrder: <FileOutput />,
}

const TYPE_LABEL: Record<GlobalSearchResult['type'], string> = {
  client: 'Cliente',
  product: 'Produto',
  material: 'Material',
  supplier: 'Fornecedor',
  quote: 'Orçamento',
  salesOrder: 'Pedido de venda',
  productionOrder: 'Ordem de produção',
}

function CommandPaletteDemoContent() {
  const [lastNavigated, setLastNavigated] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<GlobalSearchResult[]>([])
  const debouncedQuery = useDebouncedValue(query, 300)

  useEffect(() => {
    if (debouncedQuery.trim().length < 2) return
    let cancelled = false
    fetch(`/api/search?q=${encodeURIComponent(debouncedQuery)}`)
      .then((r) => r.json())
      .then((data: GlobalSearchResult[]) => {
        if (!cancelled) setResults(data)
      })
      .catch(() => {
        if (!cancelled) setResults([])
      })
    return () => {
      cancelled = true
    }
  }, [debouncedQuery])

  const displayedResults = debouncedQuery.trim().length < 2 ? [] : results

  const groups: CommandPaletteGroup[] = [
    {
      heading: 'Navegação',
      items: [
        { id: 'dashboard', label: 'Dashboard (Novo)', icon: <LayoutDashboard />, onSelect: () => setLastNavigated('Dashboard (Novo)') },
        { id: 'clientes', label: 'Clientes', icon: <Users />, onSelect: () => setLastNavigated('Clientes') },
        { id: 'produtos', label: 'Produtos', icon: <Package />, onSelect: () => setLastNavigated('Produtos') },
        { id: 'materiais', label: 'Materiais', icon: <Layers />, onSelect: () => setLastNavigated('Materiais') },
        { id: 'producao', label: 'Produção', icon: <Factory />, onSelect: () => setLastNavigated('Produção') },
        { id: 'orcamentos', label: 'Orçamentos', icon: <FileText />, keywords: ['quote', 'proposta'], onSelect: () => setLastNavigated('Orçamentos') },
        { id: 'compras', label: 'Compras', icon: <ShoppingCart />, onSelect: () => setLastNavigated('Compras') },
        { id: 'estoque', label: 'Estoque', icon: <Warehouse />, onSelect: () => setLastNavigated('Estoque') },
      ],
    },
  ]

  if (displayedResults.length > 0) {
    groups.push({
      heading: 'Resultados da busca',
      items: displayedResults.map((r) => ({
        id: `${r.type}-${r.id}`,
        label: r.label,
        icon: TYPE_ICON[r.type],
        onSelect: () => setLastNavigated(`${TYPE_LABEL[r.type]}: ${r.label}${r.sublabel ? ` (${r.sublabel})` : ''}`),
      })),
    })
  }

  return (
    <div className="max-w-2xl mx-auto p-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Validação — CommandPalette + Busca Global (Subetapas 11.5.4/11.5.5)</h1>
        <p className="text-sm text-muted-foreground mt-1">
          &ldquo;Navegação&rdquo; é fixo/fictício (integração real com o menu só na Subetapa 11.5.10). &ldquo;Resultados da busca&rdquo; é real — bate em `/api/search` (Clientes/Produtos/Materiais/Fornecedores/Orçamentos/Pedidos/Produção, com RBAC aplicado). Digite pelo menos 2 caracteres.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Button variant="outline" onClick={() => setOpen(true)}>
          <Search className="w-4 h-4" /> Abrir busca rápida
        </Button>
        <span className="text-xs text-muted-foreground">ou pressione <kbd className="px-1.5 py-0.5 rounded border bg-muted">Ctrl</kbd>+<kbd className="px-1.5 py-0.5 rounded border bg-muted">K</kbd> (<kbd className="px-1.5 py-0.5 rounded border bg-muted">⌘</kbd>+<kbd className="px-1.5 py-0.5 rounded border bg-muted">K</kbd> no Mac)</span>
      </div>

      <div className="rounded-lg border p-4 text-sm">
        {lastNavigated ? (
          <p>Você navegou para: <strong>{lastNavigated}</strong></p>
        ) : (
          <p className="text-muted-foreground">Nenhuma navegação ainda — abra a busca rápida e escolha um item.</p>
        )}
      </div>

      <CommandPalette groups={groups} open={open} onOpenChange={setOpen} onQueryChange={setQuery} />
    </div>
  )
}

export default function CommandPaletteDemoPage() {
  const { status } = useSession()

  if (status === 'loading') return null
  if (status !== 'authenticated') {
    return <div className="max-w-md mx-auto p-8 text-center text-muted-foreground">Faça login no Cozisteel ERP para acessar esta página de validação.</div>
  }

  return <CommandPaletteDemoContent />
}
