import { NextRequest } from 'next/server'
import { requireModulePermission, ok, badRequest, handleRouteError } from '@/lib/api-utils'
import { batchTraceabilityService } from '@/app/services/batch-traceability.service'

/** GET /api/batches/search?q=XXX — busca lotes de matéria-prima e de produto por número (ADR-022,
 * Fase UX-3, achado #06). Primeiro passo da tela de rastreabilidade. */
export async function GET(req: NextRequest) {
  try {
    await requireModulePermission('estoque', 'read')
    const { searchParams } = new URL(req.url)
    const q = searchParams.get('q')
    if (!q) return badRequest('Informe q (número do lote)')

    return ok(await batchTraceabilityService.search(q))
  } catch (error) {
    return handleRouteError(error, 'Erro ao buscar lote')
  }
}
