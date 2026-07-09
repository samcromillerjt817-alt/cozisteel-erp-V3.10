import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireModulePermission, unauthorized, forbidden, ok, badRequest, notFound } from '@/lib/api-utils'
import { validateDto, updatePurchaseOrderSchema } from '@/app/dto'
import { auditService } from '@/app/services/audit.service'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: RouteContext) {
  try {
    await requireAuth()
    const { id } = await ctx.params

    const purchaseOrder = await db.purchaseOrder.findUnique({
      where: { id },
      include: {
        supplier: true,
        requisition: { select: { id: true, number: true, status: true } },
        items: { include: { material: true, requisitionItem: { select: { id: true } } } },
        user: { select: { id: true, name: true } },
      },
    })

    if (!purchaseOrder) return notFound('Pedido de compra não encontrado')
    return ok(purchaseOrder)
  } catch (error) {
    if (error instanceof Error && error.name === 'UnauthorizedError') return unauthorized()
    console.error('GET /api/purchase-orders/[id] error:', error)
    return badRequest('Erro ao buscar pedido de compra')
  }
}

/** Only draft purchase orders can be edited — items/prices come from the requisition's winning quotes and are not editable here. */
export async function PUT(req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requireModulePermission('compras', 'update')
    const { id } = await ctx.params
    const body = await req.json()
    const data = validateDto(updatePurchaseOrderSchema, body)

    const target = await db.purchaseOrder.findUnique({ where: { id } })
    if (!target) return notFound('Pedido de compra não encontrado')
    if (target.status !== 'draft') {
      return badRequest('Apenas pedidos de compra em rascunho podem ser editados')
    }

    const updateData: Record<string, unknown> = {}
    if (data.expectedDate !== undefined) updateData.expectedDate = data.expectedDate
    if (data.paymentTerms !== undefined) updateData.paymentTerms = data.paymentTerms
    if (data.notes !== undefined) updateData.notes = data.notes

    const updated = await db.purchaseOrder.update({
      where: { id },
      data: updateData,
      include: { items: { include: { material: true } }, supplier: true },
    })

    await auditService.log({
      userId: user.id,
      action: 'UPDATE',
      module: 'compras',
      entityId: id,
      entityName: target.number,
      details: `Pedido de compra ${target.number} atualizado`,
    })

    return ok(updated)
  } catch (error) {
    if (error instanceof Error && error.name === 'UnauthorizedError') return unauthorized()
    if (error instanceof Error && error.name === 'ForbiddenError') return forbidden(error.message)
    if (error instanceof Error && error.name === 'BadRequestException') return badRequest(error.message)
    console.error('PUT /api/purchase-orders/[id] error:', error)
    return badRequest('Erro ao atualizar pedido de compra')
  }
}

export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requireModulePermission('compras', 'delete')
    const { id } = await ctx.params

    const purchaseOrder = await db.purchaseOrder.findUnique({ where: { id } })
    if (!purchaseOrder) return notFound('Pedido de compra não encontrado')
    if (!['draft', 'cancelled'].includes(purchaseOrder.status)) {
      return badRequest('Apenas pedidos de compra em rascunho ou cancelados podem ser excluídos')
    }

    await db.purchaseOrder.delete({ where: { id } })

    await auditService.log({
      userId: user.id,
      action: 'DELETE',
      module: 'compras',
      entityId: id,
      entityName: purchaseOrder.number,
      details: `Pedido de compra ${purchaseOrder.number} excluído`,
    })

    return ok({ success: true })
  } catch (error) {
    if (error instanceof Error && error.name === 'UnauthorizedError') return unauthorized()
    if (error instanceof Error && error.name === 'ForbiddenError') return forbidden(error.message)
    console.error('DELETE /api/purchase-orders/[id] error:', error)
    return badRequest('Erro ao excluir pedido de compra')
  }
}
