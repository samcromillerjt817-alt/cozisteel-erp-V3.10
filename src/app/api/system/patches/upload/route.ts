import { NextRequest } from 'next/server'
import { requireRole, ok, badRequest, handleRouteError } from '@/lib/api-utils'
import { patchService } from '@/app/services/patch.service'

/**
 * POST /api/system/patches/upload — multipart/form-data com campo "file" (.zip)
 * Responde imediatamente com o status "queued" — a aplicação do patch roda em segundo plano.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireRole('admin')

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return badRequest('Nenhum arquivo enviado (campo "file")')

    const result = await patchService.validateAndQueueUpload(file, user.id)
    return ok(result)
  } catch (error) {
    return handleRouteError(error, 'Erro ao enviar patch')
  }
}
