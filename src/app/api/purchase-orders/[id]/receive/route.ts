import { NextRequest } from 'next/server'
import { requireModulePermission, ok, handleRouteError } from '@/lib/api-utils'
import { validateDto, receivePurchaseOrderSchema } from '@/app/dto'
import { purchaseOrderService } from '@/app/services/purchase-order.service'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * POST /api/purchase-orders/[id]/receive
 *
 * Registra o recebimento físico de mercadoria contra um Pedido de Compra,
 * por item e com suporte a recebimento parcial (múltiplas chamadas). Dá
 * entrada no estoque de matéria-prima e recalcula o status do pedido a
 * partir da soma das quantidades recebidas por item.
 */
export async function POST(req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requireModulePermission('compras', 'update')
    const { id } = await ctx.params
    const body = await req.json()
    const data = validateDto(receivePurchaseOrderSchema, body)

    const updated = await purchaseOrderService.receive(id, data, user.id)
    return ok(updated)
  } catch (error) {
    return handleRouteError(error, 'Erro ao registrar recebimento')
  }
}
