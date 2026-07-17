import { requireModulePermission, ok, handleRouteError } from '@/lib/api-utils'
import { systemService } from '@/app/services/system.service'

/** GET /api/system/patches/logs — lista os logs de execução do apply-patch.sh (ADR-021). */
export async function GET() {
  try {
    await requireModulePermission('sistema', 'read')
    return ok(await systemService.listPatchLogs())
  } catch (error) {
    return handleRouteError(error, 'Erro ao listar logs de atualização')
  }
}
