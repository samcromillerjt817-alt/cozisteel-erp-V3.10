import { NextRequest } from 'next/server'
import { requireAuth, requireModulePermission, ok, created, handleRouteError, parsePagination } from '@/lib/api-utils'
import { productionOrderService } from '@/app/services/production-order.service'

export async function GET(req: NextRequest) {
  try {
    await requireAuth()
    const { searchParams } = new URL(req.url)
    const { page, limit } = parsePagination(searchParams)
    const status = searchParams.get('status') || ''
    const search = searchParams.get('search') || ''

    const result = await productionOrderService.list({ status, search, page, limit })
    return ok(result)
  } catch (error) {
    return handleRouteError(error, 'Erro ao buscar ordens de produção')
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireModulePermission('producao', 'create')
    const body = await req.json()

    const order = await productionOrderService.create(body, user.id)
    return created(order)
  } catch (error) {
    return handleRouteError(error, 'Erro ao criar ordem de produção')
  }
}
