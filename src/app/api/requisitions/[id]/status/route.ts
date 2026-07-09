import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireModulePermission, unauthorized, forbidden, ok, badRequest, notFound } from '@/lib/api-utils'
import { auditService } from '@/app/services/audit.service'
import { numberingService } from '@/app/services/numbering.service'

type RouteContext = { params: Promise<{ id: string }> }

const VALID_STATUSES = ['draft', 'sent', 'approved', 'ordered', 'cancelled']

/** Allowed forward transitions in the requisition approval/purchase flow */
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  draft: ['sent', 'cancelled'],
  sent: ['approved', 'cancelled', 'draft'],
  approved: ['ordered', 'cancelled'],
  ordered: ['cancelled'], // fulfillment agora rastreado no(s) PurchaseOrder(s) vinculado(s)
  cancelled: [],
}

function getTodayDate(): string {
  const now = new Date()
  return `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`
}

/**
 * Ao avançar a Requisição para "ordered", gera um Pedido de Compra formal por
 * fornecedor vencedor, agrupando os itens cuja cotação vencedora (RequisitionItemQuote.isSelected)
 * aponta para o mesmo fornecedor. O recebimento físico de mercadoria passa a
 * acontecer no Pedido de Compra, não mais aqui.
 */
async function generatePurchaseOrdersFromRequisition(requisitionId: string, userId: string) {
  const requisition = await db.requisition.findUnique({
    where: { id: requisitionId },
    include: { items: { include: { material: true, supplier: true } } },
  })
  if (!requisition) return []

  const bySupplier = new Map<string, typeof requisition.items>()
  for (const item of requisition.items) {
    if (!item.supplierId) continue
    const list = bySupplier.get(item.supplierId) || []
    list.push(item)
    bySupplier.set(item.supplierId, list)
  }

  const created = []
  for (const [supplierId, items] of bySupplier) {
    const number = await numberingService.getNextNumber('compra')
    const subtotal = items.reduce((sum, i) => sum + i.estimatedPrice * i.quantity, 0)
    const order = await db.purchaseOrder.create({
      data: {
        number,
        status: 'draft',
        supplierId,
        requisitionId: requisition.id,
        date: getTodayDate(),
        subtotal,
        total: subtotal,
        userId,
        items: {
          create: items.map((item) => ({
            requisitionItemId: item.id,
            materialId: item.materialId,
            quantity: item.quantity,
            unit: item.unit,
            unitPrice: item.estimatedPrice,
            total: item.estimatedPrice * item.quantity,
          })),
        },
      },
      include: { items: true, supplier: { select: { id: true, corporateName: true, tradeName: true } } },
    })
    created.push(order)
  }
  return created
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requireModulePermission('requisicoes', 'update')
    const { id } = await ctx.params
    const { status } = await req.json()

    if (!status || !VALID_STATUSES.includes(status)) {
      return badRequest(`Status inválido. Valores aceitos: ${VALID_STATUSES.join(', ')}`)
    }

    const requisition = await db.requisition.findUnique({
      where: { id },
      include: { items: true },
    })
    if (!requisition) return notFound('Requisição não encontrada')

    const allowed = ALLOWED_TRANSITIONS[requisition.status] || []
    if (!allowed.includes(status)) {
      return badRequest(`Não é possível mudar de "${requisition.status}" para "${status}"`)
    }

    if (status === 'ordered') {
      const itemsWithoutWinner = requisition.items.filter((i) => !i.supplierId)
      if (itemsWithoutWinner.length > 0) {
        return badRequest('Todos os itens precisam ter uma cotação vencedora selecionada antes de avançar para "Pedido feito"')
      }
    }

    const updateData: Record<string, unknown> = { status }
    if (status === 'approved') {
      updateData.approvedBy = user.id
      updateData.approvedAt = new Date()
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
      details: `Status da requisição ${requisition.number} alterado de "${requisition.status}" para "${status}"`,
    })

    let generatedPurchaseOrders: Awaited<ReturnType<typeof generatePurchaseOrdersFromRequisition>> = []
    if (status === 'ordered' && requisition.status !== 'ordered') {
      generatedPurchaseOrders = await generatePurchaseOrdersFromRequisition(id, user.id)

      if (generatedPurchaseOrders.length > 0) {
        await auditService.log({
          userId: user.id,
          action: 'CREATE',
          module: 'compras',
          entityId: id,
          entityName: requisition.number,
          details: `${generatedPurchaseOrders.length} Pedido(s) de Compra gerado(s) automaticamente a partir da requisição ${requisition.number}: ${generatedPurchaseOrders.map((o) => o.number).join(', ')}`,
        })
      }
    }

    return ok({ ...updated, generatedPurchaseOrders })
  } catch (error) {
    if (error instanceof Error && error.name === 'UnauthorizedError') return unauthorized()
    if (error instanceof Error && error.name === 'ForbiddenError') return forbidden(error.message)
    console.error('PATCH /api/requisitions/[id]/status error:', error)
    return badRequest('Erro ao alterar status')
  }
}
