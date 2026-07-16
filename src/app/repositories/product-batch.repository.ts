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

  /** Fase 12, ADR-020, Subetapa 8 — custo padrão de mão de obra/overhead, mesmo padrão de
   * `updateMaterialCost`: escrita isolada, chamada só pela `CostingService`. */
  updateLaborAndOverheadCost(id: string, laborCost: number | null, overheadCost: number | null) {
    return this.delegate.update({ where: { id }, data: { laborCost, overheadCost } })
  }

  /** Necessário pro cálculo de mão de obra: precisa da `ProductionOrder.bomRevisionId` (revisão
   * congelada na origem) para somar o tempo padrão das `ProductOperation` daquela revisão. */
  findByIdWithBomRevision(id: string) {
    return this.delegate.findUnique({
      where: { id },
      include: {
        productionOrder: {
          select: {
            bomRevisionId: true,
            bomRevision: { select: { operations: { select: { setupTimeMinutes: true, runTimeMinutesPerUnit: true } } } },
          },
        },
      },
    })
  }
}

export const productBatchRepository = new ProductBatchRepository()
