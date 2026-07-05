import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, unauthorized, ok, badRequest, notFound } from '@/lib/api-utils'
import { auditService } from '@/app/services/audit.service'

type RouteContext = { params: Promise<{ id: string; materialId: string }> }

export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requireAuth()
    const { id: supplierId, materialId } = await ctx.params

    const link = await db.supplierMaterial.findUnique({
      where: { supplierId_materialId: { supplierId, materialId } },
      include: { material: true, supplier: true },
    })
    if (!link) return notFound('Vínculo não encontrado')

    await db.supplierMaterial.delete({
      where: { supplierId_materialId: { supplierId, materialId } },
    })

    await auditService.log({
      userId: user.id,
      action: 'DELETE',
      module: 'fornecedores',
      entityId: supplierId,
      entityName: link.supplier.corporateName || link.supplier.tradeName,
      details: `Vínculo com matéria-prima "${link.material.name}" removido`,
    })

    return ok({ success: true })
  } catch (error) {
    if (error instanceof Error && error.name === 'UnauthorizedError') return unauthorized()
    console.error('DELETE /api/suppliers/[id]/materials/[materialId] error:', error)
    return badRequest('Erro ao remover vínculo')
  }
}
