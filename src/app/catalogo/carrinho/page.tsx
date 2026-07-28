'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowLeft, PackageSearch, Trash2, CheckCircle2, Loader2 } from 'lucide-react'
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
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 flex flex-col items-center text-center gap-3">
            <CheckCircle2 className="w-10 h-10 text-emerald-500" />
            <p className="font-medium">Solicitação enviada com sucesso!</p>
            <p className="text-sm text-slate-500">Protocolo: <span className="font-mono font-semibold">{state.protocol}</span></p>
            <p className="text-sm text-slate-500">Nossa equipe vai analisar sua solicitação e entrar em contato em breve.</p>
            <Link href="/catalogo" className="text-sm text-primary underline mt-2">Voltar ao catálogo</Link>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        <Link href="/catalogo" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft className="w-4 h-4" /> Continuar navegando o catálogo
        </Link>

        <Card>
          <CardHeader><CardTitle>Sua cesta</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center gap-2">
                <PackageSearch className="w-8 h-8 text-slate-300" />
                <p className="text-sm text-slate-500">Sua cesta está vazia</p>
              </div>
            ) : (
              items.map((item) => (
                <div key={item.id} className="flex gap-3 border-b pb-3 last:border-b-0">
                  <div className="relative w-16 h-16 shrink-0 bg-slate-100 rounded overflow-hidden">
                    {item.productImage ? (
                      <Image src={item.productImage} alt={item.productName} fill className="object-cover" unoptimized />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-300"><PackageSearch className="w-5 h-5" /></div>
                    )}
                  </div>
                  <div className="flex-1 space-y-1">
                    <p className="font-medium text-sm">{item.productName}</p>
                    <div className="flex items-center gap-2">
                      <Label className="text-xs text-slate-400">Qtd.</Label>
                      <Input
                        type="number" min={1} className="w-20 h-8"
                        value={item.quantity}
                        onChange={(e) => updateItem(item.id, { quantity: Number(e.target.value) || 1 })}
                      />
                    </div>
                    {(item.width || item.height || item.length) && (
                      <p className="text-xs text-slate-500">{item.width || '-'} x {item.height || '-'} x {item.length || '-'} cm</p>
                    )}
                    {(item.material || item.finish || item.voltage) && (
                      <p className="text-xs text-slate-500">
                        {[item.material, item.finish, item.voltage].filter(Boolean).join(' · ')}
                      </p>
                    )}
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => removeItem(item.id)} title="Remover">
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {items.length > 0 && (
          <Card>
            <CardHeader><CardTitle>Seus dados</CardTitle></CardHeader>
            <CardContent className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Nome ou razão social *</Label>
                <Input value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>CPF ou CNPJ</Label>
                <Input value={form.clientCpfCnpj} onChange={(e) => setForm({ ...form, clientCpfCnpj: maskCpfCnpj(e.target.value) })} />
              </div>
              <div className="space-y-1.5">
                <Label>Nome do responsável</Label>
                <Input value={form.clientContact} onChange={(e) => setForm({ ...form, clientContact: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>E-mail</Label>
                <Input type="email" value={form.clientEmail} onChange={(e) => setForm({ ...form, clientEmail: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Telefone/WhatsApp</Label>
                <Input value={form.clientPhone} onChange={(e) => setForm({ ...form, clientPhone: maskPhone(e.target.value) })} />
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
            <Separator />
            <CardContent className="space-y-3 pt-4">
              <p className="text-xs text-slate-500">
                Esta solicitação ainda não representa preço, pedido ou prazo confirmado — nossa equipe vai
                analisar e retornar com um orçamento formal.
              </p>
              <div className="flex items-start gap-2">
                <Checkbox id="consent" checked={consent} onCheckedChange={(v) => setConsent(v === true)} />
                <Label htmlFor="consent" className="text-xs font-normal text-slate-600 leading-snug">
                  Concordo com o uso dos meus dados para fins de elaboração deste orçamento.
                </Label>
              </div>
              {state.phase === 'error' && <p className="text-sm text-destructive">{state.message}</p>}
            </CardContent>
            <CardFooter>
              <Button
                className="w-full"
                disabled={state.phase === 'sending' || !form.clientName.trim() || !consent}
                onClick={handleSubmit}
              >
                {state.phase === 'sending' ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
                Enviar solicitação de orçamento
              </Button>
            </CardFooter>
          </Card>
        )}
      </div>
    </div>
  )
}
