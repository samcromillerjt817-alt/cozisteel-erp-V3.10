'use client'

import { useEffect, useState, use } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { toast } from 'sonner'
import { ArrowLeft, CheckCircle2, PackageSearch, Maximize2, Ruler, ShieldCheck, ShoppingCart, Sparkles, Star } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { useCatalogCart } from '@/hooks/use-catalog-cart'

interface CatalogProductDetail {
  id: string
  code?: string
  name: string
  description: string
  category: { id: string; name: string; slug: string } | null
  material: string
  unit: string
  dimensions: { width: number; height: number; length: number; thickness: number; weight: number }
  finish: string
  family: string
  line: string
  featured: boolean
  allowsCustomization: boolean
  priceMode: string
  price: number | null
  images: Array<{ id: string; url: string; isPrimary: boolean }>
}

type PageState = { phase: 'loading' } | { phase: 'not_found' } | { phase: 'ready'; product: CatalogProductDetail }

interface AddToCartForm {
  quantity: number
  width: string
  height: string
  length: string
  material: string
  finish: string
  voltage: string
  operationSide: string
  accessories: string
  modifications: string
  notes: string
}

function emptyAddToCartForm(product: CatalogProductDetail): AddToCartForm {
  return {
    quantity: 1,
    width: product.dimensions.width ? String(product.dimensions.width) : '',
    height: product.dimensions.height ? String(product.dimensions.height) : '',
    length: product.dimensions.length ? String(product.dimensions.length) : '',
    material: product.material || '',
    finish: product.finish || '',
    voltage: '',
    operationSide: '',
    accessories: '',
    modifications: '',
    notes: '',
  }
}

