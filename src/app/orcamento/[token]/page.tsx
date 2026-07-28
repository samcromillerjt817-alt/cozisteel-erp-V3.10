'use client'

import { useEffect, useState, use } from 'react'
import { CheckCircle2, XCircle, AlertTriangle, Loader2 } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { formatCurrency } from '@/lib/format'

interface PublicQuoteItem {
  code: string
  description: string
  quantity: number
  unit: string
  unitPrice: number
  total: number
  order: number
}

interface PublicQuoteView {
  number: string
  date: string
  validUntil: string
  validity: string
  clientName: string
  clientAddress: string
  clientNeighborhood: string
  clientCep: string
  clientContact: string
  items: PublicQuoteItem[]
  subtotal: number
  discountTotal: number
  freightText: string
  freightValue: number
  total: number
  warranty: string
  deliveryTime: string
  paymentTerms: string
  generalConditions: string
  notes: string
  status: string
}

type PageState =
  | { phase: 'loading' }
  | { phase: 'invalid' }
  | { phase: 'ready'; quote: PublicQuoteView }
  | { phase: 'confirming'; quote: PublicQuoteView }
  | { phase: 'done'; decision: 'approved' | 'rejected' }

/**
 * Página pública (sem autenticação) de confirmação de orçamento — ADR-024 addendum. O token na URL é
 * a autorização; qualquer erro ao buscar (link inválido, orçamento fora de "sent", ou validade
 * vencida) mostra a mesma mensagem genérica de "link inválido/expirado", sem distinguir o motivo.
 */
export default function PublicQuotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [state, setState] = useState<PageState>({ phase: 'loading' })

  useEffect(() => {
    fetch(`/api/public/quotes/${token}`)
      .then(async (r) => {
        if (!r.ok) throw new Error('invalid')
        const quote = (await r.json()) as PublicQuoteView
        setState({ phase: 'ready', quote })
      })
      .catch(() => setState({ phase: 'invalid' }))
  }, [token])

  async function decide(decision: 'approved' | 'rejected') {
    if (state.phase !== 'ready') return
    setState({ phase: 'confirming', quote: state.quote })
    try {
      const r = await fetch(`/api/public/quotes/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      })
      if (!r.ok) throw new Error('invalid')
      setState({ phase: 'done', decision })
    } catch {
      setState({ phase: 'invalid' })
    }
  }

  if (state.phase === 'loading') {
    return (
      <Centered>
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </Centered>
    )
  }

  if (state.phase === 'invalid') {
    return (
      <Centered>
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 flex flex-col items-center text-center gap-3">
            <AlertTriangle className="w-10 h-10 text-amber-500" />
            <p className="font-medium">Link inválido ou expirado</p>
            <p className="text-sm text-slate-500">
              Entre em contato com quem enviou este orçamento para receber uma versão atualizada.
            </p>
          </CardContent>
        </Card>
      </Centered>
    )
  }

  if (state.phase === 'done') {
    const approved = state.decision === 'approved'
    return (
      <Centered>
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 flex flex-col items-center text-center gap-3">
            {approved ? (
              <CheckCircle2 className="w-10 h-10 text-emerald-500" />
            ) : (
              <XCircle className="w-10 h-10 text-slate-400" />
            )}
            <p className="font-medium">
              {approved ? 'Orçamento aprovado com sucesso!' : 'Orçamento recusado.'}
            </p>
            <p className="text-sm text-slate-500">
              {approved
                ? 'Obrigado pela confirmação — nossa equipe já foi avisada e vai dar sequência ao pedido.'
                : 'Obrigado por avisar. Se quiser revisar os termos, entre em contato com nossa equipe.'}
            </p>
          </CardContent>
        </Card>
      </Centered>
    )
  }

  const quote = state.quote
  const confirming = state.phase === 'confirming'

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Orçamento {quote.number}</CardTitle>
            <p className="text-sm text-slate-500">
              {quote.clientName} — emitido em {quote.date}
              {quote.validUntil ? ` — válido até ${quote.validUntil}` : ''}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              {quote.items.map((item, idx) => (
                <div key={idx} className="flex justify-between text-sm border-b border-slate-100 pb-2">
                  <div>
                    <p className="font-medium">{item.description}</p>
                    <p className="text-slate-500">{item.quantity} {item.unit} × {formatCurrency(item.unitPrice)}</p>
                  </div>
                  <p className="font-mono">{formatCurrency(item.total)}</p>
                </div>
              ))}
            </div>

            <Separator />

            <div className="space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span className="font-mono">{formatCurrency(quote.subtotal)}</span></div>
              {quote.discountTotal > 0 && (
                <div className="flex justify-between"><span className="text-slate-500">Desconto</span><span className="font-mono">-{formatCurrency(quote.discountTotal)}</span></div>
              )}
              <div className="flex justify-between"><span className="text-slate-500">Frete</span><span>{quote.freightValue > 0 ? formatCurrency(quote.freightValue) : quote.freightText}</span></div>
              <div className="flex justify-between text-base font-semibold pt-1"><span>Total</span><span className="font-mono">{formatCurrency(quote.total)}</span></div>
            </div>

            <Separator />

            <div className="space-y-1 text-sm text-slate-600">
              {quote.deliveryTime && <p><span className="font-medium">Prazo de entrega:</span> {quote.deliveryTime}</p>}
              {quote.paymentTerms && <p><span className="font-medium">Condições de pagamento:</span> {quote.paymentTerms}</p>}
              {quote.warranty && <p><span className="font-medium">Garantia:</span> {quote.warranty}</p>}
              {quote.generalConditions && <p><span className="font-medium">Condições gerais:</span> {quote.generalConditions}</p>}
              {quote.notes && <p><span className="font-medium">Observações:</span> {quote.notes}</p>}
            </div>
          </CardContent>
          <CardFooter className="flex gap-2 justify-end">
            <Button variant="outline" disabled={confirming} onClick={() => decide('rejected')}>
              {confirming ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <XCircle className="w-4 h-4 mr-1" />}
              Recusar
            </Button>
            <Button disabled={confirming} onClick={() => decide('approved')}>
              {confirming ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-1" />}
              Aprovar
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">{children}</div>
}
