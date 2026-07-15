import { NextRequest } from 'next/server'
import { requireModulePermission, ok, handleRouteError } from '@/lib/api-utils'
import { requisitionService } from '@/app/services/requisition.service'

type RouteContext = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requireModulePermission('requisicoes', 'update')
    const { id } = await ctx.params
    const { status } = await req.json()

    const result = await requisitionService.changeStatus(id, status, user.id)
    return ok(result)
  } catch (error) {
    return handleRouteError(error, 'Erro ao alterar status')
  }
}
