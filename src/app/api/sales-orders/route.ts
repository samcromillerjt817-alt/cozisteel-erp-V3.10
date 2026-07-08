import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireModulePermission, unauthorized, forbidden, ok, badRequest, parsePagination } from '@/lib/api-utils'

export async function GET(req: NextRequest) {
  try {
    await requireAuth()
    const { searchParams } = new URL(req.url)
    const { page, limit } = parsePagination(searchParams)
    const status = searchParams.get('status') || ''
    const search = searchParams.get('search') || ''

    const where: Record<string, unknown> = {}
    if (status) where.status = status
    if (search) {
      where.OR = [
        { number: { contains: search } },
        { clientName: { contains: search } },
      ]
    }

    const [data, total] = await Promise.all([
      db.salesOrder.findMany({
        where,
        include: {
          items: true,
          quote: { select: { id: true, number: true } },
          client: { select: { id: true, corporateName: true } },
          user: { select: { id: true, name: true } },
          productionOrders: { select: { id: true, number: true, status: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.salesOrder.count({ where }),
    ])

    return ok({ data, total, page, limit, totalPages: Math.ceil(total / limit) })
  } catch (error) {
    if (error instanceof Error && error.name === 'UnauthorizedError') return unauthorized()
    console.error('GET /api/sales-orders error:', error)
    return badRequest('Erro ao buscar pedidos de venda')
  }
}
