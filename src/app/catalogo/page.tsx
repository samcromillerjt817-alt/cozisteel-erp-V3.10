'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowRight, CheckCircle2, Search, SlidersHorizontal, Sparkles, Star, PackageSearch, ShoppingCart } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
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
    <div className="min-h-screen bg-slate-50/70">
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div>
            <Link href="/catalogo" className="text-xl font-black tracking-tight text-slate-900">Cozisteel</Link>
            <p className="hidden text-xs text-slate-500 sm:block">Soluções profissionais em aço inox</p>
          </div>
          <Link href="/catalogo/carrinho">
            <Button className="relative shrink-0 rounded-full px-5 shadow-sm">
              <ShoppingCart className="mr-2 h-4 w-4" /> Minha cesta
              {cartItems.length > 0 && (
                <span className="absolute -top-2 -right-2 bg-primary text-primary-foreground text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
                  {cartItems.length}
                </span>
              )}
            </Button>
          </Link>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden bg-slate-950 text-white">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_20%,hsl(var(--primary)/0.35),transparent_35%),radial-gradient(circle_at_10%_100%,hsl(var(--primary)/0.18),transparent_30%)]" />
          <div className="relative mx-auto grid max-w-7xl gap-8 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[1.25fr_.75fr] lg:items-center">
            <div className="max-w-3xl">
              <Badge className="mb-5 border-white/15 bg-white/10 text-white hover:bg-white/15">
                <Sparkles className="mr-1.5 h-3.5 w-3.5" /> Catálogo profissional
              </Badge>
              <h1 className="text-4xl font-black tracking-tight sm:text-5xl lg:text-6xl">
                Equipamentos em inox feitos para o seu negócio
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-relaxed text-slate-300 sm:text-lg">
                Explore nossa linha, personalize medidas e detalhes e solicite um orçamento sob medida.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              {['Fabricação especializada', 'Projetos personalizáveis', 'Atendimento consultivo'].map((item) => (
                <div key={item} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.07] p-4 backdrop-blur">
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />
                  <span className="text-sm font-medium text-slate-100">{item}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6 sm:py-12">
        <Card className="-mt-14 relative z-10 border-0 shadow-xl shadow-slate-900/10">
          <CardContent className="p-4 sm:p-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
              <SlidersHorizontal className="h-4 w-4 text-primary" /> Encontre o equipamento ideal
            </div>
            <div className="flex flex-col gap-3 lg:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <Input
              className="h-12 rounded-xl border-slate-200 bg-slate-50 pl-12 text-base"
              placeholder="Busque por nome, código ou equipamento..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            />
          </div>
          <Select value={categoryId} onValueChange={(v) => { setCategoryId(v); setPage(1) }}>
            <SelectTrigger className="h-12 w-full rounded-xl bg-white lg:w-60"><SelectValue placeholder="Categoria" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as categorias</SelectItem>
              {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={(v) => setSort(v as typeof sort)}>
            <SelectTrigger className="h-12 w-full rounded-xl bg-white lg:w-52"><SelectValue placeholder="Ordenar" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="destaque">Destaques primeiro</SelectItem>
              <SelectItem value="name_asc">Nome (A-Z)</SelectItem>
              <SelectItem value="name_desc">Nome (Z-A)</SelectItem>
            </SelectContent>
          </Select>
            </div>
          </CardContent>
        </Card>

        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-widest text-primary">Nossa seleção</p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Equipamentos para sua operação</h2>
          </div>
          {!loading && products.length > 0 && <p className="hidden text-sm text-slate-500 sm:block">{total} {total === 1 ? 'produto' : 'produtos'}</p>}
        </div>

        {loading ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Card key={i} className="overflow-hidden border-slate-200/80">
                <Skeleton className="aspect-[4/3] w-full rounded-none" />
                <CardContent className="space-y-3 p-5">
                  <Skeleton className="h-3 w-24" /><Skeleton className="h-5 w-4/5" /><Skeleton className="h-4 w-full" /><Skeleton className="h-10 w-full rounded-xl" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : products.length === 0 ? (
          <Card className="border-dashed bg-white">
            <CardContent className="flex flex-col items-center justify-center gap-4 px-6 py-20 text-center">
            <div className="rounded-full bg-primary/10 p-5"><PackageSearch className="h-10 w-10 text-primary" /></div>
            <div><h3 className="text-lg font-bold text-slate-900">Não encontramos esse equipamento</h3>
            <p className="mt-1 max-w-md text-sm text-slate-500">Tente buscar outro termo ou escolher uma categoria diferente para explorar nosso catálogo.</p></div>
            <Button variant="outline" onClick={() => { setSearch(''); setCategoryId('all'); setPage(1) }}>Limpar filtros</Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {products.map((p) => (
              <Link key={p.id} href={`/catalogo/${p.id}`} className="group">
                <Card className="h-full overflow-hidden border-slate-200/80 bg-white transition-all duration-300 group-hover:-translate-y-1 group-hover:border-primary/30 group-hover:shadow-xl group-hover:shadow-slate-900/10">
                  <div className="relative aspect-[4/3] overflow-hidden bg-slate-100">
                    {p.images[0] ? (
                      <Image src={p.images[0].url} alt={p.name} fill className="object-cover transition-transform duration-500 group-hover:scale-105" unoptimized />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-300">
                        <PackageSearch className="w-10 h-10" />
                      </div>
                    )}
                    {p.featured && (
                      <Badge className="absolute left-3 top-3 gap-1 border-0 shadow-md"><Star className="h-3 w-3 fill-current" /> Destaque</Badge>
                    )}
                  </div>
                  <CardContent className="flex min-h-48 flex-col p-5">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      {p.category ? <Badge variant="secondary" className="font-medium">{p.category.name}</Badge> : <span />}
                      {p.code && <span className="text-[11px] font-medium text-slate-400">Cód. {p.code}</span>}
                    </div>
                    <h3 className="line-clamp-2 text-lg font-bold leading-snug text-slate-900 transition-colors group-hover:text-primary">{p.name}</h3>
                    <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-slate-500">{p.description || 'Solução profissional desenvolvida para alto desempenho.'}</p>
                    <div className="mt-auto flex items-center justify-between border-t border-slate-100 pt-4">
                      <span className="text-sm font-semibold text-slate-700">{p.priceMode === 'exibir' ? 'Ver condições' : 'Orçamento sob consulta'}</span>
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground"><ArrowRight className="h-4 w-4" /></span>
                    </div>
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
      </main>
    </div>
  )
}
