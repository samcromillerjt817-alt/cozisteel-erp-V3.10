import { db } from '@/lib/db'
import { requireAuth, unauthorized, ok, badRequest } from '@/lib/api-utils'
import { NextRequest } from 'next/server'

export async function GET(_req: NextRequest) {
  try {
    const user = await requireAuth()

    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const startOfWeek = new Date(now)
    startOfWeek.setDate(now.getDate() - now.getDay() + 1)
    startOfWeek.setHours(0, 0, 0, 0)

    const [
      totalQuotes,
      quotesByStatus,
      totalClients,
      totalProducts,
      quotesThisMonth,
      quotesThisWeek,
      revenueApproved,
      recentQuotes,
    ] = await Promise.all([
      db.quote.count(),
      db.quote.groupBy({ by: ['status'], _count: { status: true } }),
      db.client.count({ where: { active: true } }),
      db.product.count({ where: { active: true } }),
      db.quote.count({ where: { createdAt: { gte: startOfMonth } } }),
      db.quote.count({ where: { createdAt: { gte: startOfWeek } } }),
      db.quote.aggregate({
        where: { status: 'approved' },
        _sum: { total: true },
      }),
      db.quote.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: {
          client: { select: { id: true, corporateName: true, tradeName: true } },
          user: { select: { id: true, name: true } },
        },
      }),
    ])

    const statusCounts: Record<string, number> = {}
    for (const group of quotesByStatus) {
      statusCounts[group.status] = group._count.status
    }

    return ok({
      totalQuotes,
      quotesByStatus: statusCounts,
      totalClients,
      totalProducts,
      quotesThisMonth,
      quotesThisWeek,
      totalRevenue: revenueApproved._sum.total || 0,
      recentQuotes,
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'UnauthorizedError') return unauthorized()
    console.error('GET /api/dashboard/stats error:', error)
    return badRequest('Erro ao buscar estatísticas')
  }
}