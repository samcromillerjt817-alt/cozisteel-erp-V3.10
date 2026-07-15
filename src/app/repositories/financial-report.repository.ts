import { db } from '@/lib/db'

/**
 * Fase 12 (ADR-016, Subetapa 6) — leituras específicas de `FinancialReportService` que não
 * pertencem a nenhum repository de entidade já existente (margem agregada, histórico de custo por
 * produto). Saldo/fluxo de caixa reaproveitam `AccountReceivableRepository.findOpenWithReceipts()`/
 * `AccountPayableRepository.findOpenWithPayments()` — não duplicados aqui.
 */
class FinancialReportRepository {
  /** Itens de Pedido de Venda faturáveis num período — base para a estimativa de margem bruta. */
  findSalesOrderItemsInPeriod(from: Date, to: Date) {
    return db.salesOrderItem.findMany({
      where: { salesOrder: { createdAt: { gte: from, lte: to }, status: { not: 'cancelled' } } },
      select: { productId: true, quantity: true, total: true },
    })
  }

  /** Série histórica de custo real de material por lote de um produto — `ProductBatch.materialCost`
   * já é o fato imutável (Subetapa 2), aqui só ordenamos por data de produção. */
  findMaterialCostHistory(productId: string) {
    return db.productBatch.findMany({
      where: { productId, materialCost: { not: null } },
      orderBy: { producedAt: 'asc' },
      select: { batchNumber: true, producedAt: true, materialCost: true, quantityProduced: true },
    })
  }
}

export const financialReportRepository = new FinancialReportRepository()
