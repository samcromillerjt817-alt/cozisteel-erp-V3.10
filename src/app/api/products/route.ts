import { NextRequest } from 'next/server'
import { requireAuth, requireModulePermission, ok, created, handleRouteError, parsePagination } from '@/lib/api-utils'
import { validateDto, createProductSchema } from '@/app/dto'
import { productService } from '@/app/services/product.service'

export async function GET(req: NextRequest) {
  try {
    await requireAuth()
    const { searchParams } = new URL(req.url)
    const { page, limit } = parsePagination(searchParams)

    const result = await productService.list({
      search: searchParams.get('search') || '',
      categoryId: searchParams.get('categoryId') || '',
      active: searchParams.get('active'),
      page,
      limit,
    })

    return ok(result)
  } catch (error) {
    return handleRouteError(error, 'Erro ao buscar produtos')
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireModulePermission('produtos', 'create')
    const body = await req.json()
    const data = validateDto(createProductSchema, body)

    const product = await productService.create(data)
    return created(product)
  } catch (error) {
    return handleRouteError(error, 'Erro ao criar produto')
  }
}
