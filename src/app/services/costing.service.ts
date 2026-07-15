import { productBatchRepository } from '@/app/repositories/product-batch.repository'
import { batchTraceabilityService } from '@/app/services/batch-traceability.service'

/**
 * Fase 12 (ADR-016, Subetapa 1/2) — custeio real por lote (decisão pendente #3 resolvida: modelo
 * (c), não (a) padrão nem (b) médio ponderado). Reaproveita a árvore de rastreabilidade já
 * construída pela Fase 10 (`batchTraceabilityService.traceBackward()`), sem recalcular nada que já
 * existe: `materialOrigins` já vem achatado por toda a árvore de consumo (direto + através de
 * subconjuntos com lote próprio), então somar `unitCost × quantityConsumed` sobre esse array único
 * já é o custo real de material de TODA a origem, não só do primeiro nível.
 *
 * Escopo desta subetapa (decisão pendente #4 resolvida): só custo de MATERIAL. Mão de obra/overhead
 * ficam fora — nenhuma tentativa de estimar/ratear aqui, seria especulação sem dado bruto (ver ADR-016
 * Parte 2.3).
 */
class CostingService {
  /** Calcula e persiste `ProductBatch.materialCost` — chamado pelo handler dos eventos de produção
   * (`ordem_producao.finalizada`/`producao.parcial_realizada`), nunca direto de uma rota (sem UI
   * ainda, Subetapa 7). Idempotente: recalcular o mesmo lote sempre produz o mesmo resultado, já que
   * a árvore de `BatchConsumption` é imutável depois de criada. */
  async calculateAndPersistMaterialCost(productBatchId: string): Promise<number> {
    const { materialOrigins } = await batchTraceabilityService.traceBackward(productBatchId)
    const materialCost = materialOrigins.reduce((sum, o) => sum + o.materialBatch.unitCost * o.edge.quantityConsumed, 0)
    await productBatchRepository.updateMaterialCost(productBatchId, materialCost)
    return materialCost
  }
}

export const costingService = new CostingService()
