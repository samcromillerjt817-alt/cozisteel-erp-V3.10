import { NextRequest } from 'next/server'
import { requireAuth, ok, handleRouteError } from '@/lib/api-utils'
import { searchService } from '@/app/services/search.service'

export type { GlobalSearchResult } from '@/app/services/search.service'

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth()
    const q = new URL(req.url).searchParams.get('q') || ''
    const results = await searchService.search(user, q)
    return ok(results)
  } catch (error) {
    return handleRouteError(error, 'Erro ao buscar')
  }
}
