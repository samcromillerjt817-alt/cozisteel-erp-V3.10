import { db } from '@/lib/db'
import { requireAuth, unauthorized, ok, badRequest } from '@/lib/api-utils'
import { NextRequest } from 'next/server'

export async function GET(_req: NextRequest) {
  try {
    await requireAuth()

    let info = await db.systemInfo.findUnique({ where: { id: 'main' } })
    if (!info) {
      info = await db.systemInfo.create({ data: { id: 'main' } })
    }

    return ok({
      version: info.version,
      installedAt: info.installedAt,
      updatedAt: info.updatedAt,
      maintenanceMode: info.maintenanceMode,
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'UnauthorizedError') return unauthorized()
    console.error('GET /api/system/info error:', error)
    return badRequest('Erro ao buscar informações do sistema')
  }
}