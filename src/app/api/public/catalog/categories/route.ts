import { ok, handleRouteError } from '@/lib/api-utils'
import { catalogPublicService } from '@/app/services/catalog-public.service'

/** Rota pública (sem autenticação) — ADR-026, Fase 2. Só categorias com ao menos 1 produto visível. */
export async function GET() {
  try {
    const categories = await catalogPublicService.listCategories()
    return ok({ data: categories })
  } catch (error) {
    return handleRouteError(error, 'Erro ao buscar categorias')
  }
}
