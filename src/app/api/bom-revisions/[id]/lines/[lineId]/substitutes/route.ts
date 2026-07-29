import { NextRequest } from 'next/server'
import { requireAuth, requireModulePermission, ok, created, handleRouteError } from '@/lib/api-utils'
import { validateDto, bomLineSubstituteSchema } from '@/app/dto'
import { bomService } from '@/app/services/bom.service'

type RouteContext = { params: Promise<{ id: string; lineId: string }> }

export async function GET(_req: NextRequest, ctx: RouteContext) {
  try {
    await requireAuth()
    const { id, lineId } = await ctx.params
    const substitutes = await bomService.listSubstitutes(id, lineId)
    return ok(substitutes)
  } catch (error) {
    return handleRouteError(error, 'Erro ao buscar materiais substitutos')
  }
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  try {
    await requireModulePermission('produtos', 'update')
    const { id, lineId } = await ctx.params
    const body = await req.json()
    const { materialId, notes } = validateDto(bomLineSubstituteSchema, body)

    const substitute = await bomService.addSubstitute(id, lineId, materialId, notes)
    return created(substitute)
  } catch (error) {
    return handleRouteError(error, 'Erro ao adicionar material substituto')
  }
}
