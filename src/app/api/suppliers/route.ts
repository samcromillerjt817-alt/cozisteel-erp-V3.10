import { NextRequest } from 'next/server'
import { requireAuth, requireModulePermission, ok, created, handleRouteError, parsePagination } from '@/lib/api-utils'
import { validateDto, createSupplierSchema } from '@/app/dto'
import { supplierService } from '@/app/services/supplier.service'

export async function GET(req: NextRequest) {
  try {
    await requireAuth()
    const { searchParams } = new URL(req.url)
    const { page, limit } = parsePagination(searchParams)

    const result = await supplierService.list({
      search: searchParams.get('search') || '',
      active: searchParams.get('active'),
      page,
      limit,
    })

    return ok(result)
  } catch (error) {
    return handleRouteError(error, 'Erro ao buscar fornecedores')
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireModulePermission('fornecedores', 'create')
    const body = await req.json()
    const data = validateDto(createSupplierSchema, body)

    const supplier = await supplierService.create(data, user.id)
    return created(supplier)
  } catch (error) {
    return handleRouteError(error, 'Erro ao criar fornecedor')
  }
}
