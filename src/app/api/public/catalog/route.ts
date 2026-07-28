import { NextRequest } from 'next/server'
import { ok, parsePagination, handleRouteError } from '@/lib/api-utils'
import { catalogPublicService } from '@/app/services/catalog-public.service'

const VALID_SORTS = ['name_asc', 'name_desc', 'destaque'] as const

/**
 * Rota pública (sem autenticação) — ADR-026, Fase 2. Lista só produtos com `showInCatalog=true` e
 * `active=true`; serialização já sanitizada em `catalogPublicService.listProducts()`.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const { page, limit } = parsePagination(searchParams)
    const search = searchParams.get('search') || ''
    const categoryId = searchParams.get('categoryId') || ''
    const sortParam = searchParams.get('sort') || ''
    const sort = (VALID_SORTS as readonly string[]).includes(sortParam) ? (sortParam as (typeof VALID_SORTS)[number]) : undefined

    const result = await catalogPublicService.listProducts({ search, categoryId, sort, page, limit })
    return ok(result)
  } catch (error) {
    return handleRouteError(error, 'Erro ao buscar catálogo')
  }
}
