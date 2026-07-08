import { db } from '@/lib/db'
import { requireAuth, unauthorized, ok, badRequest } from '@/lib/api-utils'

/**
 * GET /api/system/patches/history
 * Histórico de atualizações aplicadas (via terminal ou upload), com a versão atual.
 */
export async function GET() {
  try {
    await requireAuth()

    const [systemInfo, history] = await Promise.all([
      db.systemInfo.findUnique({ where: { id: 'main' } }),
      db.patchLog.findMany({
        include: { user: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ])

    return ok({
      currentVersion: systemInfo?.version || '3.0.0',
      updatedAt: systemInfo?.updatedAt || null,
      history,
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'UnauthorizedError') return unauthorized()
    console.error('GET /api/system/patches/history error:', error)
    return badRequest('Erro ao buscar histórico de atualizações')
  }
}
