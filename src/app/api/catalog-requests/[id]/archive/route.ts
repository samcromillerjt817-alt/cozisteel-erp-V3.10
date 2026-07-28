import { NextRequest } from 'next/server'
import { requireModulePermission, ok, handleRouteError } from '@/lib/api-utils'
import { catalogRequestService } from '@/app/services/catalog-request.service'

type RouteContext = { params: Promise<{ id: string }> }

/** Arquiva uma solicitação — nunca altera o Orçamento já gerado (ADR-026, Parte 14). */
export async function PATCH(req: NextRequest, ctx: RouteContext) {
  try {
    await requireModulePermission('catalogo', 'update')
    const { id } = await ctx.params
    const { reason } = await req.json()
    const result = await catalogRequestService.archive(id, reason || '')
    return ok(result)
  } catch (error) {
    return handleRouteError(error, 'Erro ao arquivar solicitação')
  }
}
