import { productBatchRepository } from '@/app/repositories/product-batch.repository'
import { batchTraceabilityService } from '@/app/services/batch-traceability.service'
import { settingService } from '@/app/services/setting.service'

/**
 * Fase 12 (ADR-016, Subetapa 1/2 + ADR-020, Subetapa 8) — custeio real por lote (decisão pendente #3
 * resolvida: modelo (c), não (a) padrão nem (b) médio ponderado). Reaproveita a árvore de
 * rastreabilidade já construída pela Fase 10 (`batchTraceabilityService.traceBackward()`), sem
 * recalcular nada que já existe: `materialOrigins` já vem achatado por toda a árvore de consumo
 * (direto + através de subconjuntos com lote próprio), então somar `unitCost × quantityConsumed`
 * sobre esse array único já é o custo real de material de TODA a origem, não só do primeiro nível.
 *
 * Mão de obra/overhead (ADR-020) são custo PADRÃO, não real — tempo padrão da BomRevision congelada
 * × taxa configurável, nunca apontamento manual (decisão resolvida, ver ADR-020 Parte 5).
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

  /** Calcula e persiste `ProductBatch.laborCost`/`overheadCost` (ADR-020) — chamado pelo mesmo
   * handler de eventos, sempre DEPOIS de `calculateAndPersistMaterialCost` (overhead precisa do
   * `materialCost` já persistido). `null`/`null` quando a OP não tem `bomRevisionId` (produção sem
   * engenharia formal) — sem estrutura, não há tempo padrão de operação pra somar. Idempotente pelo
   * mesmo motivo do custo de material: `ProductOperation`/taxas configuradas não mudam retroativamente
   * o que já foi persistido, só uma nova chamada explícita recalcula. */
  async calculateAndPersistLaborAndOverheadCost(productBatchId: string): Promise<{ laborCost: number | null; overheadCost: number | null }> {
    const batch = await productBatchRepository.findByIdWithBomRevision(productBatchId)
    if (!batch) throw new Error('Lote de produção não encontrado')

    const bomRevision = batch.productionOrder.bomRevision
    if (!batch.productionOrder.bomRevisionId || !bomRevision) {
      await productBatchRepository.updateLaborAndOverheadCost(productBatchId, null, null)
      return { laborCost: null, overheadCost: null }
    }

    const standardMinutes = bomRevision.operations.reduce(
      (sum, op) => sum + op.setupTimeMinutes + op.runTimeMinutesPerUnit * batch.quantityProduced,
      0
    )
    const laborRatePerHour = await settingService.getNumber('custeio.laborRatePerHour', 0)
    const laborCost = (standardMinutes / 60) * laborRatePerHour

    const overheadPercent = await settingService.getNumber('custeio.overheadPercent', 0)
    const overheadCost = (batch.materialCost ?? 0) * (overheadPercent / 100)

    await productBatchRepository.updateLaborAndOverheadCost(productBatchId, laborCost, overheadCost)
    return { laborCost, overheadCost }
  }
}

export const costingService = new CostingService()
