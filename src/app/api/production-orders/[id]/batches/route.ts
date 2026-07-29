import { NextRequest } from 'next/server'
import { requireModulePermission, ok, handleRouteError } from '@/lib/api-utils'
import { productionOrderService } from '@/app/services/production-order.service'

type RouteContext = { params: Promise<{ id: string }> }

/** GET /api/production-orders/[id]/batches — lotes produzidos por rodada (ADR-023, Decisão #1) —
 * existiam desde o ADR-013, nunca listados pela UI. */
export async function GET(_req: NextRequest, ctx: RouteContext) {
  try {
    await requireModulePermission('producao', 'read')
    const { id } = await ctx.params
    return ok(await productionOrderService.listProductBatches(id))
  } catch (error) {
    return handleRouteError(error, 'Erro ao buscar lotes produzidos')
  }
}
