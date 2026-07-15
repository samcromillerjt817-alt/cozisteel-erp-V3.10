import { NextRequest } from 'next/server'
import { requireAuth, requireModulePermission, ok, handleRouteError } from '@/lib/api-utils'
import { validateDto, updatePurchaseOrderSchema } from '@/app/dto'
import { purchaseOrderService } from '@/app/services/purchase-order.service'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: RouteContext) {
  try {
    await requireAuth()
    const { id } = await ctx.params

    const purchaseOrder = await purchaseOrderService.getById(id)
    return ok(purchaseOrder)
  } catch (error) {
    return handleRouteError(error, 'Erro ao buscar pedido de compra')
  }
}

/** Only draft purchase orders can be edited — items/prices come from the requisition's winning quotes and are not editable here. */
export async function PUT(req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requireModulePermission('compras', 'update')
    const { id } = await ctx.params
    const body = await req.json()
    const data = validateDto(updatePurchaseOrderSchema, body)

    const updated = await purchaseOrderService.update(id, data, user.id)
    return ok(updated)
  } catch (error) {
    return handleRouteError(error, 'Erro ao atualizar pedido de compra')
  }
}

export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requireModulePermission('compras', 'delete')
    const { id } = await ctx.params

    const result = await purchaseOrderService.delete(id, user.id)
    return ok(result)
  } catch (error) {
    return handleRouteError(error, 'Erro ao excluir pedido de compra')
  }
}
