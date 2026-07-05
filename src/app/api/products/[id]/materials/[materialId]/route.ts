import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, unauthorized, ok, badRequest, notFound } from '@/lib/api-utils'
import { auditService } from '@/app/services/audit.service'

type RouteContext = { params: Promise<{ id: string; materialId: string }> }

export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requireAuth()
    const { id: productId, materialId } = await ctx.params

    const link = await db.productMaterial.findUnique({
      where: { productId_materialId: { productId, materialId } },
      include: { material: true, product: true },
    })
    if (!link) return notFound('Vínculo não encontrado')

    await db.productMaterial.delete({
      where: { productId_materialId: { productId, materialId } },
    })

    await auditService.log({
      userId: user.id,
      action: 'DELETE',
      module: 'produtos',
      entityId: productId,
      entityName: link.product.name,
      details: `Matéria-prima "${link.material.name}" desvinculada do produto`,
    })

    return ok({ success: true })
  } catch (error) {
    if (error instanceof Error && error.name === 'UnauthorizedError') return unauthorized()
    console.error('DELETE /api/products/[id]/materials/[materialId] error:', error)
    return badRequest('Erro ao remover vínculo')
  }
}
