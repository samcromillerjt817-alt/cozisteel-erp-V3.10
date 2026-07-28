import { NextRequest } from 'next/server'
import { requireModulePermission, ok, handleRouteError } from '@/lib/api-utils'
import { catalogRequestService } from '@/app/services/catalog-request.service'

type RouteContext = { params: Promise<{ id: string }> }

/** Detalhe de uma solicitação do Catálogo Digital Público (ADR-026, Fase 4). */
export async function GET(_req: NextRequest, ctx: RouteContext) {
  try {
    await requireModulePermission('catalogo', 'read')
    const { id } = await ctx.params
    const catalogRequest = await catalogRequestService.getById(id)
    return ok(catalogRequest)
  } catch (error) {
    return handleRouteError(error, 'Erro ao buscar solicitação')
  }
}
