import { NextRequest } from 'next/server'
import { requireModulePermission, ok, handleRouteError } from '@/lib/api-utils'
import { stockService } from '@/app/services/stock.service'

/**
 * POST /api/stock/adjust
 * Body: { itemType: 'material'|'product', itemId: string, newQuantity: number, reason: string }
 *
 * Ajuste manual de inventário — define o saldo para um valor absoluto (contagem física)
 * e registra a diferença como um StockMovement do tipo ADJUST, com o motivo informado.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireModulePermission('estoque', 'update')
    const body = await req.json()
    const { itemType, itemId, newQuantity, reason } = body

    const result = await stockService.adjust(itemType, itemId, newQuantity, reason, user.id)
    return ok(result)
  } catch (error) {
    return handleRouteError(error, 'Erro ao ajustar estoque')
  }
}
