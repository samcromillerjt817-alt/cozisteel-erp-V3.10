import { NextRequest } from 'next/server'
import { requireAuth, ok, handleRouteError, parsePagination } from '@/lib/api-utils'
import { purchaseOrderService } from '@/app/services/purchase-order.service'

export async function GET(req: NextRequest) {
  try {
    await requireAuth()
    const { searchParams } = new URL(req.url)
    const { page, limit } = parsePagination(searchParams)
    const status = searchParams.get('status') || ''
    const supplierId = searchParams.get('supplierId') || ''
    const requisitionId = searchParams.get('requisitionId') || ''
    const search = searchParams.get('search') || ''

    const result = await purchaseOrderService.list({ status, supplierId, requisitionId, search, page, limit })
    return ok(result)
  } catch (error) {
    return handleRouteError(error, 'Erro ao buscar pedidos de compra')
  }
}
