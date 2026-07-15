import { NextRequest } from 'next/server'
import { requireAuth, ok, handleRouteError } from '@/lib/api-utils'
import { systemService } from '@/app/services/system.service'

export async function GET(_req: NextRequest) {
  try {
    await requireAuth()
    const info = await systemService.getInfo()
    return ok(info)
  } catch (error) {
    return handleRouteError(error, 'Erro ao buscar informações do sistema')
  }
}
