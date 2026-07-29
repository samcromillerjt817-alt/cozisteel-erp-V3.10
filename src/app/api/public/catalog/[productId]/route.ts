import { NextRequest } from 'next/server'
import { ok, handleRouteError } from '@/lib/api-utils'
import { catalogPublicService } from '@/app/services/catalog-public.service'
import { rateLimit } from '@/lib/rate-limit'

type RouteContext = { params: Promise<{ productId: string }> }

/** Rota pública (sem autenticação) — ADR-026, Fase 2. Ficha de produto do catálogo. */
export async function GET(req: NextRequest, ctx: RouteContext) {
  try {
    await rateLimit(req, { keyPrefix: 'public-catalog-browse', points: 60, durationSeconds: 60 })
    const { productId } = await ctx.params
    const product = await catalogPublicService.getProductDetail(productId)
    return ok(product)
  } catch (error) {
    return handleRouteError(error, 'Erro ao buscar produto')
  }
}
