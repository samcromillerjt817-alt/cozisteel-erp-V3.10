import { NextRequest } from 'next/server'
import { ok, handleRouteError } from '@/lib/api-utils'
import { catalogPublicService } from '@/app/services/catalog-public.service'
import { rateLimit } from '@/lib/rate-limit'

/** Rota pública (sem autenticação) — ADR-026, Fase 2. Só categorias com ao menos 1 produto visível. */
export async function GET(req: NextRequest) {
  try {
    await rateLimit(req, { keyPrefix: 'public-catalog-browse', points: 60, durationSeconds: 60 })
    const categories = await catalogPublicService.listCategories()
    return ok({ data: categories })
  } catch (error) {
    return handleRouteError(error, 'Erro ao buscar categorias')
  }
}
