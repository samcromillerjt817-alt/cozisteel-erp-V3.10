'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowLeft, CheckCircle2, ClipboardCheck, Loader2, LockKeyhole, PackageSearch, ShoppingBag, Trash2, UserRound } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Separator } from '@/components/ui/separator'
import { useCatalogCart } from '@/hooks/use-catalog-cart'
import { maskCpfCnpj, maskPhone } from '@/lib/masks'

interface ClientForm {
  clientName: string
  clientCpfCnpj: string
  clientContact: string
  clientEmail: string
  clientPhone: string
  clientCity: string
  clientState: string
  clientCompany: string
  generalNotes: string
}

const EMPTY_CLIENT_FORM: ClientForm = {
  clientName: '', clientCpfCnpj: '', clientContact: '', clientEmail: '',
  clientPhone: '', clientCity: '', clientState: '', clientCompany: '', generalNotes: '',
}

type SubmitState = { phase: 'idle' } | { phase: 'sending' } | { phase: 'done'; protocol: string } | { phase: 'error'; message: string }

/**
 * Cesta + identificação + revisão final (ADR-026, Fase 3) — identificação do cliente só aparece
 * aqui, na revisão final, nunca antes de navegar o catálogo (decisão do usuário). Idempotência via
 * chave gerada uma vez por sessão desta página — reenvio (duplo-clique, F5 após enviar) reaproveita
 * o mesmo protocolo, nunca duplica.
 */
