import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, unauthorized, ok, badRequest, parsePagination } from '@/lib/api-utils'

export async function GET(req: NextRequest) {
  try {
    await requireAuth()
    const { searchParams } = new URL(req.url)
    const { page, limit } = parsePagination(searchParams)
    const status = searchParams.get('status') || ''
    const supplierId = searchParams.get('supplierId') || ''
    const requisitionId = searchParams.get('requisitionId') || ''
    const search = searchParams.get('search') || ''

    const where: Record<string, unknown> = {}
    if (status) where.status = status
    if (supplierId) where.supplierId = supplierId
    if (requisitionId) where.requisitionId = requisitionId
    if (search) where.number = { contains: search }

    const [data, total] = await Promise.all([
      db.purchaseOrder.findMany({
        where,
        include: {
          supplier: { select: { id: true, corporateName: true, tradeName: true } },
          requisition: { select: { id: true, number: true } },
          items: { include: { material: { select: { id: true, name: true, unit: true } } } },
          user: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.purchaseOrder.count({ where }),
    ])

    return ok({ data, total, page, limit, totalPages: Math.ceil(total / limit) })
  } catch (error) {
    if (error instanceof Error && error.name === 'UnauthorizedError') return unauthorized()
    console.error('GET /api/purchase-orders error:', error)
    return badRequest('Erro ao buscar pedidos de compra')
  }
}
