import { NextRequest } from 'next/server'
import { requireAuth, requireModulePermission, ok, created, handleRouteError, parsePagination } from '@/lib/api-utils'
import { validateDto, createMaterialSchema } from '@/app/dto'
import { materialService } from '@/app/services/material.service'

export async function GET(req: NextRequest) {
  try {
    await requireAuth()
    const { searchParams } = new URL(req.url)
    const { page, limit } = parsePagination(searchParams)

    const result = await materialService.list({
      search: searchParams.get('search') || '',
      active: searchParams.get('active'),
      categoryId: searchParams.get('categoryId') || '',
      lowStock: searchParams.get('lowStock') === 'true',
      paginate: searchParams.get('page') !== null,
      page,
      limit,
    })

    return ok(result)
  } catch (error) {
    return handleRouteError(error, 'Erro ao buscar materiais')
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireModulePermission('materiais', 'create')
    const body = await req.json()
    const data = validateDto(createMaterialSchema, body)

    const material = await materialService.create(data, user.id)
    return created(material)
  } catch (error) {
    return handleRouteError(error, 'Erro ao criar material')
  }
}
