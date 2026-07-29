import { NextRequest } from 'next/server'
import { requireModulePermission, ok, handleRouteError } from '@/lib/api-utils'
import { bomService } from '@/app/services/bom.service'

type RouteContext = { params: Promise<{ id: string; lineId: string; substituteId: string }> }

export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  try {
    await requireModulePermission('produtos', 'update')
    const { id, lineId, substituteId } = await ctx.params
    const result = await bomService.removeSubstitute(id, lineId, substituteId)
    return ok(result)
  } catch (error) {
    return handleRouteError(error, 'Erro ao remover material substituto')
  }
}
