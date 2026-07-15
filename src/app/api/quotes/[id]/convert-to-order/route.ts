import { NextRequest } from 'next/server'
import { requireModulePermission, created, handleRouteError } from '@/lib/api-utils'
import { quoteService } from '@/app/services/quote.service'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * POST /api/quotes/[id]/convert-to-order
 *
 * Converte um orçamento APROVADO em Pedido de Venda. Ação manual (não automática):
 * o orçamento continua existindo normalmente, o Pedido de Venda passa a representar
 * a venda efetivada, com vínculo de rastreabilidade ao orçamento de origem.
 */
export async function POST(_req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requireModulePermission('orcamentos', 'update')
    const { id } = await ctx.params

    const salesOrder = await quoteService.convertToSalesOrder(id, user.id)
    return created(salesOrder)
  } catch (error) {
    return handleRouteError(error, 'Erro ao converter orçamento em pedido de venda')
  }
}
