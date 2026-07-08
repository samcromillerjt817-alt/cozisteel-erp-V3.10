import { NextRequest } from 'next/server'
import { getStorageDir } from '@/lib/storage'
import fs from 'fs/promises'
import path from 'path'

type RouteContext = { params: Promise<{ path: string[] }> }

const MIME_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.webp': 'image/webp', '.gif': 'image/gif',
}

/**
 * GET /api/uploads/products/<productId>/<filename>
 * Serve arquivos gravados em STORAGE_PATH. Não usamos /public para isso porque
 * o processo de build/deploy apaga e recria .next/standalone/public a cada
 * atualização — arquivos enviados pelo usuário ficariam perdidos.
 */
export async function GET(_req: NextRequest, ctx: RouteContext) {
  try {
    const { path: segments } = await ctx.params
    const storageDir = getStorageDir()
    const filePath = path.join(storageDir, ...segments)

    // Proteção básica contra path traversal (../)
    if (!filePath.startsWith(storageDir)) {
      return new Response('Not found', { status: 404 })
    }

    const buffer = await fs.readFile(filePath)
    const ext = path.extname(filePath).toLowerCase()
    const contentType = MIME_TYPES[ext] || 'application/octet-stream'

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
