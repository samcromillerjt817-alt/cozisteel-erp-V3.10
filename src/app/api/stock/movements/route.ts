import { NextRequest } from 'next/server'
import { requireAuth, ok, handleRouteError, parsePagination } from '@/lib/api-utils'
import { stockService } from '@/app/services/stock.service'

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

    const result = await stockService.listMovements({ itemType, materialId, productId, page, limit })
    return ok(result)
  } catch (error) {
    return handleRouteError(error, 'Erro ao buscar histórico de movimentações')
  }
}
