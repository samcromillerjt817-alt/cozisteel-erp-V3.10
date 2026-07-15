import { bomRevisionRepository } from '@/app/repositories/bom-revision.repository'
import { bomExplosionService, type BomExplosionResult } from '@/app/services/bom-explosion.service'

export interface ReconciliationConsumptionLine {
  lineType: string
  materialId: string | null
  componentProductId: string | null
  quantity: number
  scrapPct: number
}

function mergeInto(target: Map<string, number>, key: string, qty: number): void {
  target.set(key, (target.get(key) || 0) + qty)
}

function mergeAllInto(target: Map<string, number>, source: Map<string, number>): void {
  for (const [key, qty] of source) mergeInto(target, key, qty)
}

/**
 * Reconciliação de Reserva multinível (ADR-012, pós-Fase 9): a Reserva (ADR-006) explode a BOM
 * multinível e nunca cria uma `MaterialReservation` para um subconjunto com revisão própria (só
 * para o que está abaixo dele). O Consumo físico (ADR-011) opera um nível só, de propósito. Este
 * serviço resolve a reconciliação entre os dois: dado o que uma rodada de produção consumiu
 * fisicamente (um nível), identifica as reservas reais (de qualquer profundidade) que isso cobre.
 *
 * Puramente computacional — nenhuma leitura de `MaterialReservation`, nenhuma transação, nenhuma
 * escrita no banco. Reaproveita o MESMO motor de explosão que a Reserva usa (`bomExplosionService`)
 * como fonte única de verdade: uma mudança futura na lógica de explosão afeta os dois usos
 * automaticamente, sem duplicar a travessia da árvore.
 */
class ReservationReconciliationService {
  /**
   * `lines` são as mesmas linhas de consumo físico que o chamador já resolveu (um nível, raiz
   * congelada — `resolveConsumptionLines()` em `production-order.service.ts`). Para cada linha:
   *  - "material", ou "component" sem revisão própria → folha: o mesmo item que a Reserva já
   *    reservou diretamente, entra no resultado com a quantidade consumida nesta rodada.
   *  - "component" com revisão própria (subconjunto fabricável) → a Reserva nunca criou uma linha
   *    para ele (ela o atravessa, flatten). Reexplode a partir dele, pela revisão ATIVA agora do
   *    subconjunto — mesmo comportamento que a Reserva já tem para níveis abaixo da raiz (ADR-006:
   *    só a raiz é congelada; subníveis sempre resolvem a revisão ativa no momento da chamada) —
   *    e mescla os materiais/produtos-folha resultantes no total desta rodada.
   */
  async resolveReleaseTargets(
    lines: ReconciliationConsumptionLine[],
    quantityThisRound: number
  ): Promise<BomExplosionResult> {
    const result: BomExplosionResult = { materialNeeds: new Map(), productNeeds: new Map() }

    for (const line of lines) {
      const consumedQty = line.quantity * quantityThisRound * (1 + line.scrapPct / 100)
      if (consumedQty <= 0) continue

      if (line.lineType === 'material') {
        mergeInto(result.materialNeeds, line.materialId as string, consumedQty)
        continue
      }

      const componentId = line.componentProductId as string
      const ownRevision = (await bomRevisionRepository.findActiveByProduct(componentId)) as { id: string } | null

      if (!ownRevision) {
        // Componente sem revisão própria (comprado/terceirizado) — folha, igual à Reserva.
        mergeInto(result.productNeeds, componentId, consumedQty)
        continue
      }

      // Subconjunto fabricável: a Reserva nunca reservou ELE, reservou o que está ABAIXO dele.
      const sub = await bomExplosionService.explode(componentId, consumedQty)
      mergeAllInto(result.materialNeeds, sub.materialNeeds)
      mergeAllInto(result.productNeeds, sub.productNeeds)
    }

    return result
  }
}

export const reservationReconciliationService = new ReservationReconciliationService()
