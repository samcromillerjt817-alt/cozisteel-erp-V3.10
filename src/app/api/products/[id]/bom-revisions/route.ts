import { NextRequest } from 'next/server'
import { requireAuth, requireModulePermission, ok, created, handleRouteError } from '@/lib/api-utils'
import { validateDto, createBomRevisionSchema } from '@/app/dto'
import { bomService } from '@/app/services/bom.service'

type RouteContext = { params: Promise<{ id: string }> }

/** ADR-023 (item 4, "completar a BOM formal") — primeira rota do motor de engenharia (Fase 4,
 * ADR-005): existia service e testes desde então, mas nenhuma forma de chamá-lo. */
export async function GET(_req: NextRequest, ctx: RouteContext) {
  try {
    await requireAuth()
    const { id: productId } = await ctx.params
    const revisions = await bomService.listRevisions(productId)
    return ok(revisions)
  } catch (error) {
    return handleRouteError(error, 'Erro ao buscar revisões de engenharia do produto')
  }
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requireModulePermission('produtos', 'update')
    const { id: productId } = await ctx.params
    const body = await req.json()
    const data = validateDto(createBomRevisionSchema, body)

    const revision = await bomService.createRevision(productId, data, user.id)
    return created(revision)
  } catch (error) {
    return handleRouteError(error, 'Erro ao criar revisão de engenharia')
  }
}
