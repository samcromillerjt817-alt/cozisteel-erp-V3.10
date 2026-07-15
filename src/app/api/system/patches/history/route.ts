import { requireAuth, ok, handleRouteError } from '@/lib/api-utils'
import { systemService } from '@/app/services/system.service'

/**
 * GET /api/system/patches/history
 * Histórico de atualizações aplicadas (via terminal ou upload), com a versão atual.
 */
export async function GET() {
  try {
    await requireAuth()
    const result = await systemService.getPatchHistory()
    return ok(result)
  } catch (error) {
    return handleRouteError(error, 'Erro ao buscar histórico de atualizações')
  }
}
