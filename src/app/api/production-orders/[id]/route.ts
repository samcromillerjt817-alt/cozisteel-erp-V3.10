import { NextRequest } from 'next/server'
import { requireAuth, requireModulePermission, ok, handleRouteError } from '@/lib/api-utils'
import { productionOrderService } from '@/app/services/production-order.service'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: RouteContext) {
  try {
    await requireAuth()
    const { id } = await ctx.params

    const order = await productionOrderService.getById(id)
    return ok(order)
  } catch (error) {
    return handleRouteError(error, 'Erro ao buscar ordem de produção')
  }
}

export async function PUT(req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requireModulePermission('producao', 'update')
    const { id } = await ctx.params
    const body = await req.json()

    const updated = await productionOrderService.update(id, body, user.id)
    return ok(updated)
  } catch (error) {
    return handleRouteError(error, 'Erro ao atualizar ordem de produção')
  }
}

export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  try {
    await requireModulePermission('producao', 'delete')
    const { id } = await ctx.params

    const result = await productionOrderService.delete(id)
    return ok(result)
  } catch (error) {
    return handleRouteError(error, 'Erro ao excluir ordem de produção')
  }
}
