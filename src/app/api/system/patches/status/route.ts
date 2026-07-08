import { requireRole, unauthorized, forbidden, ok } from '@/lib/api-utils'
import { getStorageDir } from '@/lib/storage'
import path from 'path'
import fs from 'fs/promises'

/**
 * GET /api/system/patches/status
 * Lê o arquivo de status escrito progressivamente pelo scripts/apply-patch.sh,
 * para a tela poder mostrar o andamento (backup, extraindo, buildando, etc.).
 */
export async function GET() {
  try {
    await requireRole('admin')
    const statusFile = path.join(getStorageDir(), 'patches', 'status.json')
    try {
      const raw = await fs.readFile(statusFile, 'utf8')
      return ok(JSON.parse(raw))
    } catch {
      return ok({ state: 'idle', message: 'Nenhuma atualização em andamento' })
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'UnauthorizedError') return unauthorized()
    if (error instanceof Error && error.name === 'ForbiddenError') return forbidden(error.message)
    return ok({ state: 'idle', message: 'Nenhuma atualização em andamento' })
  }
}
