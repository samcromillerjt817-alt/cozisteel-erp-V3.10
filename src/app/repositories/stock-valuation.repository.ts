import { db } from '@/lib/db'

/**
 * Fase 12 (ADR-016, Subetapa 5) — leitura para valorização de estoque. Deliberadamente separado de
 * `stock.repository.ts` (dono de `Material`/`Product`/`StockMovement` para o módulo Estoque): aqui a
 * consulta é sobre lotes (`MaterialBatch`/`ProductBatch`, ADR-013), o mesmo domínio que
 * `batch-traceability.repository.ts` já lê — valorização financeira, não operação de estoque.
 * Puramente de leitura, sem lógica de negócio (isso fica em `stock-valuation.service.ts`).
 */
class StockValuationRepository {
  /** Todo `MaterialBatch` com saldo disponível — FIFO opera sobre este mesmo campo em outros
   * lugares do sistema (ex. `produceWithTx`), aqui só somamos o valor, não consumimos. */
  findOpenMaterialBatches() {
    return db.materialBatch.findMany({
      where: { quantityAvailable: { gt: 0 } },
      select: {
        materialId: true,
        quantityAvailable: true,
        unitCost: true,
        material: { select: { name: true } },
      },
    })
  }

  findProductsWithStock() {
    return db.product.findMany({
      where: { stockQty: { gt: 0 }, active: true },
      select: { id: true, name: true, stockQty: true },
    })
  }

  /** 1 linha por `productId` — o `ProductBatch` mais recente com `materialCost` já calculado
   * (`distinct` + `orderBy` = "o primeiro de cada grupo", nenhuma agregação manual em JS
   * necessária para esta parte). */
  findLatestMaterialCostByProduct(productIds: string[]) {
    return db.productBatch.findMany({
      where: { productId: { in: productIds }, materialCost: { not: null } },
      orderBy: { producedAt: 'desc' },
      distinct: ['productId'],
      select: { productId: true, materialCost: true, producedAt: true },
    })
  }
}

export const stockValuationRepository = new StockValuationRepository()
