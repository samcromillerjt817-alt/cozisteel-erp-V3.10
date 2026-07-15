import { NextRequest } from 'next/server'
import { requireAuth, ok, handleRouteError } from '@/lib/api-utils'
import { stockService } from '@/app/services/stock.service'

/**
 * GET /api/stock/summary?type=material|product|all&search=&lowStockOnly=true
 *
 * Fonte oficial de saldo disponível no ERP — reúne matéria-prima e produto
 * acabado numa mesma visão, já sinalizando quem está abaixo do mínimo.
 */
export async function GET(req: NextRequest) {
  try {
    await requireAuth()
    const { searchParams } = new URL(req.url)
    const type = searchParams.get('type') || 'all'
    const search = searchParams.get('search') || ''
    const lowStockOnly = searchParams.get('lowStockOnly') === 'true'

    const result = await stockService.summary({ type, search, lowStockOnly })
    return ok(result)
  } catch (error) {
    return handleRouteError(error, 'Erro ao buscar resumo de estoque')
  }
}
