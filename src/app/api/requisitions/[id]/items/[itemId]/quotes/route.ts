import { NextRequest } from 'next/server'
import { requireAuth, ok, created, handleRouteError } from '@/lib/api-utils'
import { requisitionService } from '@/app/services/requisition.service'

type RouteContext = { params: Promise<{ id: string; itemId: string }> }

/** Lists all supplier quotes (cotações) registered for a requisition item */
export async function GET(_req: NextRequest, ctx: RouteContext) {
  try {
    await requireAuth()
    const { itemId } = await ctx.params

    const quotes = await requisitionService.listItemQuotes(itemId)
    return ok(quotes)
  } catch (error) {
    return handleRouteError(error, 'Erro ao buscar cotações')
  }
}

/** Registers a new supplier quote (cotação) for a requisition item */
export async function POST(req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requireAuth()
    const { id: requisitionId, itemId } = await ctx.params
    const body = await req.json()

    const quote = await requisitionService.createItemQuote(requisitionId, itemId, body, user.id)
    return created(quote)
  } catch (error) {
    return handleRouteError(error, 'Erro ao registrar cotação')
  }
}
