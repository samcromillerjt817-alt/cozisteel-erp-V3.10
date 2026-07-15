import { NextRequest } from 'next/server'
import { requireModulePermission, ok, handleRouteError } from '@/lib/api-utils'
import { validateDto, produceProductionOrderSchema } from '@/app/dto'
import { productionOrderService } from '@/app/services/production-order.service'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * POST /api/production-orders/[id]/produce
 *
 * Registra produção — total ou parcial — contra uma Ordem de Produção, com suporte a múltiplas
 * chamadas (cada uma com a quantidade daquela rodada). Único ponto de entrada de produção desde a
 * Fase 9 (ADR-011): consome material proporcionalmente, libera reserva proporcionalmente, dá
 * entrada proporcional do produto acabado — a OP só vira "completed" quando a soma das rodadas
 * atinge a quantidade total.
 */
export async function POST(req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requireModulePermission('producao', 'update')
    const { id } = await ctx.params
    const body = await req.json()
    const data = validateDto(produceProductionOrderSchema, body)

    const updated = await productionOrderService.produce(id, data.quantity, user.id, {
      clientRequestId: data.clientRequestId,
    })
    return ok(updated)
  } catch (error) {
    return handleRouteError(error, 'Erro ao registrar produção')
  }
}
