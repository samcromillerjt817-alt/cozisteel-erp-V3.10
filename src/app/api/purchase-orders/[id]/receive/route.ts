import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireModulePermission, unauthorized, forbidden, ok, badRequest, notFound } from '@/lib/api-utils'
import { validateDto, receivePurchaseOrderSchema } from '@/app/dto'
import { auditService } from '@/app/services/audit.service'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * POST /api/purchase-orders/[id]/receive
 *
 * Registra o recebimento físico de mercadoria contra um Pedido de Compra,
 * por item e com suporte a recebimento parcial (múltiplas chamadas). Dá
 * entrada no estoque de matéria-prima e recalcula o status do pedido a
 * partir da soma das quantidades recebidas por item.
 */
export async function POST(req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requireModulePermission('compras', 'update')
    const { id } = await ctx.params
    const body = await req.json()
    const data = validateDto(receivePurchaseOrderSchema, body)

    const purchaseOrder = await db.purchaseOrder.findUnique({
      where: { id },
      include: { items: true },
    })
    if (!purchaseOrder) return notFound('Pedido de compra não encontrado')
    if (!['confirmed', 'partially_received'].includes(purchaseOrder.status)) {
      return badRequest('Apenas pedidos de compra confirmados ou parcialmente recebidos podem receber mercadoria')
    }

    const itemsById = new Map(purchaseOrder.items.map((i) => [i.id, i]))
    for (const entry of data.items) {
      const item = itemsById.get(entry.purchaseOrderItemId)
      if (!item) return badRequest(`Item ${entry.purchaseOrderItemId} não pertence a este pedido de compra`)
      const outstanding = item.quantity - item.quantityReceived
      if (entry.quantityReceived > outstanding) {
        return badRequest(`Quantidade recebida excede a quantidade em aberto do item (${outstanding} restante)`)
      }
    }

    for (const entry of data.items) {
      const item = itemsById.get(entry.purchaseOrderItemId)!
      await db.purchaseOrderItem.update({
        where: { id: item.id },
        data: { quantityReceived: { increment: entry.quantityReceived } },
      })
      const material = await db.material.update({
        where: { id: item.materialId },
        data: { stockQty: { increment: entry.quantityReceived } },
      })
      await db.stockMovement.create({
        data: {
          itemType: 'material',
          materialId: item.materialId,
          type: 'IN',
          quantity: entry.quantityReceived,
          balanceAfter: material.stockQty,
          reason: `Recebimento do pedido de compra ${purchaseOrder.number}`,
          referenceType: 'purchase_order',
          referenceId: purchaseOrder.id,
          userId: user.id,
        },
      })
    }

    const refreshedItems = await db.purchaseOrderItem.findMany({ where: { purchaseOrderId: id } })
    const allComplete = refreshedItems.every((i) => i.quantityReceived >= i.quantity)
    const someReceived = refreshedItems.some((i) => i.quantityReceived > 0)
    const newStatus = allComplete ? 'received' : someReceived ? 'partially_received' : purchaseOrder.status

    const updated = await db.purchaseOrder.update({
      where: { id },
      data: {
        status: newStatus,
        receivedAt: newStatus === 'received' ? new Date() : purchaseOrder.receivedAt,
      },
      include: { items: { include: { material: true } }, supplier: { select: { id: true, corporateName: true, tradeName: true } } },
    })

    await auditService.log({
      userId: user.id,
      action: 'UPDATE',
      module: 'compras',
      entityId: id,
      entityName: purchaseOrder.number,
      details: `Recebimento registrado no pedido de compra ${purchaseOrder.number} (${data.items.length} item(ns)) — status: "${newStatus}"`,
    })

    return ok(updated)
  } catch (error) {
    if (error instanceof Error && error.name === 'UnauthorizedError') return unauthorized()
    if (error instanceof Error && error.name === 'ForbiddenError') return forbidden(error.message)
    if (error instanceof Error && error.name === 'BadRequestException') return badRequest(error.message)
    console.error('POST /api/purchase-orders/[id]/receive error:', error)
    return badRequest('Erro ao registrar recebimento')
  }
}
