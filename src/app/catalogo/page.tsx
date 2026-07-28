'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Search, Star, PackageSearch, ShoppingCart } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { useCatalogCart } from '@/hooks/use-catalog-cart'
import { PaginationBar } from '@/components/domain/pagination-bar'

interface CatalogCategory {
  id: string
  name: string
  slug: string
}

interface CatalogProduct {
  id: string
  code?: string
  name: string
  description: string
  category: CatalogCategory | null
  featured: boolean
  priceMode: string
  images: Array<{ id: string; url: string; isPrimary: boolean }>
}

const PAGE_SIZE = 20

/**
 * Catálogo Digital Público (ADR-026) — página fora do SPA autenticado, sem menu/sessão, mesmo
 * princípio já usado em `/orcamento/[token]` (ADR-025).
 */
export default function CatalogoPage() {
  const [products, setProducts] = useState<CatalogProduct[]>([])
  const [categories, setCategories] = useState<CatalogCategory[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState('all')
  const [sort, setSort] = useState<'destaque' | 'name_asc' | 'name_desc'>('destaque')
  const [loading, setLoading] = useState(true)
  const debouncedSearch = useDebouncedValue(search, 400)
  const { items: cartItems } = useCatalogCart()

  useEffect(() => {
    fetch('/api/public/catalog/categories')
      .then((r) => r.json())
      .then((json) => setCategories(json.data || []))
      .catch(() => {})
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE), sort })
      if (debouncedSearch) params.set('search', debouncedSearch)
      if (categoryId !== 'all') params.set('categoryId', categoryId)
      const r = await fetch(`/api/public/catalog?${params.toString()}`)
      const json = await r.json()
      setProducts(json.data || [])
      setTotal(json.total || 0)
    } catch {
      setProducts([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [page, sort, debouncedSearch, categoryId])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b bg-white">
        <div className="max-w-6xl mx-auto px-4 py-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Catálogo Cozisteel</h1>
            <p className="text-sm text-slate-500">Equipamentos inoxidáveis — monte sua solicitação de orçamento</p>
          </div>
          <Link href="/catalogo/carrinho">
            <Button variant="outline" className="relative shrink-0">
              <ShoppingCart className="w-4 h-4 mr-1" /> Cesta
              {cartItems.length > 0 && (
                <span className="absolute -top-2 -right-2 bg-primary text-primary-foreground text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
                  {cartItems.length}
                </span>
              )}
            </Button>
          </Link>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              className="pl-9"
              placeholder="Buscar produto..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            />
          </div>
          <Select value={categoryId} onValueChange={(v) => { setCategoryId(v); setPage(1) }}>
            <SelectTrigger className="w-full sm:w-56"><SelectValue placeholder="Categoria" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as categorias</SelectItem>
              {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={(v) => setSort(v as typeof sort)}>
            <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder="Ordenar" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="destaque">Destaques primeiro</SelectItem>
              <SelectItem value="name_asc">Nome (A-Z)</SelectItem>
              <SelectItem value="name_desc">Nome (Z-A)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Card key={i} className="animate-pulse"><CardContent className="p-4 h-64 bg-slate-100 rounded" /></Card>
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
            <PackageSearch className="w-10 h-10 text-slate-300" />
            <p className="text-slate-500">Nenhum produto encontrado</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {products.map((p) => (
              <Link key={p.id} href={`/catalogo/${p.id}`}>
                <Card className="h-full hover:shadow-md transition-shadow overflow-hidden">
                  <div className="relative aspect-square bg-slate-100">
                    {p.images[0] ? (
                      <Image src={p.images[0].url} alt={p.name} fill className="object-cover" unoptimized />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-300">
                        <PackageSearch className="w-10 h-10" />
                      </div>
                    )}
                    {p.featured && (
                      <Badge className="absolute top-2 left-2 gap-1"><Star className="w-3 h-3" /> Destaque</Badge>
                    )}
                  </div>
                  <CardContent className="p-3 space-y-1">
                    {p.category && <p className="text-xs text-slate-400">{p.category.name}</p>}
                    <p className="font-medium text-sm line-clamp-2">{p.name}</p>
                    <p className="text-xs text-slate-500">{p.priceMode === 'exibir' ? '' : 'Sob consulta'}</p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}

        {total > PAGE_SIZE && (
          <PaginationBar page={page} totalPages={Math.ceil(total / PAGE_SIZE)} total={total} limit={PAGE_SIZE} onPageChange={setPage} />
        )}
      </div>
    </div>
  )
}
