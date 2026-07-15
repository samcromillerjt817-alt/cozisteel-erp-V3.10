import { db } from '@/lib/db'
import { BaseRepository } from './base.repository'

/**
 * Fase 12 (ADR-016, Subetapa 1/2) — primeira escrita própria em `ProductBatch` fora da transação de
 * `produce()` (`production-order.repository.ts`). Escopo mínimo de propósito: só a atualização do
 * custo real calculado pela `CostingService`, nunca criação/leitura de árvore (isso continua em
 * `batch-traceability.repository.ts`, que se mantém somente-leitura).
 */
class ProductBatchRepository extends BaseRepository<typeof db.productBatch> {
  constructor() {
    super(db.productBatch)
  }

  updateMaterialCost(id: string, materialCost: number) {
    return this.delegate.update({ where: { id }, data: { materialCost } })
  }
}

export const productBatchRepository = new ProductBatchRepository()
