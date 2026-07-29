import { NextRequest } from 'next/server'
import { requireModulePermission, ok, handleRouteError } from '@/lib/api-utils'
import { quoteService } from '@/app/services/quote.service'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * Reatribuir responsável e/ou mudar o sub-status de triagem de um Orçamento (ADR-026, Fase 4) — usado
 * pela fila de triagem do Catálogo Digital, mas se aplica a qualquer Orçamento. Método dedicado
 * (`quoteService.reassignAndStage`) em vez de `PATCH /api/quotes/[id]`, que sempre substitui itens.
 */
export async function PATCH(req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requireModulePermission('orcamentos', 'update')
    const { id } = await ctx.params
    const { userId, internalStage } = await req.json()

    const result = await quoteService.reassignAndStage(id, { userId, internalStage }, user.id)
    return ok(result)
  } catch (error) {
    return handleRouteError(error, 'Erro ao atualizar responsável/etapa do orçamento')
  }
}
