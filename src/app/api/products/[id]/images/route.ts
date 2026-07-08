import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireModulePermission, unauthorized, forbidden, ok, created, badRequest, notFound } from '@/lib/api-utils'
import { ensureStorageSubdir, ALLOWED_IMAGE_EXTENSIONS, MAX_IMAGE_SIZE_BYTES } from '@/lib/storage'
import { auditService } from '@/app/services/audit.service'
import fs from 'fs/promises'
import path from 'path'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: RouteContext) {
  try {
    await requireModulePermission('produtos', 'read')
    const { id: productId } = await ctx.params
    const images = await db.productImage.findMany({ where: { productId }, orderBy: [{ isPrimary: 'desc' }, { order: 'asc' }] })
    return ok(images)
  } catch (error) {
    if (error instanceof Error && error.name === 'UnauthorizedError') return unauthorized()
    if (error instanceof Error && error.name === 'ForbiddenError') return forbidden(error.message)
    console.error('GET /api/products/[id]/images error:', error)
    return badRequest('Erro ao buscar imagens')
  }
}

/** POST multipart/form-data com campo "file" — envia uma nova foto para o produto. */
export async function POST(req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requireModulePermission('produtos', 'update')
    const { id: productId } = await ctx.params

    const product = await db.product.findUnique({ where: { id: productId } })
    if (!product) return notFound('Produto não encontrado')

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return badRequest('Nenhum arquivo enviado (campo "file")')

    const ext = path.extname(file.name || '').toLowerCase()
    if (!ALLOWED_IMAGE_EXTENSIONS.includes(ext)) {
      return badRequest(`Formato não suportado. Use: ${ALLOWED_IMAGE_EXTENSIONS.join(', ')}`)
    }
    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      return badRequest(`Arquivo muito grande (máx. ${MAX_IMAGE_SIZE_BYTES / 1024 / 1024}MB)`)
    }

    const dir = ensureStorageSubdir('products', productId)
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`
    const buffer = Buffer.from(await file.arrayBuffer())
    await fs.writeFile(path.join(dir, filename), buffer)

    const existingCount = await db.productImage.count({ where: { productId } })
    const image = await db.productImage.create({
      data: {
        productId,
        url: `products/${productId}/${filename}`,
        isPrimary: existingCount === 0, // primeira imagem enviada vira a principal automaticamente
        order: existingCount,
      },
    })

    await auditService.log({
      userId: user.id,
      action: 'CREATE',
      module: 'produtos',
      entityId: productId,
      entityName: product.name,
      details: `Imagem adicionada ao produto "${product.name}"`,
    })

    return created(image)
  } catch (error) {
    if (error instanceof Error && error.name === 'UnauthorizedError') return unauthorized()
    if (error instanceof Error && error.name === 'ForbiddenError') return forbidden(error.message)
    console.error('POST /api/products/[id]/images error:', error)
    return badRequest('Erro ao enviar imagem')
  }
}
