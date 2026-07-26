import { requireModulePermission, ok, handleRouteError } from '@/lib/api-utils'
import { systemService } from '@/app/services/system.service'
import { patchService } from '@/app/services/patch.service'

/** GET /api/system/patches/backups — lista backups manuais sob demanda (ADR-021, Parte 8.5). */
export async function GET() {
  try {
    await requireModulePermission('sistema', 'read')
    return ok(await systemService.listManualBackups())
  } catch (error) {
    return handleRouteError(error, 'Erro ao listar backups manuais')
  }
}

/** POST /api/system/patches/backups — cria um backup manual (código + banco) sob demanda, sem
 * aplicar nenhum patch (ADR-021, Parte 8.5). */
export async function POST() {
  try {
    const user = await requireModulePermission('sistema', 'manage')
    return ok(await patchService.createManualBackup(user.id))
  } catch (error) {
    return handleRouteError(error, 'Erro ao criar backup manual')
  }
}
