import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, unauthorized, ok, badRequest } from '@/lib/api-utils'

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

    const results: any[] = []

    if (type === 'all' || type === 'material') {
      const materials = await db.material.findMany({
        where: search ? { name: { contains: search } } : undefined,
        orderBy: { name: 'asc' },
      })
      for (const m of materials) {
        if (lowStockOnly && m.stockQty > m.minStockQty) continue
        results.push({
          itemType: 'material', id: m.id, name: m.name, internalCode: m.internalCode,
          unit: m.unit, stockQty: m.stockQty, minStockQty: m.minStockQty, costPrice: m.costPrice,
          isLow: m.stockQty <= m.minStockQty,
        })
      }
    }

    if (type === 'all' || type === 'product') {
      const products = await db.product.findMany({
        where: search ? { name: { contains: search } } : undefined,
        orderBy: { name: 'asc' },
      })
      for (const p of products) {
        if (lowStockOnly && p.stockQty > p.minStockQty) continue
        results.push({
          itemType: 'product', id: p.id, name: p.name, internalCode: p.internalCode,
          unit: p.unit, stockQty: p.stockQty, minStockQty: p.minStockQty, costPrice: p.costPrice,
          isLow: p.stockQty <= p.minStockQty,
        })
      }
    }

    return ok(results)
  } catch (error) {
    if (error instanceof Error && error.name === 'UnauthorizedError') return unauthorized()
    console.error('GET /api/stock/summary error:', error)
    return badRequest('Erro ao buscar resumo de estoque')
  }
}
