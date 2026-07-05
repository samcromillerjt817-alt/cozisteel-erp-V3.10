import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, unauthorized, ok, badRequest, notFound } from '@/lib/api-utils'
import { auditService } from '@/app/services/audit.service'

type RouteContext = { params: Promise<{ id: string }> }

const VALID_STATUSES = ['draft', 'sent', 'approved', 'ordered', 'partially_received', 'received', 'cancelled']

/** Allowed forward transitions in the requisition approval/purchase flow */
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  draft: ['sent', 'cancelled'],
  sent: ['approved', 'cancelled', 'draft'],
  approved: ['ordered', 'cancelled'],
  ordered: ['partially_received', 'received', 'cancelled'],
  partially_received: ['received', 'cancelled'],
  received: [],
  cancelled: [],
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requireAuth()
    const { id } = await ctx.params
    const { status } = await req.json()

    if (!status || !VALID_STATUSES.includes(status)) {
      return badRequest(`Status inválido. Valores aceitos: ${VALID_STATUSES.join(', ')}`)
    }

    const requisition = await db.requisition.findUnique({
      where: { id },
      include: { items: { include: { material: true } } },
    })
    if (!requisition) return notFound('Requisição não encontrada')

    const allowed = ALLOWED_TRANSITIONS[requisition.status] || []
    if (!allowed.includes(status)) {
      return badRequest(`Não é possível mudar de "${requisition.status}" para "${status}"`)
    }

    const updateData: Record<string, unknown> = { status }
    if (status === 'approved') {
      updateData.approvedBy = user.id
      updateData.approvedAt = new Date()
    }

    // Ao dar entrada (recebido / parcialmente recebido), soma a quantidade recebida ao estoque de cada matéria-prima
    // e registra o histórico oficial de movimentação (StockMovement)
    if (status === 'received' || status === 'partially_received') {
      for (const item of requisition.items) {
        const material = await db.material.update({
          where: { id: item.materialId },
          data: { stockQty: { increment: item.quantity } },
        })
        await db.stockMovement.create({
          data: {
            itemType: 'material', materialId: item.materialId, type: 'IN',
            quantity: item.quantity, balanceAfter: material.stockQty,
            reason: `Recebimento da requisição ${requisition.number}`,
            referenceType: 'requisition', referenceId: requisition.id,
            userId: user.id,
          },
        })
      }
    }

    const updated = await db.requisition.update({
      where: { id },
      data: updateData,
      include: {
        items: { include: { material: true, supplier: true } },
        productionOrder: { select: { id: true, number: true } },
      },
    })

    await auditService.log({
      userId: user.id,
      action: 'PATCH',
      module: 'requisicoes',
      entityId: id,
      entityName: requisition.number,
      details: `Status da requisição ${requisition.number} alterado de "${requisition.status}" para "${status}"${
        status === 'received' || status === 'partially_received' ? ' — estoque de matéria-prima atualizado' : ''
      }`,
    })

    return ok(updated)
  } catch (error) {
    if (error instanceof Error && error.name === 'UnauthorizedError') return unauthorized()
    console.error('PATCH /api/requisitions/[id]/status error:', error)
    return badRequest('Erro ao alterar status da requisição')
  }
}
