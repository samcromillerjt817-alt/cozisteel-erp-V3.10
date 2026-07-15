import { NextRequest } from 'next/server'
import { requireAuth, ok, badRequest, handleRouteError } from '@/lib/api-utils'
import { requisitionService } from '@/app/services/requisition.service'

/**
 * POST /api/requisitions/suggest
 * Body: { productionOrderId: string }
 *
 * Calcula, a partir da "receita" de matéria-prima do produto (ProductMaterial)
 * e da quantidade da Ordem de Produção, a necessidade total de cada matéria-prima,
 * compara com o saldo em estoque (Material.stockQty) e retorna os itens que faltam,
 * já sugerindo o fornecedor preferencial (SupplierMaterial.isPreferred) quando houver.
 *
 * O resultado pode ser enviado direto para POST /api/requisitions como "items".
 */
export async function POST(req: NextRequest) {
  try {
    await requireAuth()
    const body = await req.json()
    const { productionOrderId } = body

    if (!productionOrderId) return badRequest('productionOrderId é obrigatório')

    const result = await requisitionService.suggestForProductionOrder(productionOrderId)
    return ok(result)
  } catch (error) {
    return handleRouteError(error, 'Erro ao calcular sugestão de requisição')
  }
}
