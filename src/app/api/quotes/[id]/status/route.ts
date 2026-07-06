import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireModulePermission, unauthorized, forbidden, ok, badRequest, notFound } from '@/lib/api-utils'
import { auditService } from '@/app/services/audit.service'
import { numberingService } from '@/app/services/numbering.service'

type RouteContext = { params: Promise<{ id: string }> }

const VALID_STATUSES = ['draft', 'sent', 'approved', 'rejected', 'cancelled', 'expired']

function getTodayDate(): string {
  const now = new Date()
  return `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`
}

/**
 * Ao aprovar um orçamento, gera automaticamente uma Ordem de Produção (OP/OF)
 * para cada item do orçamento que esteja vinculado a um produto cadastrado.
 * Itens "avulsos" (sem productId) são ignorados, pois não há o que produzir via OP.
 */
async function generateProductionOrdersFromQuote(quoteId: string, userId: string) {
  const quote = await db.quote.findUnique({
    where: { id: quoteId },
    include: { items: { where: { productId: { not: null } } } },
  })
  if (!quote || quote.items.length === 0) return []

  const created = []
  for (const item of quote.items) {
    const number = await numberingService.getNextNumber('op')
    const order = await db.productionOrder.create({
      data: {
        number,
        status: 'planned',
        date: getTodayDate(),
        productId: item.productId,
        productName: item.description,
        quantity: item.quantity,
        unit: item.unit,
        priority: 'normal',
        description: `Gerada automaticamente a partir do orçamento ${quote.number} (aprovado)`,
        notes: item.notes,
        userId,
      },
    })
    created.push(order)
  }
  return created
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requireModulePermission('orcamentos', 'update')
    const { id } = await ctx.params
    const { status } = await req.json()

    if (!status || !VALID_STATUSES.includes(status)) {
      return badRequest(`Status inválido. Valores aceitos: ${VALID_STATUSES.join(', ')}`)
    }

    const quote = await db.quote.findUnique({ where: { id } })
    if (!quote) return notFound('Orçamento não encontrado')

    const updateData: Record<string, unknown> = { status }

    if (status === 'approved') {
      updateData.approvedBy = user.id
      updateData.approvedAt = new Date()
    }

    if (status === 'sent') {
      updateData.sentAt = new Date()
    }

    const updated = await db.quote.update({
      where: { id },
      data: updateData,
      include: {
        client: { select: { id: true, corporateName: true } },
        user: { select: { id: true, name: true } },
      },
    })

    await auditService.log({
      userId: user.id,
      action: 'PATCH',
      module: 'orcamentos',
      entityId: id,
      entityName: quote.number,
      details: `Status do orçamento ${quote.number} alterado de "${quote.status}" para "${status}"`,
    })

    let productionOrders: Awaited<ReturnType<typeof generateProductionOrdersFromQuote>> = []
    if (status === 'approved' && quote.status !== 'approved') {
      productionOrders = await generateProductionOrdersFromQuote(id, user.id)

      if (productionOrders.length > 0) {
        await auditService.log({
          userId: user.id,
          action: 'CREATE',
          module: 'producao',
          entityId: id,
          entityName: quote.number,
          details: `${productionOrders.length} Ordem(ns) de Produção gerada(s) automaticamente a partir do orçamento ${quote.number}: ${productionOrders.map((o) => o.number).join(', ')}`,
        })
      }
    }

    return ok({ ...updated, generatedProductionOrders: productionOrders })
  } catch (error) {
    if (error instanceof Error && error.name === 'UnauthorizedError') return unauthorized()
    if (error instanceof Error && error.name === 'ForbiddenError') return forbidden(error.message)
    console.error('PATCH /api/quotes/[id]/status error:', error)
    return badRequest('Erro ao alterar status')
  }
}