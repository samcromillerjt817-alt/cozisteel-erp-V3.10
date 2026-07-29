import { requireAuth, ok, handleRouteError } from '@/lib/api-utils'
import { mrpSuggestionService } from '@/app/services/mrp-suggestion.service'

/** ADR-023 (item 3) — lista as sugestões pendentes de TODAS as execuções do MRP já rodadas, não só
 * a última (mesmo critério já usado pelo widget `producao.sugestoes-mrp-por-status` no Dashboard). */
export async function GET() {
  try {
    await requireAuth()
    const suggestions = await mrpSuggestionService.listPending()
    return ok(suggestions)
  } catch (error) {
    return handleRouteError(error, 'Erro ao buscar sugestões do MRP')
  }
}
