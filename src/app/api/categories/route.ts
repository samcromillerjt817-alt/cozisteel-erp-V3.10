import { NextRequest } from 'next/server'
import { requireAuth, ok, created, handleRouteError } from '@/lib/api-utils'
import { categoryService } from '@/app/services/category.service'

export async function GET(_req: NextRequest) {
  try {
    await requireAuth()
    const categories = await categoryService.list()
    return ok(categories)
  } catch (error) {
    return handleRouteError(error, 'Erro ao buscar categorias')
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAuth()
    const body = await req.json()
    const category = await categoryService.create(body)
    return created(category)
  } catch (error) {
    return handleRouteError(error, 'Erro ao criar categoria')
  }
}
