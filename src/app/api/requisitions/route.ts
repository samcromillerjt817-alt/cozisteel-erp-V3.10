import { NextRequest } from 'next/server'
import { requireAuth, requireModulePermission, ok, created, handleRouteError, parsePagination } from '@/lib/api-utils'
import { validateDto, createRequisitionSchema } from '@/app/dto'
import { requisitionService } from '@/app/services/requisition.service'

export async function GET(req: NextRequest) {
  try {
    await requireAuth()
    const { searchParams } = new URL(req.url)
    const { page, limit } = parsePagination(searchParams)
    const status = searchParams.get('status') || ''
    const search = searchParams.get('search') || ''
    const productionOrderId = searchParams.get('productionOrderId') || ''

    const result = await requisitionService.list({ status, search, productionOrderId, page, limit })
    return ok(result)
  } catch (error) {
    return handleRouteError(error, 'Erro ao buscar requisições')
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireModulePermission('requisicoes', 'create')
    const body = await req.json()
    const data = validateDto(createRequisitionSchema, body)

    const requisition = await requisitionService.create(data, user.id)
    return created(requisition)
  } catch (error) {
    return handleRouteError(error, 'Erro ao criar requisição')
  }
}
