import { NextRequest } from 'next/server'
import { requireModulePermission, ok, handleRouteError } from '@/lib/api-utils'
import { purchaseOrderService } from '@/app/services/purchase-order.service'

type RouteContext = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requireModulePermission('compras', 'update')
    const { id } = await ctx.params
    const { status } = await req.json()

    const updated = await purchaseOrderService.changeStatus(id, status, user.id)
    return ok(updated)
  } catch (error) {
    return handleRouteError(error, 'Erro ao alterar status')
  }
}
