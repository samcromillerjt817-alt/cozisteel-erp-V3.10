import { NextRequest } from 'next/server'
import { requireModulePermission, ok, handleRouteError } from '@/lib/api-utils'
import { validateDto, changeBomRevisionStatusSchema } from '@/app/dto'
import { bomService } from '@/app/services/bom.service'

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requireModulePermission('produtos', 'update')
    const { id } = await ctx.params
    const body = await req.json()
    const { status, reason } = validateDto(changeBomRevisionStatusSchema, body)

    const revision = await bomService.changeStatus(id, status, user.id, reason)
    return ok(revision)
  } catch (error) {
    return handleRouteError(error, 'Erro ao mudar status da revisão de engenharia')
  }
}
