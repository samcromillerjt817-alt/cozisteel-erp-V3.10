import { NextRequest } from 'next/server'
import { requireModulePermission, ok, handleRouteError } from '@/lib/api-utils'
import { validateDto, reverseStockMovementSchema } from '@/app/dto'
import { purchaseOrderService } from '@/app/services/purchase-order.service'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * ADR-023 (Decisão #1, Estorno) — primeiro caso concreto: reverter um recebimento de compra
 * específico. Gated por `estoque:update`, mesma permissão de quem já ajusta saldo em
 * `/api/stock/adjust` — estorno altera saldo tanto quanto um ajuste, mesma sensibilidade.
 */
export async function POST(req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requireModulePermission('estoque', 'update')
    const { id } = await ctx.params
    const body = await req.json()
    const { reason } = validateDto(reverseStockMovementSchema, body)

    const updated = await purchaseOrderService.reverseReceipt(id, reason, user.id)
    return ok(updated)
  } catch (error) {
    return handleRouteError(error, 'Erro ao estornar recebimento')
  }
}
