import { NextRequest } from 'next/server'
import { requireModulePermission, ok, handleRouteError } from '@/lib/api-utils'
import { batchTraceabilityService } from '@/app/services/batch-traceability.service'

type RouteContext = { params: Promise<{ id: string }> }

/** GET /api/batches/material/[id]/forward — rastreabilidade forward de um lote de matéria-prima:
 * todos os lotes de produto que o consumiram, em qualquer profundidade (ADR-022, Fase UX-3, achado
 * #06). `batchTraceabilityService.traceForward()` existia desde o ADR-013 (Fase 10) sem rota. */
export async function GET(_req: NextRequest, ctx: RouteContext) {
  try {
    await requireModulePermission('estoque', 'read')
    const { id } = await ctx.params
    return ok(await batchTraceabilityService.traceForward(id))
  } catch (error) {
    return handleRouteError(error, 'Erro ao rastrear lote')
  }
}
