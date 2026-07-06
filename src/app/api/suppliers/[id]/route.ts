import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireModulePermission, unauthorized, forbidden, ok, badRequest, notFound } from '@/lib/api-utils'
import { auditService } from '@/app/services/audit.service'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: RouteContext) {
  try {
    await requireAuth()
    const { id } = await ctx.params

    const supplier = await db.supplier.findUnique({
      where: { id },
      include: {
        materials: {
          include: { material: { select: { id: true, name: true, unit: true, internalCode: true } } },
        },
        _count: { select: { requisitionItems: true } },
      },
    })

    if (!supplier) return notFound('Fornecedor não encontrado')
    return ok(supplier)
  } catch (error) {
    if (error instanceof Error && error.name === 'UnauthorizedError') return unauthorized()
    console.error('GET /api/suppliers/[id] error:', error)
    return badRequest('Erro ao buscar fornecedor')
  }
}

export async function PUT(req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requireModulePermission('fornecedores', 'update')
    const { id } = await ctx.params
    const body = await req.json()

    const target = await db.supplier.findUnique({ where: { id } })
    if (!target) return notFound('Fornecedor não encontrado')

    if (body.cpfCnpj && body.cpfCnpj !== target.cpfCnpj) {
      const existing = await db.supplier.findFirst({ where: { cpfCnpj: body.cpfCnpj } })
      if (existing) return badRequest('Já existe um fornecedor com este CNPJ/CPF')
    }

    const { _count, materials, requisitionItems, createdAt, id: _, ...updateData } = body
    const updated = await db.supplier.update({ where: { id }, data: updateData })

    await auditService.log({
      userId: user.id,
      action: 'UPDATE',
      module: 'fornecedores',
      entityId: id,
      entityName: updated.corporateName || updated.tradeName,
      details: `Fornecedor "${updated.corporateName || updated.tradeName}" atualizado`,
    })

    return ok(updated)
  } catch (error) {
    if (error instanceof Error && error.name === 'UnauthorizedError') return unauthorized()
    if (error instanceof Error && error.name === 'ForbiddenError') return forbidden(error.message)
    console.error('PUT /api/suppliers/[id] error:', error)
    return badRequest('Erro ao atualizar fornecedor')
  }
}

export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requireModulePermission('fornecedores', 'delete')
    const { id } = await ctx.params

    const supplier = await db.supplier.findUnique({
      where: { id },
      include: { _count: { select: { requisitionItems: true } } },
    })

    if (!supplier) return notFound('Fornecedor não encontrado')
    if (supplier._count.requisitionItems > 0) {
      return badRequest('Não é possível excluir um fornecedor com requisições vinculadas')
    }

    await db.supplier.delete({ where: { id } })

    await auditService.log({
      userId: user.id,
      action: 'DELETE',
      module: 'fornecedores',
      entityId: id,
      entityName: supplier.corporateName || supplier.tradeName,
      details: `Fornecedor "${supplier.corporateName || supplier.tradeName}" excluído`,
    })

    return ok({ success: true })
  } catch (error) {
    if (error instanceof Error && error.name === 'UnauthorizedError') return unauthorized()
    if (error instanceof Error && error.name === 'ForbiddenError') return forbidden(error.message)
    console.error('DELETE /api/suppliers/[id] error:', error)
    return badRequest('Erro ao excluir fornecedor')
  }
}
