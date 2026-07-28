import { NextRequest } from 'next/server'
import { ok, badRequest, handleRouteError } from '@/lib/api-utils'
import { quoteService } from '@/app/services/quote.service'

type RouteContext = { params: Promise<{ token: string }> }

/**
 * Rota pública (sem autenticação) — ADR-024 addendum. O token na URL É a autorização (padrão
 * "capability URL"), então esta rota nunca chama `requireAuth`/`requireModulePermission`. Só devolve
 * um subconjunto de campos "voltados pro cliente" (mesmo conjunto já exposto no PDF comercial hoje) —
 * nunca `internalNotes`, `userId`, identidade do vendedor, ou o próprio token.
 */
function toPublicView(quote: Awaited<ReturnType<typeof quoteService.getByPublicToken>>) {
  return {
    number: quote.number,
    date: quote.date,
    validUntil: quote.validUntil,
    validity: quote.validity,
    clientName: quote.clientName,
    clientCnpj: quote.clientCnpj,
    clientAddress: quote.clientAddress,
    clientNeighborhood: quote.clientNeighborhood,
    clientCep: quote.clientCep,
    clientContact: quote.clientContact,
    clientEmail: quote.clientEmail,
    clientPhone: quote.clientPhone,
    items: quote.items.map((item) => ({
      code: item.code,
      description: item.description,
      quantity: item.quantity,
      unit: item.unit,
      unitPrice: item.unitPrice,
      total: item.total,
      order: item.order,
    })),
    subtotal: quote.subtotal,
    discountType: quote.discountType,
    discountValue: quote.discountValue,
    discountTotal: quote.discountTotal,
    freightMode: quote.freightMode,
    freightText: quote.freightText,
    freightValue: quote.freightValue,
    total: quote.total,
    warranty: quote.warranty,
    deliveryTime: quote.deliveryTime,
    paymentTerms: quote.paymentTerms,
    generalConditions: quote.generalConditions,
    notes: quote.notes,
    status: quote.status,
  }
}

export async function GET(_req: NextRequest, ctx: RouteContext) {
  try {
    const { token } = await ctx.params
    const quote = await quoteService.getByPublicToken(token)
    return ok(toPublicView(quote))
  } catch (error) {
    return handleRouteError(error, 'Erro ao carregar orçamento')
  }
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  try {
    const { token } = await ctx.params
    const { decision } = await req.json()
    if (decision !== 'approved' && decision !== 'rejected') {
      return badRequest('Decisão inválida — use "approved" ou "rejected"')
    }

    const result = await quoteService.confirmByClient(token, decision)
    return ok(result)
  } catch (error) {
    return handleRouteError(error, 'Erro ao confirmar orçamento')
  }
}
