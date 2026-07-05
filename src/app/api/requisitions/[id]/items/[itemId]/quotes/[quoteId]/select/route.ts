import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, unauthorized, ok, badRequest, notFound } from '@/lib/api-utils'
import { auditService } from '@/app/services/audit.service'

type RouteContext = { params: Promise<{ id: string; itemId: string; quoteId: string }> }

/**
 * POST /api/requisitions/[id]/items/[itemId]/quotes/[quoteId]/select
 *
 * Marca a cotação como vencedora e grava o fornecedor/preço escolhidos de volta
 * no RequisitionItem — a partir daí ele representa o Pedido de Compra definitivo.
 */
export async function POST(_req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requireAuth()
    const { itemId, quoteId } = await ctx.params

    const quote = await db.requisitionItemQuote.findUnique({
      where: { id: quoteId },
      include: { supplier: true },
    })
    if (!quote || quote.requisitionItemId !== itemId) return notFound('Cotação não encontrada')

    await db.requisitionItemQuote.updateMany({
      where: { requisitionItemId: itemId },
      data: { isSelected: false },
    })
    await db.requisitionItemQuote.update({ where: { id: quoteId }, data: { isSelected: true } })

    const item = await db.requisitionItem.update({
      where: { id: itemId },
      data: { supplierId: quote.supplierId, estimatedPrice: quote.price },
      include: { material: true, supplier: true },
    })

    await auditService.log({
      userId: user.id,
      action: 'UPDATE',
      module: 'requisicoes',
      entityId: itemId,
      entityName: item.material.name,
      details: `Cotação vencedora selecionada: "${quote.supplier.corporateName || quote.supplier.tradeName}" — R$ ${quote.price.toFixed(2)} para "${item.material.name}"`,
    })

    return ok(item)
  } catch (error) {
    if (error instanceof Error && error.name === 'UnauthorizedError') return unauthorized()
    console.error('POST /api/requisitions/[id]/items/[itemId]/quotes/[quoteId]/select error:', error)
    return badRequest('Erro ao selecionar cotação')
  }
}
