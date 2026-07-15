import { NextRequest } from 'next/server'
import { requireAuth, ok, handleRouteError, parsePagination } from '@/lib/api-utils'
import { salesOrderService } from '@/app/services/sales-order.service'

export async function GET(req: NextRequest) {
  try {
    await requireAuth()
    const { searchParams } = new URL(req.url)
    const { page, limit } = parsePagination(searchParams)
    const status = searchParams.get('status') || ''
    const search = searchParams.get('search') || ''

    const result = await salesOrderService.list({ status, search, page, limit })
    return ok(result)
  } catch (error) {
    return handleRouteError(error, 'Erro ao buscar pedidos de venda')
  }
}
