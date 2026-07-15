import { requireRole, unauthorized, forbidden, ok } from '@/lib/api-utils'
import { systemService } from '@/app/services/system.service'

/**
 * GET /api/system/patches/status
 * Andamento do patch em aplicação (backup, extraindo, buildando, etc.), lido de um arquivo escrito
 * progressivamente por scripts/apply-patch.sh.
 */
export async function GET() {
  try {
    await requireRole('admin')
    const status = await systemService.getPatchStatus()
    return ok(status)
  } catch (error) {
    if (error instanceof Error && error.name === 'UnauthorizedError') return unauthorized()
    if (error instanceof Error && error.name === 'ForbiddenError') return forbidden(error.message)
    return ok({ state: 'idle', message: 'Nenhuma atualização em andamento' })
  }
}
