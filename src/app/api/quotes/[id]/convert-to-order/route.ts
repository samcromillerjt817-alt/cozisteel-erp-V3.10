import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireModulePermission, unauthorized, forbidden, ok, created, badRequest, notFound } from '@/lib/api-utils'
import { numberingService } from '@/app/services/numbering.service'
import { auditService } from '@/app/services/audit.service'

type RouteContext = { params: Promise<{ id: string }> }

function getTodayDate(): string {
  const now = new Date()
  return `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`
}

/**
 * POST /api/quotes/[id]/convert-to-order
 *
 * Converte um orçamento APROVADO em Pedido de Venda. Ação manual (não automática):
 * o orçamento continua existindo normalmente, o Pedido de Venda passa a representar
 * a venda efetivada, com vínculo de rastreabilidade ao orçamento de origem.
 */
export async function POST(_req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requireModulePermission('orcamentos', 'update')
    const { id } = await ctx.params

    const quote = await db.quote.findUnique({
      where: { id },
      include: { items: true, salesOrder: true },
    })
    if (!quote) return notFound('Orçamento não encontrado')

    if (quote.status !== 'approved') {
      return badRequest('Apenas orçamentos aprovados podem ser convertidos em Pedido de Venda')
    }
    if (quote.salesOrder) {
      return badRequest(`Este orçamento já foi convertido no Pedido de Venda ${quote.salesOrder.number}`)
    }

    const number = await numberingService.getNextNumber('pedido')

    const salesOrder = await db.salesOrder.create({
      data: {
        number,
        status: 'open',
        date: getTodayDate(),
        quoteId: quote.id,
        clientId: quote.clientId,
        clientName: quote.clientName,
        clientCnpj: quote.clientCnpj,
        subtotal: quote.subtotal,
        discountTotal: quote.discountTotal,
        total: quote.total,
        paymentTerms: quote.paymentTerms,
        deliveryTime: quote.deliveryTime,
        notes: quote.notes,
        userId: user.id,
        items: {
          create: quote.items.map((item) => ({
            productId: item.productId || null,
            code: item.code,
            description: item.description,
            quantity: item.quantity,
            unit: item.unit,
            unitPrice: item.unitPrice,
            total: item.total,
            order: item.order,
          })),
        },
      },
      include: {
        items: true,
        quote: { select: { id: true, number: true } },
      },
    })

    await auditService.log({
      userId: user.id,
      action: 'CREATE',
      module: 'orcamentos',
      entityId: salesOrder.id,
      entityName: salesOrder.number,
      details: `Pedido de Venda ${salesOrder.number} gerado a partir do orçamento ${quote.number}`,
    })

    return created(salesOrder)
  } catch (error) {
    if (error instanceof Error && error.name === 'UnauthorizedError') return unauthorized()
    if (error instanceof Error && error.name === 'ForbiddenError') return forbidden(error.message)
    console.error('POST /api/quotes/[id]/convert-to-order error:', error)
    return badRequest('Erro ao converter orçamento em pedido de venda')
  }
}
