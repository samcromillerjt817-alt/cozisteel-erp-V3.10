import { requireModulePermission, ok, handleRouteError } from '@/lib/api-utils'
import { systemService } from '@/app/services/system.service'

type RouteContext = { params: Promise<{ filename: string }> }

/** GET /api/system/patches/logs/[filename] — conteúdo de um log específico (ADR-021). */
export async function GET(_req: Request, ctx: RouteContext) {
  try {
    await requireModulePermission('sistema', 'read')
    const { filename } = await ctx.params
    return ok(await systemService.readPatchLog(filename))
  } catch (error) {
    return handleRouteError(error, 'Erro ao ler log de atualização')
  }
}
