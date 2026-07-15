import { NextRequest } from 'next/server'
import { requireAuth, requireModulePermission, ok, handleRouteError } from '@/lib/api-utils'
import { validateDto, updateRequisitionSchema } from '@/app/dto'
import { requisitionService } from '@/app/services/requisition.service'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: RouteContext) {
  try {
    await requireAuth()
    const { id } = await ctx.params

    const requisition = await requisitionService.getById(id)
    return ok(requisition)
  } catch (error) {
    return handleRouteError(error, 'Erro ao buscar requisição')
  }
}

/** Only draft requisitions can have their items edited — once sent/approved, use the status route to advance the flow. */
export async function PUT(req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requireModulePermission('requisicoes', 'update')
    const { id } = await ctx.params
    const body = await req.json()
    const data = validateDto(updateRequisitionSchema, body)

    const updated = await requisitionService.update(id, data, user.id)
    return ok(updated)
  } catch (error) {
    return handleRouteError(error, 'Erro ao atualizar requisição')
  }
}

export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requireModulePermission('requisicoes', 'delete')
    const { id } = await ctx.params

    const result = await requisitionService.delete(id, user.id)
    return ok(result)
  } catch (error) {
    return handleRouteError(error, 'Erro ao excluir requisição')
  }
}
