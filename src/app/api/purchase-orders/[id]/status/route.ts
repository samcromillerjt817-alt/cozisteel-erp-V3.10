import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireModulePermission, unauthorized, forbidden, ok, badRequest, notFound } from '@/lib/api-utils'
import { auditService } from '@/app/services/audit.service'

type RouteContext = { params: Promise<{ id: string }> }

// partially_received/received não são aceitos aqui de propósito — eles só
// resultam do endpoint dedicado de recebimento (/receive), que trabalha com
// quantidades por item em vez de um valor único de status.
const VALID_STATUSES = ['draft', 'sent', 'confirmed', 'cancelled']

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  draft: ['sent', 'cancelled'],
  sent: ['confirmed', 'cancelled'],
  confirmed: ['cancelled'],
  partially_received: ['cancelled'],
  received: [],
  cancelled: [],
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requireModulePermission('compras', 'update')
    const { id } = await ctx.params
    const { status } = await req.json()

    if (!status || !VALID_STATUSES.includes(status)) {
      return badRequest(`Status inválido. Use o endpoint de recebimento para dar entrada de mercadoria. Valores aceitos: ${VALID_STATUSES.join(', ')}`)
    }

    const purchaseOrder = await db.purchaseOrder.findUnique({ where: { id } })
    if (!purchaseOrder) return notFound('Pedido de compra não encontrado')

    const allowed = ALLOWED_TRANSITIONS[purchaseOrder.status] || []
    if (!allowed.includes(status)) {
      return badRequest(`Não é possível mudar de "${purchaseOrder.status}" para "${status}"`)
    }

    const updateData: Record<string, unknown> = { status }
    if (status === 'sent') updateData.sentAt = new Date()
    if (status === 'confirmed') updateData.confirmedAt = new Date()
    if (status === 'cancelled') updateData.cancelledAt = new Date()

    const updated = await db.purchaseOrder.update({
      where: { id },
      data: updateData,
      include: { items: { include: { material: true } }, supplier: { select: { id: true, corporateName: true, tradeName: true } } },
    })

    await auditService.log({
      userId: user.id,
      action: 'PATCH',
      module: 'compras',
      entityId: id,
      entityName: purchaseOrder.number,
      details: `Status do pedido de compra ${purchaseOrder.number} alterado de "${purchaseOrder.status}" para "${status}"`,
    })

    return ok(updated)
  } catch (error) {
    if (error instanceof Error && error.name === 'UnauthorizedError') return unauthorized()
    if (error instanceof Error && error.name === 'ForbiddenError') return forbidden(error.message)
    console.error('PATCH /api/purchase-orders/[id]/status error:', error)
    return badRequest('Erro ao alterar status')
  }
}
