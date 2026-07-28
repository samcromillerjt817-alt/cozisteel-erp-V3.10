'use client'

import { useEffect, useState, use } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { toast } from 'sonner'
import { ArrowLeft, PackageSearch, Loader2, ShoppingCart } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
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
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-slate-400" /></div>
  }

  if (state.phase === 'not_found') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-center px-4">
        <PackageSearch className="w-10 h-10 text-slate-300" />
        <p className="text-slate-500">Produto não encontrado</p>
        <Link href="/catalogo" className="text-sm text-primary underline">Voltar ao catálogo</Link>
      </div>
    )
  }

  const { product } = state
  const dims = product.dimensions
  const hasDims = dims.width > 0 || dims.height > 0 || dims.length > 0

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        <Link href="/catalogo" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft className="w-4 h-4" /> Voltar ao catálogo
        </Link>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <div className="relative aspect-square bg-white rounded-lg border overflow-hidden">
              {product.images[0] ? (
                <Image src={product.images[0].url} alt={product.name} fill className="object-cover" unoptimized />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-300">
                  <PackageSearch className="w-12 h-12" />
                </div>
              )}
            </div>
            {product.images.length > 1 && (
              <div className="grid grid-cols-5 gap-2">
                {product.images.slice(1).map((img) => (
                  <div key={img.id} className="relative aspect-square bg-white rounded border overflow-hidden">
                    <Image src={img.url} alt={product.name} fill className="object-cover" unoptimized />
                  </div>
                ))}
              </div>
            )}
          </div>

          <Card>
            <CardContent className="pt-6 space-y-3">
              {product.category && <p className="text-xs text-slate-400">{product.category.name}</p>}
              <h1 className="text-xl font-bold">{product.name}</h1>
              {product.code && <p className="text-xs text-slate-400 font-mono">Cód. {product.code}</p>}
              <div className="flex gap-2 flex-wrap">
                {product.featured && <Badge>Destaque</Badge>}
                {product.allowsCustomization && <Badge variant="outline">Aceita personalização</Badge>}
              </div>

              <p className="text-sm text-slate-600">{product.description || 'Sem descrição disponível.'}</p>

              <Separator />

              <div className="text-sm space-y-1">
                {hasDims && (
                  <p><span className="font-medium">Dimensões padrão:</span> {dims.width || '-'} x {dims.height || '-'} x {dims.length || '-'} cm</p>
                )}
                {dims.weight > 0 && <p><span className="font-medium">Peso:</span> {dims.weight} kg</p>}
                {product.material && <p><span className="font-medium">Material:</span> {product.material}</p>}
                {product.finish && <p><span className="font-medium">Acabamento:</span> {product.finish}</p>}
                {product.family && <p><span className="font-medium">Família:</span> {product.family}</p>}
              </div>

              <Separator />

              <p className="text-sm font-semibold">
                {product.priceMode === 'exibir' && product.price ? `R$ ${product.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'Sob consulta'}
              </p>

              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="w-full"><ShoppingCart className="w-4 h-4 mr-1" /> Adicionar à cesta</Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
                  <DialogHeader><DialogTitle>Adicionar: {product.name}</DialogTitle></DialogHeader>
                  {form && (
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <Label>Quantidade</Label>
                        <Input type="number" min={1} step={1} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) || 1 })} />
                      </div>
                      {product.allowsCustomization && (
                        <>
                          <div className="grid grid-cols-3 gap-2">
                            <div className="space-y-1.5"><Label>Largura (cm)</Label><Input type="number" value={form.width} onChange={(e) => setForm({ ...form, width: e.target.value })} /></div>
                            <div className="space-y-1.5"><Label>Altura (cm)</Label><Input type="number" value={form.height} onChange={(e) => setForm({ ...form, height: e.target.value })} /></div>
                            <div className="space-y-1.5"><Label>Comprimento (cm)</Label><Input type="number" value={form.length} onChange={(e) => setForm({ ...form, length: e.target.value })} /></div>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1.5"><Label>Material</Label><Input value={form.material} onChange={(e) => setForm({ ...form, material: e.target.value })} /></div>
                            <div className="space-y-1.5"><Label>Acabamento</Label><Input value={form.finish} onChange={(e) => setForm({ ...form, finish: e.target.value })} /></div>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
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
                    <Button onClick={handleAddToCart}>Adicionar à cesta</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
