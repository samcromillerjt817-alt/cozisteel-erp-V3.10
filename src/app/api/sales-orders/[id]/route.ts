import { NextRequest } from 'next/server'
import { requireAuth, requireModulePermission, ok, handleRouteError } from '@/lib/api-utils'
import { salesOrderService } from '@/app/services/sales-order.service'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: RouteContext) {
  try {
    await requireAuth()
    const { id } = await ctx.params

    const salesOrder = await salesOrderService.getById(id)
    return ok(salesOrder)
  } catch (error) {
    return handleRouteError(error, 'Erro ao buscar pedido de venda')
  }
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requireModulePermission('orcamentos', 'update')
    const { id } = await ctx.params
    const { status } = await req.json()

    const updated = await salesOrderService.changeStatus(id, status, user.id)
    return ok(updated)
  } catch (error) {
    return handleRouteError(error, 'Erro ao atualizar status do pedido de venda')
  }
}
