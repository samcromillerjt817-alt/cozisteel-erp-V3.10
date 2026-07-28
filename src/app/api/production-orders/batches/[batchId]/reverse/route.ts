import { NextRequest } from 'next/server'
import { requireModulePermission, ok, handleRouteError } from '@/lib/api-utils'
import { validateDto, reverseStockMovementSchema } from '@/app/dto'
import { productionOrderService } from '@/app/services/production-order.service'

type RouteContext = { params: Promise<{ batchId: string }> }

/**
 * ADR-023 (Decisão #1, Estorno) — reverte uma rodada de produção inteira (`ProductBatch`). Gated por
 * `producao:update` — mesma permissão de quem já muda status da OP, já que reverter uma rodada é tão
 * sensível quanto qualquer outra transição de produção.
 */
export async function POST(req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requireModulePermission('producao', 'update')
    const { batchId } = await ctx.params
    const body = await req.json()
    const { reason } = validateDto(reverseStockMovementSchema, body)

    const updated = await productionOrderService.reverseProduction(batchId, reason, user.id)
    return ok(updated)
  } catch (error) {
    return handleRouteError(error, 'Erro ao estornar rodada de produção')
  }
}
