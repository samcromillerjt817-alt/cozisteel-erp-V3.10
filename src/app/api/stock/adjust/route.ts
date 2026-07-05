import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, unauthorized, ok, badRequest, notFound } from '@/lib/api-utils'
import { auditService } from '@/app/services/audit.service'

/**
 * POST /api/stock/adjust
 * Body: { itemType: 'material'|'product', itemId: string, newQuantity: number, reason: string }
 *
 * Ajuste manual de inventário — define o saldo para um valor absoluto (contagem física)
 * e registra a diferença como um StockMovement do tipo ADJUST, com o motivo informado.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth()
    const body = await req.json()
    const { itemType, itemId, newQuantity, reason } = body

    if (!itemType || !['material', 'product'].includes(itemType)) {
      return badRequest('itemType deve ser "material" ou "product"')
    }
    if (!itemId) return badRequest('itemId é obrigatório')
    if (typeof newQuantity !== 'number' || newQuantity < 0) {
      return badRequest('newQuantity deve ser um número maior ou igual a zero')
    }
    if (!reason || !String(reason).trim()) {
      return badRequest('Informe o motivo do ajuste de inventário')
    }

    let previousQty = 0
    let balanceAfter = 0
    let entityName = ''

    if (itemType === 'material') {
      const material = await db.material.findUnique({ where: { id: itemId } })
      if (!material) return notFound('Matéria-prima não encontrada')
      previousQty = material.stockQty
      const updated = await db.material.update({ where: { id: itemId }, data: { stockQty: newQuantity } })
      balanceAfter = updated.stockQty
      entityName = material.name
    } else {
      const product = await db.product.findUnique({ where: { id: itemId } })
      if (!product) return notFound('Produto não encontrado')
      previousQty = product.stockQty
      const updated = await db.product.update({ where: { id: itemId }, data: { stockQty: newQuantity } })
      balanceAfter = updated.stockQty
      entityName = product.name
    }

    const delta = newQuantity - previousQty

    const movement = await db.stockMovement.create({
      data: {
        itemType,
        materialId: itemType === 'material' ? itemId : null,
        productId: itemType === 'product' ? itemId : null,
        type: 'ADJUST',
        quantity: Math.abs(delta),
        balanceAfter,
        reason: `Ajuste de inventário: ${reason}`,
        referenceType: 'manual',
        userId: user.id,
      },
    })

    await auditService.log({
      userId: user.id,
      action: 'UPDATE',
      module: 'estoque',
      entityId: itemId,
      entityName,
      details: `Ajuste de inventário em "${entityName}": ${previousQty} → ${newQuantity} (${delta >= 0 ? '+' : ''}${delta}). Motivo: ${reason}`,
    })

    return ok({ movement, previousQty, newQuantity, delta })
  } catch (error) {
    if (error instanceof Error && error.name === 'UnauthorizedError') return unauthorized()
    console.error('POST /api/stock/adjust error:', error)
    return badRequest('Erro ao ajustar estoque')
  }
}
