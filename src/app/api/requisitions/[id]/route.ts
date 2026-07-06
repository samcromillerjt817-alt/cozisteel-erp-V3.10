import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireModulePermission, unauthorized, forbidden, ok, badRequest, notFound } from '@/lib/api-utils'
import { validateDto, updateRequisitionSchema } from '@/app/dto'
import { auditService } from '@/app/services/audit.service'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: RouteContext) {
  try {
    await requireAuth()
    const { id } = await ctx.params

    const requisition = await db.requisition.findUnique({
      where: { id },
      include: {
        items: { include: { material: true, supplier: true, quotes: { include: { supplier: { select: { id: true, corporateName: true, tradeName: true } } }, orderBy: { price: 'asc' } } } },
        productionOrder: { select: { id: true, number: true, productName: true } },
        user: { select: { id: true, name: true } },
      },
    })

    if (!requisition) return notFound('Requisição não encontrada')
    return ok(requisition)
  } catch (error) {
    if (error instanceof Error && error.name === 'UnauthorizedError') return unauthorized()
    console.error('GET /api/requisitions/[id] error:', error)
    return badRequest('Erro ao buscar requisição')
  }
}

/** Only draft requisitions can have their items edited — once sent/approved, use the status route to advance the flow. */
export async function PUT(req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requireModulePermission('requisicoes', 'update')
    const { id } = await ctx.params
    const body = await req.json()
    const data = validateDto(updateRequisitionSchema, body)

    const target = await db.requisition.findUnique({ where: { id } })
    if (!target) return notFound('Requisição não encontrada')
    if (target.status !== 'draft') {
      return badRequest('Apenas requisições em rascunho podem ser editadas')
    }

    const updateData: Record<string, unknown> = {}
    if (data.neededBy !== undefined) updateData.neededBy = data.neededBy
    if (data.notes !== undefined) updateData.notes = data.notes

    if (data.items) {
      await db.requisitionItem.deleteMany({ where: { requisitionId: id } })
      updateData.items = {
        create: data.items.map((item) => ({
          materialId: item.materialId,
          supplierId: item.supplierId || null,
          quantity: item.quantity,
          unit: item.unit,
          estimatedPrice: item.estimatedPrice,
          notes: item.notes,
        })),
      }
    }

    const updated = await db.requisition.update({
      where: { id },
      data: updateData,
      include: { items: { include: { material: true, supplier: true } } },
    })

    await auditService.log({
      userId: user.id,
      action: 'UPDATE',
      module: 'requisicoes',
      entityId: id,
      entityName: target.number,
      details: `Requisição ${target.number} atualizada`,
    })

    return ok(updated)
  } catch (error) {
    if (error instanceof Error && error.name === 'UnauthorizedError') return unauthorized()
    if (error instanceof Error && error.name === 'ForbiddenError') return forbidden(error.message)
    if (error instanceof Error && error.name === 'BadRequestException') return badRequest(error.message)
    console.error('PUT /api/requisitions/[id] error:', error)
    return badRequest('Erro ao atualizar requisição')
  }
}

export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requireModulePermission('requisicoes', 'delete')
    const { id } = await ctx.params

    const requisition = await db.requisition.findUnique({ where: { id } })
    if (!requisition) return notFound('Requisição não encontrada')
    if (!['draft', 'cancelled'].includes(requisition.status)) {
      return badRequest('Apenas requisições em rascunho ou canceladas podem ser excluídas')
    }

    await db.requisition.delete({ where: { id } })

    await auditService.log({
      userId: user.id,
      action: 'DELETE',
      module: 'requisicoes',
      entityId: id,
      entityName: requisition.number,
      details: `Requisição ${requisition.number} excluída`,
    })

    return ok({ success: true })
  } catch (error) {
    if (error instanceof Error && error.name === 'UnauthorizedError') return unauthorized()
    if (error instanceof Error && error.name === 'ForbiddenError') return forbidden(error.message)
    console.error('DELETE /api/requisitions/[id] error:', error)
    return badRequest('Erro ao excluir requisição')
  }
}
