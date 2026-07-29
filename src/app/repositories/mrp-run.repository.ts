import { db } from '@/lib/db'
import { BaseRepository } from './base.repository'
import type { MrpCalculationResult } from '@/app/services/mrp-calculation.service'

const DETAIL_INCLUDE = {
  suggestions: { include: { sources: true } },
}

/** dd/mm/aaaa → Date — mesmo padrão duplicado em `mrp-calculation.service.ts` (nenhum utilitário
 * compartilhado existe hoje pra isso; ver o comentário lá pra justificativa). */
function parseBrDate(d: string | null): Date | null {
  if (!d) return null
  const m = d.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!m) return null
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]))
}

class MrpRunRepository extends BaseRepository<typeof db.mrpRun> {
  constructor() {
    super(db.mrpRun)
  }

  findByIdDetailed(id: string) {
    return this.delegate.findUnique({ where: { id }, include: DETAIL_INCLUDE })
  }

  /**
   * Grava o resultado de uma execução do MRP (Fase 6, Subetapa 3, ADR-007) numa única transação —
   * `MrpRun` já nasce com o resumo completo (nenhum campo é lido do cálculo depois de gravado),
   * seguido de uma `MrpSuggestion` por item e uma `MrpSuggestionSource` por OP contribuinte daquele
   * item. Qualquer falha no meio desfaz tudo, inclusive o `MrpRun` — não existe execução "parcial".
   */
  async persist(number: string, userId: string, calculation: MrpCalculationResult) {
    return db.$transaction(async (tx) => {
      const totalPurchaseSuggestions = calculation.suggestions.filter((s) => s.suggestionType === 'purchase').length
      const totalProductionSuggestions = calculation.suggestions.filter((s) => s.suggestionType === 'production').length

      const run = await tx.mrpRun.create({
        data: {
          number,
          userId,
          openOrdersConsidered: calculation.openOrdersConsidered,
          totalSuggestions: calculation.suggestions.length,
          totalPurchaseSuggestions,
          totalProductionSuggestions,
        },
      })

      for (const suggestion of calculation.suggestions) {
        const created = await tx.mrpSuggestion.create({
          data: {
            mrpRunId: run.id,
            suggestionType: suggestion.suggestionType,
            itemType: suggestion.itemType,
            materialId: suggestion.materialId,
            productId: suggestion.productId,
            quantityNeeded: suggestion.quantityNeeded,
            quantityAvailable: suggestion.quantityAvailable,
            quantityReserved: suggestion.quantityReserved,
            quantityShortfall: suggestion.quantityShortfall,
            productTypeSnapshot: suggestion.productTypeSnapshot,
            supplierId: suggestion.supplierId,
            supplierNameSnapshot: suggestion.supplierNameSnapshot,
            minStockQty: suggestion.minStockQty,
            leadTimeDays: suggestion.leadTimeDays,
            neededByDate: parseBrDate(suggestion.neededByDate),
            suggestedOrderByDate: parseBrDate(suggestion.suggestedOrderByDate),
            isLate: suggestion.isLate,
          },
        })

        if (suggestion.sources.length > 0) {
          await tx.mrpSuggestionSource.createMany({
            data: suggestion.sources.map((source) => ({
              mrpSuggestionId: created.id,
              productionOrderId: source.productionOrderId,
              contributedQuantity: source.quantity,
            })),
          })
        }
      }

      return tx.mrpRun.findUnique({ where: { id: run.id }, include: DETAIL_INCLUDE })
    })
  }
}

export const mrpRunRepository = new MrpRunRepository()
