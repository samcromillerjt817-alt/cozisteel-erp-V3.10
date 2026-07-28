import { NextRequest } from 'next/server'
import { requireModulePermission, ok, handleRouteError } from '@/lib/api-utils'
import { validateDto, bomLineSchema } from '@/app/dto'
import { bomService } from '@/app/services/bom.service'

type RouteContext = { params: Promise<{ id: string; lineId: string }> }

export async function PUT(req: NextRequest, ctx: RouteContext) {
  try {
    await requireModulePermission('produtos', 'update')
    const { id, lineId } = await ctx.params
    const body = await req.json()
    const data = validateDto(bomLineSchema, body)

    const line = await bomService.updateLine(id, lineId, data)
    return ok(line)
  } catch (error) {
    return handleRouteError(error, 'Erro ao atualizar linha da estrutura')
  }
}

export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  try {
    await requireModulePermission('produtos', 'update')
    const { id, lineId } = await ctx.params
    const result = await bomService.removeLine(id, lineId)
    return ok(result)
  } catch (error) {
    return handleRouteError(error, 'Erro ao remover linha da estrutura')
  }
}
