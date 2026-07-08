import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireModulePermission, unauthorized, forbidden, ok, badRequest, notFound } from '@/lib/api-utils'
import { auditService } from '@/app/services/audit.service'

type RouteContext = { params: Promise<{ id: string }> }

const VALID_STATUSES = ['open', 'in_production', 'completed', 'cancelled']

export async function GET(_req: NextRequest, ctx: RouteContext) {
  try {
    await requireAuth()
    const { id } = await ctx.params

    const salesOrder = await db.salesOrder.findUnique({
      where: { id },
      include: {
        items: { include: { product: { select: { id: true, name: true, internalCode: true } } } },
        quote: { select: { id: true, number: true, status: true } },
        client: true,
        user: { select: { id: true, name: true } },
        productionOrders: { select: { id: true, number: true, status: true, productName: true, quantity: true } },
      },
    })

    if (!salesOrder) return notFound('Pedido de venda não encontrado')
    return ok(salesOrder)
  } catch (error) {
    if (error instanceof Error && error.name === 'UnauthorizedError') return unauthorized()
    console.error('GET /api/sales-orders/[id] error:', error)
    return badRequest('Erro ao buscar pedido de venda')
  }
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requireModulePermission('orcamentos', 'update')
    const { id } = await ctx.params
    const { status } = await req.json()

    if (!status || !VALID_STATUSES.includes(status)) {
      return badRequest(`Status inválido. Valores aceitos: ${VALID_STATUSES.join(', ')}`)
    }

    const salesOrder = await db.salesOrder.findUnique({ where: { id } })
    if (!salesOrder) return notFound('Pedido de venda não encontrado')

    const updated = await db.salesOrder.update({ where: { id }, data: { status } })

    await auditService.log({
      userId: user.id,
      action: 'PATCH',
      module: 'orcamentos',
      entityId: id,
      entityName: salesOrder.number,
      details: `Status do pedido de venda ${salesOrder.number} alterado de "${salesOrder.status}" para "${status}"`,
    })

    return ok(updated)
  } catch (error) {
    if (error instanceof Error && error.name === 'UnauthorizedError') return unauthorized()
    if (error instanceof Error && error.name === 'ForbiddenError') return forbidden(error.message)
    console.error('PATCH /api/sales-orders/[id] error:', error)
    return badRequest('Erro ao atualizar status do pedido de venda')
  }
}
