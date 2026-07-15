import { NextRequest } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/api-utils'
import { storageService } from '@/app/services/storage.service'

type RouteContext = { params: Promise<{ path: string[] }> }

/**
 * GET /api/uploads/products/<productId>/<filename>
 * Serve arquivos gravados em STORAGE_PATH. Não usamos /public para isso porque
 * o processo de build/deploy apaga e recria .next/standalone/public a cada
 * atualização — arquivos enviados pelo usuário ficariam perdidos.
 *
 * Correção de segurança (Fase 1, ADR-001 log 2026-07-09): antes não exigia autenticação nenhuma,
 * servindo qualquer arquivo do storage publicamente. Agora exige login (mesmo padrão de toda leitura
 * autenticada do sistema).
 */
export async function GET(_req: NextRequest, ctx: RouteContext) {
  try {
    await requireAuth()
    const { path: segments } = await ctx.params
    const { buffer, contentType } = await storageService.resolveFile(segments)

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'UnauthorizedError') return unauthorized()
    return new Response('Not found', { status: 404 })
  }
}
