import { NextRequest } from 'next/server'
import { storageService } from '@/app/services/storage.service'
import { productRepository } from '@/app/repositories/product.repository'

type RouteContext = { params: Promise<{ path: string[] }> }

/**
 * GET /api/public/uploads/products/<productId>/<filename> — irmã pública de `/api/uploads/[...path]`
 * (ADR-026, Fase 2). A rota autenticada exige login pra QUALQUER arquivo; esta serve só imagens de
 * produto cujo Product esteja com `showInCatalog=true` (checagem antes de ler o arquivo, mesmo
 * sabendo o path exato — path por si só nunca é suficiente pra servir aqui). Only `products/...` é
 * aceito; qualquer outro prefixo (orçamentos, clientes, etc.) é recusado, mesmo que o arquivo exista.
 */
export async function GET(_req: NextRequest, ctx: RouteContext) {
  try {
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
  } catch {
    return new Response('Not found', { status: 404 })
  }
}
