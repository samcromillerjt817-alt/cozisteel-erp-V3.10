import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireModulePermission, unauthorized, forbidden, ok, badRequest, notFound } from '@/lib/api-utils'
import { getStorageDir } from '@/lib/storage'
import { auditService } from '@/app/services/audit.service'
import fs from 'fs/promises'
import path from 'path'

type RouteContext = { params: Promise<{ id: string; imageId: string }> }

export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requireModulePermission('produtos', 'update')
    const { id: productId, imageId } = await ctx.params

    const image = await db.productImage.findUnique({ where: { id: imageId } })
    if (!image || image.productId !== productId) return notFound('Imagem não encontrada')

    await db.productImage.delete({ where: { id: imageId } })

    try {
      await fs.unlink(path.join(getStorageDir(), image.url))
    } catch {
      // arquivo já pode ter sido removido manualmente — não impede a exclusão do registro
    }

    // Se a imagem removida era a principal, promove a próxima (se houver) automaticamente
    if (image.isPrimary) {
      const next = await db.productImage.findFirst({ where: { productId }, orderBy: { order: 'asc' } })
      if (next) await db.productImage.update({ where: { id: next.id }, data: { isPrimary: true } })
    }

    await auditService.log({
      userId: user.id,
      action: 'DELETE',
      module: 'produtos',
      entityId: productId,
      entityName: productId,
      details: `Imagem removida do produto`,
    })

    return ok({ success: true })
  } catch (error) {
    if (error instanceof Error && error.name === 'UnauthorizedError') return unauthorized()
    if (error instanceof Error && error.name === 'ForbiddenError') return forbidden(error.message)
    console.error('DELETE /api/products/[id]/images/[imageId] error:', error)
    return badRequest('Erro ao remover imagem')
  }
}

/** PATCH { isPrimary: true } — define esta imagem como a foto principal do produto. */
export async function PATCH(req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requireModulePermission('produtos', 'update')
    const { id: productId, imageId } = await ctx.params
    const body = await req.json()

    const image = await db.productImage.findUnique({ where: { id: imageId } })
    if (!image || image.productId !== productId) return notFound('Imagem não encontrada')

    if (body.isPrimary) {
      await db.productImage.updateMany({ where: { productId }, data: { isPrimary: false } })
      await db.productImage.update({ where: { id: imageId }, data: { isPrimary: true } })
    }

    return ok({ success: true })
  } catch (error) {
    if (error instanceof Error && error.name === 'UnauthorizedError') return unauthorized()
    if (error instanceof Error && error.name === 'ForbiddenError') return forbidden(error.message)
    console.error('PATCH /api/products/[id]/images/[imageId] error:', error)
    return badRequest('Erro ao atualizar imagem')
  }
}