/** Ficha de produto do Catálogo Digital Público (ADR-026, Fase 3) — "Adicionar à cesta" com personalização. */
export default function CatalogoProductPage({ params }: { params: Promise<{ productId: string }> }) {
  const { productId } = use(params)
  const [state, setState] = useState<PageState>({ phase: 'loading' })
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState<AddToCartForm | null>(null)
  const { addItem } = useCatalogCart()

  useEffect(() => {
    fetch(`/api/public/catalog/${productId}`)
      .then(async (r) => {
        if (!r.ok) throw new Error('not found')
        const product = (await r.json()) as CatalogProductDetail
        setState({ phase: 'ready', product })
        setForm(emptyAddToCartForm(product))
      })
      .catch(() => setState({ phase: 'not_found' }))
  }, [productId])

  function handleAddToCart() {
    if (state.phase !== 'ready' || !form) return
    const { product } = state
    addItem({
      productId: product.id,
      productName: product.name,
      productImage: product.images[0]?.url,
      quantity: form.quantity,
      width: form.width ? Number(form.width) : undefined,
      height: form.height ? Number(form.height) : undefined,
      length: form.length ? Number(form.length) : undefined,
      material: form.material,
      finish: form.finish,
      voltage: form.voltage,
      operationSide: form.operationSide,
      accessories: form.accessories,
      modifications: form.modifications,
      notes: form.notes,
    })
    setDialogOpen(false)
    toast.success('Item adicionado à cesta')
  }

  if (state.phase === 'loading') {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6">
          <Skeleton className="h-5 w-40" />
          <div className="grid gap-10 lg:grid-cols-2"><Skeleton className="aspect-square rounded-3xl" /><div className="space-y-5 pt-6"><Skeleton className="h-6 w-28" /><Skeleton className="h-12 w-4/5" /><Skeleton className="h-24 w-full" /><Skeleton className="h-48 w-full rounded-2xl" /><Skeleton className="h-14 w-full rounded-xl" /></div></div>
        </div>
      </div>
    )
  }

  if (state.phase === 'not_found') {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-5 text-center px-4">
        <div className="rounded-full bg-primary/10 p-6"><PackageSearch className="h-12 w-12 text-primary" /></div>
        <div><h1 className="text-2xl font-bold text-slate-900">Produto não encontrado</h1><p className="mt-2 text-slate-500">Este item pode não estar mais disponível no catálogo.</p></div>
        <Button asChild><Link href="/catalogo"><ArrowLeft className="mr-2 h-4 w-4" /> Voltar ao catálogo</Link></Button>
      </div>
    )
  }

  const { product } = state
  const dims = product.dimensions
  const hasDims = dims.width > 0 || dims.height > 0 || dims.length > 0

  return (
    <div className="min-h-screen bg-slate-50/70">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
          <Link href="/catalogo" className="text-xl font-black tracking-tight text-slate-900">Mobsteel</Link>
          <Badge variant="secondary" className="hidden sm:inline-flex">Catálogo profissional</Badge>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-10">
        <Link href="/catalogo" className="mb-7 inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition-colors hover:text-primary">
          <ArrowLeft className="w-4 h-4" /> Voltar ao catálogo
        </Link>

        <div className="grid gap-10 lg:grid-cols-2 lg:gap-14">
          <div className="space-y-4">
            <div className="group relative aspect-square overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
              {product.images[0] ? (
                <Image src={product.images[0].url} alt={product.name} fill className="object-cover transition-transform duration-700 group-hover:scale-[1.03]" unoptimized />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-300">
                  <PackageSearch className="h-16 w-16" />
                </div>
              )}
              {product.featured && <Badge className="absolute left-5 top-5 gap-1.5 px-3 py-1.5 shadow-lg"><Star className="h-3.5 w-3.5 fill-current" /> Produto em destaque</Badge>}
              <div className="absolute bottom-5 right-5 rounded-full bg-white/90 p-2.5 text-slate-600 opacity-0 shadow-md backdrop-blur transition-opacity group-hover:opacity-100"><Maximize2 className="h-4 w-4" /></div>
            </div>
            {product.images.length > 1 && (
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
                {product.images.slice(1).map((img) => (
                  <div key={img.id} className="relative aspect-square overflow-hidden rounded-xl border-2 border-transparent bg-white shadow-sm transition-all hover:border-primary">
                    <Image src={img.url} alt={product.name} fill className="object-cover transition-transform hover:scale-105" unoptimized />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="lg:py-3">
              <div className="flex flex-wrap items-center gap-2">
                {product.category && <Badge variant="secondary" className="px-3 py-1">{product.category.name}</Badge>}
                {product.allowsCustomization && <Badge variant="outline" className="border-primary/30 bg-primary/5 text-primary"><Sparkles className="mr-1 h-3 w-3" /> Personalizável</Badge>}
              </div>
              <h1 className="mt-5 text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">{product.name}</h1>
              {product.code && <p className="mt-2 text-xs font-medium uppercase tracking-wider text-slate-400">Código {product.code}</p>}
              <p className="mt-5 text-base leading-7 text-slate-600">{product.description || 'Equipamento profissional desenvolvido para entregar desempenho, durabilidade e praticidade à sua operação.'}</p>

              <Card className="mt-7 border-slate-200/80 shadow-sm">
                <CardContent className="grid gap-4 p-5 sm:grid-cols-2">
                  {hasDims && <div className="flex gap-3"><div className="rounded-xl bg-primary/10 p-2.5 text-primary"><Ruler className="h-5 w-5" /></div><div><p className="text-xs font-medium uppercase tracking-wide text-slate-400">Dimensões padrão</p><p className="mt-1 text-sm font-semibold text-slate-800">{dims.width || '-'} × {dims.height || '-'} × {dims.length || '-'} cm</p></div></div>}
                  {dims.weight > 0 && <div><p className="text-xs font-medium uppercase tracking-wide text-slate-400">Peso</p><p className="mt-1 text-sm font-semibold text-slate-800">{dims.weight} kg</p></div>}
                  {product.material && <div><p className="text-xs font-medium uppercase tracking-wide text-slate-400">Material</p><p className="mt-1 text-sm font-semibold text-slate-800">{product.material}</p></div>}
                  {product.finish && <div><p className="text-xs font-medium uppercase tracking-wide text-slate-400">Acabamento</p><p className="mt-1 text-sm font-semibold text-slate-800">{product.finish}</p></div>}
                  {product.family && <div><p className="text-xs font-medium uppercase tracking-wide text-slate-400">Família</p><p className="mt-1 text-sm font-semibold text-slate-800">{product.family}</p></div>}
                </CardContent>
              </Card>

              <div className="mt-7 rounded-2xl bg-slate-900 p-5 text-white shadow-xl shadow-slate-900/10">
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">Condição comercial</p>
                <p className="mt-1 text-2xl font-bold">
                  {product.priceMode === 'exibir' && product.price ? `R$ ${product.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'Preço sob consulta'}
                </p>
                <p className="mt-2 text-sm text-slate-400">Adicione à cesta para solicitar uma proposta personalizada.</p>
              </div>

              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="lg" className="mt-4 h-14 w-full rounded-xl text-base shadow-lg shadow-primary/20"><ShoppingCart className="mr-2 h-5 w-5" /> Adicionar à cesta</Button>
                </DialogTrigger>
                <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
                  <DialogHeader><DialogTitle className="text-xl">Personalize sua solicitação</DialogTitle><p className="text-sm text-muted-foreground">{product.name}</p></DialogHeader>
                  {form && (
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <Label>Quantidade</Label>
                        <Input type="number" min={1} step={1} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) || 1 })} />
                      </div>
                      {product.allowsCustomization && (
                        <>
                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                            <div className="space-y-1.5"><Label>Largura (cm)</Label><Input type="number" value={form.width} onChange={(e) => setForm({ ...form, width: e.target.value })} /></div>
                            <div className="space-y-1.5"><Label>Altura (cm)</Label><Input type="number" value={form.height} onChange={(e) => setForm({ ...form, height: e.target.value })} /></div>
                            <div className="space-y-1.5 col-span-2 sm:col-span-1"><Label>Comprimento (cm)</Label><Input type="number" value={form.length} onChange={(e) => setForm({ ...form, length: e.target.value })} /></div>
                          </div>
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            <div className="space-y-1.5"><Label>Material</Label><Input value={form.material} onChange={(e) => setForm({ ...form, material: e.target.value })} /></div>
                            <div className="space-y-1.5"><Label>Acabamento</Label><Input value={form.finish} onChange={(e) => setForm({ ...form, finish: e.target.value })} /></div>
                          </div>
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            <div className="space-y-1.5"><Label>Voltagem</Label><Input value={form.voltage} onChange={(e) => setForm({ ...form, voltage: e.target.value })} placeholder="Ex.: 220V" /></div>
                            <div className="space-y-1.5"><Label>Lado de operação</Label><Input value={form.operationSide} onChange={(e) => setForm({ ...form, operationSide: e.target.value })} placeholder="Ex.: esquerdo" /></div>
                          </div>
                          <div className="space-y-1.5"><Label>Acessórios</Label><Input value={form.accessories} onChange={(e) => setForm({ ...form, accessories: e.target.value })} /></div>
                          <div className="space-y-1.5"><Label>Modificações solicitadas</Label><Textarea rows={2} value={form.modifications} onChange={(e) => setForm({ ...form, modifications: e.target.value })} /></div>
                        </>
                      )}
                      <div className="space-y-1.5"><Label>Observações deste item</Label><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
                    </div>
                  )}
                  <DialogFooter>
                    <Button onClick={handleAddToCart} className="w-full sm:w-auto"><ShoppingCart className="mr-2 h-4 w-4" /> Adicionar à cesta</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              <div className="mt-5 grid gap-3 text-sm text-slate-600 sm:grid-cols-2">
                <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" /> Atendimento especializado</div>
                <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary" /> Orçamento sem compromisso</div>
              </div>
          </div>
        </div>
      </main>
    </div>
  )
}
