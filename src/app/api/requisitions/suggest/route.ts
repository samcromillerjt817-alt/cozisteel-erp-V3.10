import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, unauthorized, ok, badRequest, notFound } from '@/lib/api-utils'

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

    const productionOrder = await db.productionOrder.findUnique({
      where: { id: productionOrderId },
      include: {
        product: {
          include: {
            materials: {
              include: {
                material: {
                  include: {
                    suppliers: { where: { isPreferred: true }, take: 1 },
                  },
                },
              },
            },
          },
        },
      },
    })

    if (!productionOrder) return notFound('Ordem de produção não encontrada')
    if (!productionOrder.product) {
      return badRequest('Esta ordem de produção não está vinculada a um produto cadastrado')
    }
    if (productionOrder.product.materials.length === 0) {
      return ok({
        productionOrderId,
        productName: productionOrder.product.name,
        items: [],
        message: 'Este produto não possui matérias-primas vinculadas (cadastre em Produto > Matérias-primas).',
      })
    }

    const items = productionOrder.product.materials.map((pm) => {
      const grossNeeded = pm.quantity * productionOrder.quantity * (1 + pm.scrapPct / 100)
      const missingQty = Math.max(0, grossNeeded - pm.material.stockQty)
      const preferredSupplier = pm.material.suppliers[0]

      return {
        materialId: pm.materialId,
        materialName: pm.material.name,
        unit: pm.unit,
        neededQty: Number(grossNeeded.toFixed(4)),
        currentStock: pm.material.stockQty,
        missingQty: Number(missingQty.toFixed(4)),
        suggestedSupplierId: preferredSupplier?.supplierId || null,
        estimatedPrice: preferredSupplier?.lastPrice || pm.material.costPrice || 0,
      }
    })

    return ok({
      productionOrderId,
      productName: productionOrder.product.name,
      quantity: productionOrder.quantity,
      items: items.filter((i) => i.missingQty > 0),
      allItems: items,
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'UnauthorizedError') return unauthorized()
    console.error('POST /api/requisitions/suggest error:', error)
    return badRequest('Erro ao calcular sugestão de requisição')
  }
}
