import { stockValuationRepository } from '@/app/repositories/stock-valuation.repository'

export interface MaterialValuationLine {
  materialId: string
  materialName: string
  quantityAvailable: number
  averageUnitCost: number
  value: number
}

export interface FinishedGoodsValuationLine {
  productId: string
  productName: string
  stockQty: number
  /** Custo de MATERIAL do `ProductBatch` mais recente já produzido para este produto — `null`
   * quando o produto nunca passou pelo fluxo de produção `lotControlled` (nenhum `ProductBatch`
   * existe para ele ainda), caso em que `value` também é `null` em vez de 0 (ausência de dado
   * conhecido, não "vale zero"). */
  unitCost: number | null
  value: number | null
}

export interface RawMaterialValuationResult {
  lines: MaterialValuationLine[]
  total: number
}

export interface FinishedGoodsValuationResult {
  lines: FinishedGoodsValuationLine[]
  total: number
}

export interface StockValuationTotals {
  rawMaterial: number
  finishedGoods: number
  total: number
}

/**
 * Fase 12 (ADR-016, Subetapa 5) — Valorização de Estoque. Serviço reutilizável por desenho: nenhuma
 * rota/UI o chama ainda (Subetapa 7), então qualquer futuro consumidor (API, Dashboard, relatório)
 * usa exatamente os mesmos 3 métodos, nunca uma versão paralela específica de tela.
 *
 * **Matéria-prima**: valorização precisa, por lote — `Σ (MaterialBatch.quantityAvailable ×
 * MaterialBatch.unitCost)`, o mesmo dado que já alimenta `CostingService`/`traceBackward()` (Fase
 * 10, ADR-013), nunca `Material.costPrice` (manual, já catalogado como não confiável no
 * levantamento do ADR-016, Parte 2.1).
 *
 * **Produto acabado — achado disclosed, não implementado como precisão de lote**: diferente de
 * `MaterialBatch`, `ProductBatch` não tem um campo `quantityAvailable` (nada no schema hoje
 * decrementa um lote de produto quando ele é vendido) — não existe como saber "quanto resta EM
 * ESTOQUE de um lote de produção específico". A valorização de produto acabado aqui é uma
 * **aproximação**: `Product.stockQty` (saldo agregado, já existente) × custo de material do
 * `ProductBatch` mais recente já produzido daquele produto — não uma soma por lote como a de
 * matéria-prima. Modelar precisão por lote exigiria adicionar `quantityAvailable` a `ProductBatch`
 * e decrementá-lo também na venda (`SalesOrderItem` não referencia `ProductBatch` hoje) — mudança de
 * schema nova, fora do escopo desta subetapa. Produtos que nunca passaram pelo fluxo de produção
 * `lotControlled` (sem nenhum `ProductBatch`) aparecem com `unitCost`/`value` `null`, não 0.
 */
class StockValuationService {
  async getRawMaterialValuation(): Promise<RawMaterialValuationResult> {
    const batches = await stockValuationRepository.findOpenMaterialBatches()

    const byMaterial = new Map<string, { materialName: string; quantityAvailable: number; value: number }>()
    for (const batch of batches) {
      const entry = byMaterial.get(batch.materialId) ?? { materialName: batch.material.name, quantityAvailable: 0, value: 0 }
      entry.quantityAvailable += batch.quantityAvailable
      entry.value += batch.quantityAvailable * batch.unitCost
      byMaterial.set(batch.materialId, entry)
    }

    const lines: MaterialValuationLine[] = Array.from(byMaterial.entries()).map(([materialId, entry]) => ({
      materialId,
      materialName: entry.materialName,
      quantityAvailable: entry.quantityAvailable,
      averageUnitCost: entry.quantityAvailable > 0 ? entry.value / entry.quantityAvailable : 0,
      value: entry.value,
    }))

    return { lines, total: lines.reduce((sum, l) => sum + l.value, 0) }
  }

  async getFinishedGoodsValuation(): Promise<FinishedGoodsValuationResult> {
    const products = await stockValuationRepository.findProductsWithStock()
    const productIds = products.map((p) => p.id)
    const latestCosts = productIds.length > 0 ? await stockValuationRepository.findLatestMaterialCostByProduct(productIds) : []
    const costByProduct = new Map(latestCosts.map((c) => [c.productId, c.materialCost as number]))

    const lines: FinishedGoodsValuationLine[] = products.map((product) => {
      const unitCost = costByProduct.get(product.id) ?? null
      return {
        productId: product.id,
        productName: product.name,
        stockQty: product.stockQty,
        unitCost,
        value: unitCost !== null ? product.stockQty * unitCost : null,
      }
    })

    return { lines, total: lines.reduce((sum, l) => sum + (l.value ?? 0), 0) }
  }

  async getTotalValuation(): Promise<StockValuationTotals> {
    const [rawMaterial, finishedGoods] = await Promise.all([this.getRawMaterialValuation(), this.getFinishedGoodsValuation()])
    return { rawMaterial: rawMaterial.total, finishedGoods: finishedGoods.total, total: rawMaterial.total + finishedGoods.total }
  }
}

export const stockValuationService = new StockValuationService()
