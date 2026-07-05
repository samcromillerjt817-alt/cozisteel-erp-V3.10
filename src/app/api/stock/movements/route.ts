import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, unauthorized, ok, badRequest, parsePagination } from '@/lib/api-utils'

/**
 * GET /api/stock/movements?itemType=&materialId=&productId=&limit=&page=
 * Histórico oficial de movimentações de estoque (entradas, saídas, ajustes).
 */
export async function GET(req: NextRequest) {
  try {
    await requireAuth()
    const { searchParams } = new URL(req.url)
    const { page, limit } = parsePagination(searchParams)
    const itemType = searchParams.get('itemType') || ''
    const materialId = searchParams.get('materialId') || ''
    const productId = searchParams.get('productId') || ''

    const where: Record<string, unknown> = {}
    if (itemType) where.itemType = itemType
    if (materialId) where.materialId = materialId
    if (productId) where.productId = productId

    const [data, total] = await Promise.all([
      db.stockMovement.findMany({
        where,
        include: {
          material: { select: { id: true, name: true, unit: true } },
          product: { select: { id: true, name: true, unit: true } },
          user: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.stockMovement.count({ where }),
    ])

    return ok({ data, total, page, limit, totalPages: Math.ceil(total / limit) })
  } catch (error) {
    if (error instanceof Error && error.name === 'UnauthorizedError') return unauthorized()
    console.error('GET /api/stock/movements error:', error)
    return badRequest('Erro ao buscar histórico de movimentações')
  }
}
