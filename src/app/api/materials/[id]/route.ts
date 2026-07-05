import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, unauthorized, ok, badRequest, notFound } from '@/lib/api-utils'
import { auditService } from '@/app/services/audit.service'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: RouteContext) {
  try {
    await requireAuth()
    const { id } = await ctx.params

    const material = await db.material.findUnique({
      where: { id },
      include: {
        category: { select: { id: true, name: true } },
        suppliers: { include: { supplier: true }, orderBy: { isPreferred: 'desc' } },
        productMaterials: { include: { product: { select: { id: true, name: true, internalCode: true } } } },
        _count: { select: { products: true } },
      },
    })

    if (!material) return notFound('Matéria-prima não encontrada')
    return ok(material)
  } catch (error) {
    if (error instanceof Error && error.name === 'UnauthorizedError') return unauthorized()
    console.error('GET /api/materials/[id] error:', error)
    return badRequest('Erro ao buscar matéria-prima')
  }
}

export async function PUT(req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requireAuth()
    const { id } = await ctx.params
    const body = await req.json()

    const target = await db.material.findUnique({ where: { id } })
    if (!target) return notFound('Matéria-prima não encontrada')

    if (body.name && body.name !== target.name) {
      const existing = await db.material.findUnique({ where: { name: body.name } })
      if (existing) return badRequest('Já existe um material com este nome')
    }

    const { _count, suppliers, productMaterials, products, category, createdAt, id: _, ...updateData } = body
    const updated = await db.material.update({ where: { id }, data: updateData })

    await auditService.log({
      userId: user.id,
      action: 'UPDATE',
      module: 'materiais',
      entityId: id,
      entityName: updated.name,
      details: `Matéria-prima "${updated.name}" atualizada`,
    })

    return ok(updated)
  } catch (error) {
    if (error instanceof Error && error.name === 'UnauthorizedError') return unauthorized()
    console.error('PUT /api/materials/[id] error:', error)
    return badRequest('Erro ao atualizar matéria-prima')
  }
}

export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requireAuth()
    const { id } = await ctx.params

    const material = await db.material.findUnique({
      where: { id },
      include: { _count: { select: { products: true, productMaterials: true } } },
    })

    if (!material) return notFound('Matéria-prima não encontrada')
    if (material._count.products > 0 || material._count.productMaterials > 0) {
      return badRequest('Não é possível excluir uma matéria-prima vinculada a produtos')
    }

    await db.material.delete({ where: { id } })

    await auditService.log({
      userId: user.id,
      action: 'DELETE',
      module: 'materiais',
      entityId: id,
      entityName: material.name,
      details: `Matéria-prima "${material.name}" excluída`,
    })

    return ok({ success: true })
  } catch (error) {
    if (error instanceof Error && error.name === 'UnauthorizedError') return unauthorized()
    console.error('DELETE /api/materials/[id] error:', error)
    return badRequest('Erro ao excluir matéria-prima')
  }
}
