import { NextRequest } from 'next/server'
import { requireAuth, ok, handleRouteError } from '@/lib/api-utils'
import { requisitionService } from '@/app/services/requisition.service'

type RouteContext = { params: Promise<{ id: string; itemId: string; quoteId: string }> }

/**
 * POST /api/requisitions/[id]/items/[itemId]/quotes/[quoteId]/select
 *
 * Marca a cotação como vencedora e grava o fornecedor/preço escolhidos de volta
 * no RequisitionItem — a partir daí ele representa o Pedido de Compra definitivo.
 */
export async function POST(_req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requireAuth()
    const { itemId, quoteId } = await ctx.params

    const item = await requisitionService.selectItemQuote(itemId, quoteId, user.id)
    return ok(item)
  } catch (error) {
    return handleRouteError(error, 'Erro ao selecionar cotação')
  }
}