export default function CarrinhoPage() {
  const { items, updateItem, removeItem, clear } = useCatalogCart()
  const [form, setForm] = useState<ClientForm>(EMPTY_CLIENT_FORM)
  const [consent, setConsent] = useState(false)
  const [idempotencyKey] = useState(() => crypto.randomUUID())
  const [state, setState] = useState<SubmitState>({ phase: 'idle' })

  async function handleSubmit() {
    if (items.length === 0 || !form.clientName.trim() || !consent) return
    setState({ phase: 'sending' })
    try {
      const r = await fetch('/api/public/catalog-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idempotencyKey,
          ...form,
          items: items.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
            width: i.width,
            height: i.height,
            length: i.length,
            material: i.material,
            finish: i.finish,
            voltage: i.voltage,
            operationSide: i.operationSide,
            accessories: i.accessories,
            modifications: i.modifications,
            notes: i.notes,
          })),
        }),
      })
      if (!r.ok) throw new Error('falha ao enviar')
      const json = (await r.json()) as { protocol: string }
      clear()
      setState({ phase: 'done', protocol: json.protocol })
    } catch {
      setState({ phase: 'error', message: 'Não foi possível enviar sua solicitação. Tente novamente.' })
    }
  }

  if (state.phase === 'done') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <Card className="max-w-lg w-full border-0 shadow-2xl">
          <CardContent className="flex flex-col items-center gap-5 px-8 py-12 text-center">
            <div className="rounded-full bg-emerald-100 p-5"><CheckCircle2 className="h-12 w-12 text-emerald-600" /></div>
            <div><p className="text-2xl font-bold text-slate-900">Solicitação enviada!</p><p className="mt-2 text-sm text-slate-500">Recebemos os dados do seu projeto.</p></div>
            <div className="w-full rounded-xl bg-slate-100 p-4"><p className="text-xs uppercase tracking-widest text-slate-400">Protocolo</p><p className="mt-1 font-mono text-lg font-bold text-slate-800">{state.protocol}</p></div>
            <p className="text-sm text-slate-500">Nossa equipe vai analisar sua solicitação e entrar em contato em breve.</p>
            <Button asChild className="mt-2 w-full"><Link href="/catalogo">Voltar ao catálogo</Link></Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50/70">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
          <Link href="/catalogo" className="text-xl font-black tracking-tight text-slate-900">Cozisteel</Link>
          <div className="flex items-center gap-2 text-xs font-medium text-slate-500"><LockKeyhole className="h-4 w-4 text-primary" /> Ambiente seguro</div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-10">
        <Link href="/catalogo" className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition-colors hover:text-primary">
          <ArrowLeft className="w-4 h-4" /> Continuar navegando o catálogo
        </Link>
        <div className="my-7">
          <p className="text-sm font-semibold uppercase tracking-widest text-primary">Solicitação de orçamento</p>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-900 sm:text-4xl">Revise seu projeto</h1>
          <p className="mt-2 text-slate-500">Confira os equipamentos e conte-nos como podemos entrar em contato.</p>
        </div>

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(340px,.75fr)]">
        <div className="space-y-6">
        <Card className="border-slate-200/80 shadow-sm">
          <CardHeader className="flex-row items-center justify-between space-y-0 border-b">
            <div><CardTitle className="flex items-center gap-2 text-xl"><ShoppingBag className="h-5 w-5 text-primary" /> Sua cesta</CardTitle><p className="mt-1 text-sm text-slate-500">{items.length} {items.length === 1 ? 'item selecionado' : 'itens selecionados'}</p></div>
          </CardHeader>
          <CardContent className="space-y-3">
            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-4 py-14 text-center">
                <div className="rounded-full bg-primary/10 p-5"><PackageSearch className="h-10 w-10 text-primary" /></div>
                <div><p className="font-bold text-slate-900">Sua cesta está vazia</p><p className="mt-1 text-sm text-slate-500">Explore o catálogo e escolha os equipamentos para seu projeto.</p></div>
                <Button asChild variant="outline"><Link href="/catalogo">Explorar catálogo</Link></Button>
              </div>
            ) : (
              items.map((item) => (
                <div key={item.id} className="flex gap-4 border-b border-slate-100 py-5 first:pt-5 last:border-b-0">
                  <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-slate-100 sm:h-28 sm:w-28">
                    {item.productImage ? (
                      <Image src={item.productImage} alt={item.productName} fill className="object-cover" unoptimized />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-300"><PackageSearch className="w-5 h-5" /></div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 space-y-2">
                    <p className="font-bold text-slate-900">{item.productName}</p>
                    <div className="flex items-center gap-3">
                      <Label className="text-xs font-semibold uppercase tracking-wide text-slate-400">Quantidade</Label>
                      <Input
                        type="number" min={1} className="h-9 w-20 rounded-lg"
                        value={item.quantity}
                        onChange={(e) => updateItem(item.id, { quantity: Number(e.target.value) || 1 })}
                      />
                    </div>
                    {(item.width || item.height || item.length) && (
                      <p className="inline-flex rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600">{item.width || '-'} × {item.height || '-'} × {item.length || '-'} cm</p>
                    )}
                    {(item.material || item.finish || item.voltage) && (
                      <p className="text-xs text-slate-500">
                        {[item.material, item.finish, item.voltage].filter(Boolean).join(' · ')}
                      </p>
                    )}
                  </div>
                  <Button variant="ghost" size="icon" className="shrink-0 rounded-full hover:bg-destructive/10" onClick={() => removeItem(item.id)} title="Remover">
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {items.length > 0 && (
          <Card className="border-slate-200/80 shadow-sm">
            <CardHeader className="border-b"><CardTitle className="flex items-center gap-2 text-xl"><UserRound className="h-5 w-5 text-primary" /> Seus dados</CardTitle><p className="text-sm text-slate-500">Usaremos estas informações apenas para preparar e retornar seu orçamento.</p></CardHeader>
            <CardContent className="grid gap-4 pt-6 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Nome ou razão social *</Label>
                <Input className="h-11" placeholder="Nome completo ou razão social" value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>CPF ou CNPJ</Label>
                <Input className="h-11" placeholder="00.000.000/0000-00" value={form.clientCpfCnpj} onChange={(e) => setForm({ ...form, clientCpfCnpj: maskCpfCnpj(e.target.value) })} />
              </div>
              <div className="space-y-1.5">
                <Label>Nome do responsável</Label>
                <Input value={form.clientContact} onChange={(e) => setForm({ ...form, clientContact: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>E-mail</Label>
                <Input className="h-11" type="email" placeholder="voce@empresa.com.br" value={form.clientEmail} onChange={(e) => setForm({ ...form, clientEmail: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Telefone/WhatsApp</Label>
                <Input className="h-11" placeholder="(00) 00000-0000" value={form.clientPhone} onChange={(e) => setForm({ ...form, clientPhone: maskPhone(e.target.value) })} />
              </div>
              <div className="space-y-1.5">
                <Label>Cidade</Label>
                <Input value={form.clientCity} onChange={(e) => setForm({ ...form, clientCity: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Estado (UF)</Label>
                <Input maxLength={2} value={form.clientState} onChange={(e) => setForm({ ...form, clientState: e.target.value.toUpperCase() })} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Empresa</Label>
                <Input value={form.clientCompany} onChange={(e) => setForm({ ...form, clientCompany: e.target.value })} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Observações gerais (prazo, local de instalação, entrega...)</Label>
                <Textarea rows={3} value={form.generalNotes} onChange={(e) => setForm({ ...form, generalNotes: e.target.value })} />
              </div>
            </CardContent>
          </Card>
        )}
        </div>

        {items.length > 0 && (
          <Card className="border-0 shadow-xl lg:sticky lg:top-6">
            <CardHeader className="rounded-t-xl bg-slate-900 text-white"><CardTitle className="flex items-center gap-2 text-lg"><ClipboardCheck className="h-5 w-5 text-primary" /> Revisão final</CardTitle></CardHeader>
            <CardContent className="space-y-5 pt-6">
              <div className="flex items-center justify-between"><span className="text-sm text-slate-500">Equipamentos</span><span className="font-bold">{items.length}</span></div>
              <div className="flex items-center justify-between"><span className="text-sm text-slate-500">Quantidade total</span><span className="font-bold">{items.reduce((sum, item) => sum + item.quantity, 0)}</span></div>
              <Separator />
              <div className="rounded-xl bg-primary/5 p-4 text-sm leading-relaxed text-slate-600">
                Esta solicitação não representa preço, pedido ou prazo confirmado. Nossa equipe retornará com um orçamento formal.
              </div>
              <div className="flex items-start gap-3 rounded-xl border p-4">
                <Checkbox id="consent" className="mt-0.5" checked={consent} onCheckedChange={(v) => setConsent(v === true)} />
                <Label htmlFor="consent" className="text-xs font-normal leading-relaxed text-slate-600">Concordo com o uso dos meus dados para fins de elaboração deste orçamento.</Label>
              </div>
              {state.phase === 'error' && <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{state.message}</p>}
            </CardContent>
            <CardFooter className="flex-col gap-3">
              <Button className="h-12 w-full rounded-xl text-base shadow-lg shadow-primary/20" disabled={state.phase === 'sending' || !form.clientName.trim() || !consent} onClick={handleSubmit}>
                {state.phase === 'sending' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Enviar solicitação
              </Button>
              <p className="flex items-center gap-1.5 text-center text-[11px] text-slate-400"><LockKeyhole className="h-3 w-3" /> Seus dados são enviados com segurança.</p>
            </CardFooter>
          </Card>
        )}
        </div>
      </main>
    </div>
  )
}
