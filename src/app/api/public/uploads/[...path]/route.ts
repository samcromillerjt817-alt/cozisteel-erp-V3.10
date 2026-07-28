import { NextRequest } from 'next/server'
import { storageService } from '@/app/services/storage.service'
import { productRepository } from '@/app/repositories/product.repository'
import { rateLimit } from '@/lib/rate-limit'
import { TooManyRequestsException } from '@/app/exceptions'

type RouteContext = { params: Promise<{ path: string[] }> }

/**
 * GET /api/public/uploads/products/<productId>/<filename> — irmã pública de `/api/uploads/[...path]`
 * (ADR-026, Fase 2). A rota autenticada exige login pra QUALQUER arquivo; esta serve só imagens de
 * produto cujo Product esteja com `showInCatalog=true` (checagem antes de ler o arquivo, mesmo
 * sabendo o path exato — path por si só nunca é suficiente pra servir aqui). Only `products/...` é
 * aceito; qualquer outro prefixo (orçamentos, clientes, etc.) é recusado, mesmo que o arquivo exista.
 * Limite de taxa mais generoso que as demais rotas públicas (ADR-026, Fase 5) — uma única ficha de
 * produto já carrega várias imagens de uma vez.
 */
export async function GET(req: NextRequest, ctx: RouteContext) {
  try {
    await rateLimit(req, { keyPrefix: 'public-catalog-images', points: 120, durationSeconds: 60 })

    const { path: segments } = await ctx.params
    if (segments[0] !== 'products' || !segments[1]) {
      return new Response('Not found', { status: 404 })
    }

    const productId = segments[1]
    const visible = await productRepository.isPubliclyVisible(productId)
    if (!visible) return new Response('Not found', { status: 404 })

    const { buffer, contentType } = await storageService.resolveFile(segments)
    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  } catch (error) {
    if (error instanceof TooManyRequestsException) return new Response(error.message, { status: 429 })
    return new Response('Not found', { status: 404 })
  }
}
