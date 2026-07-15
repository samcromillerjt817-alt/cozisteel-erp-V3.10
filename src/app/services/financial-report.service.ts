import { accountReceivableRepository } from '@/app/repositories/account-receivable.repository'
import { accountPayableRepository } from '@/app/repositories/account-payable.repository'
import { financialReportRepository } from '@/app/repositories/financial-report.repository'
import { stockValuationRepository } from '@/app/repositories/stock-valuation.repository'
import { stockValuationService, type StockValuationTotals } from '@/app/services/stock-valuation.service'

export interface AccountBalanceSummary {
  open: number // saldo em aberto (inclui vencido e a vencer)
  overdue: number // subconjunto de `open` já vencido e não quitado
}

export interface AccountBalances {
  receivable: AccountBalanceSummary
  payable: AccountBalanceSummary
}

export interface CashFlowBucket {
  date: string // YYYY-MM-DD
  receivable: number
  payable: number
  net: number
}

export interface GrossMarginEstimate {
  revenue: number
  estimatedCost: number
  grossMargin: number
  grossMarginPercent: number | null
  /** % da receita cujo produto tinha um `ProductBatch.materialCost` conhecido — abaixo de 100%
   * significa que parte da receita entrou no cálculo sem custo real (tratada como custo 0, nunca
   * como receita descartada) — ver nota na classe sobre a limitação estrutural. */
  costCoveragePercent: number
}

export interface MaterialCostHistoryPoint {
  batchNumber: string
  producedAt: Date
  materialCost: number
  quantityProduced: number
}

/**
 * Fase 12 (ADR-016, Subetapa 6) — agregações financeiras para consumo pelo Dashboard, por futuras
 * rotas de relatório, ou por qualquer outro consumidor — nenhum método aqui é específico de uma
 * tela. Reaproveita o que já existe em vez de duplicar: valorização de estoque delega inteiramente
 * para `StockValuationService` (Subetapa 5), nunca recalcula por conta própria.
 *
 * **Limitação estrutural, disclosed, não contornada por aproximação silenciosa**: não existe hoje
 * nenhum vínculo entre `SalesOrderItem` e o(s) `ProductBatch` que efetivamente atenderam aquela
 * venda — a mesma lacuna já identificada na Subetapa 5 para valorização de produto acabado. Por
 * isso `getGrossMarginEstimate()` é uma ESTIMATIVA agregada (receita real do período menos um custo
 * estimado via o `ProductBatch.materialCost` mais recente conhecido por produto, multiplicado pela
 * quantidade vendida), não uma margem calculada venda a venda. `costCoveragePercent` expõe
 * explicitamente que fração da receita teve custo conhecido, para o consumidor decidir se a
 * estimativa é confiável o suficiente para o que está mostrando. Modelar margem precisa por venda
 * exigiria uma nova relação de schema (qual lote de produção atendeu qual item vendido) — fora do
 * escopo desta subetapa, mesmo espírito da decisão já tomada para parcelamento/valorização por lote.
 */
class FinancialReportService {
  async getAccountBalances(): Promise<AccountBalances> {
    const now = new Date()
    const [receivables, payables] = await Promise.all([
      accountReceivableRepository.findOpenWithReceipts() as Promise<Array<{ amount: number; dueDate: Date; receipts: Array<{ amount: number }> }>>,
      accountPayableRepository.findOpenWithPayments() as Promise<Array<{ amount: number; dueDate: Date; payments: Array<{ amount: number }> }>>,
    ])

    const receivable = receivables.reduce(
      (acc, r) => {
        const outstanding = r.amount - r.receipts.reduce((sum, x) => sum + x.amount, 0)
        acc.open += outstanding
        if (r.dueDate < now) acc.overdue += outstanding
        return acc
      },
      { open: 0, overdue: 0 }
    )

    const payable = payables.reduce(
      (acc, p) => {
        const outstanding = p.amount - p.payments.reduce((sum, x) => sum + x.amount, 0)
        acc.open += outstanding
        if (p.dueDate < now) acc.overdue += outstanding
        return acc
      },
      { open: 0, overdue: 0 }
    )

    return { receivable, payable }
  }

  /** Agrupa o saldo em aberto de Contas a Pagar/Receber por dia de vencimento, dentro dos próximos
   * `daysAhead` dias — títulos já vencidos entram no primeiro bucket (hoje), nunca são omitidos. */
  async getProjectedCashFlow(daysAhead = 90): Promise<CashFlowBucket[]> {
    const now = new Date()
    const horizon = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000)
    const todayKey = now.toISOString().slice(0, 10)

    const [receivables, payables] = await Promise.all([
      accountReceivableRepository.findOpenWithReceipts() as Promise<Array<{ amount: number; dueDate: Date; receipts: Array<{ amount: number }> }>>,
      accountPayableRepository.findOpenWithPayments() as Promise<Array<{ amount: number; dueDate: Date; payments: Array<{ amount: number }> }>>,
    ])

    const buckets = new Map<string, { receivable: number; payable: number }>()
    const addTo = (dueDate: Date, outstanding: number, key: 'receivable' | 'payable') => {
      if (outstanding <= 0) return
      const bucketDate = dueDate < now ? todayKey : dueDate.toISOString().slice(0, 10)
      if (dueDate > horizon) return
      const bucket = buckets.get(bucketDate) ?? { receivable: 0, payable: 0 }
      bucket[key] += outstanding
      buckets.set(bucketDate, bucket)
    }

    for (const r of receivables) addTo(r.dueDate, r.amount - r.receipts.reduce((s, x) => s + x.amount, 0), 'receivable')
    for (const p of payables) addTo(p.dueDate, p.amount - p.payments.reduce((s, x) => s + x.amount, 0), 'payable')

    return Array.from(buckets.entries())
      .map(([date, v]) => ({ date, receivable: v.receivable, payable: v.payable, net: v.receivable - v.payable }))
      .sort((a, b) => a.date.localeCompare(b.date))
  }

  /** Nunca recalcula valorização por conta própria — delega inteiramente à `StockValuationService`
   * (Subetapa 5), a fonte única de verdade para esse dado. */
  async getStockValuation(): Promise<StockValuationTotals> {
    return stockValuationService.getTotalValuation()
  }

  async getGrossMarginEstimate(from: Date, to: Date): Promise<GrossMarginEstimate> {
    const items = await financialReportRepository.findSalesOrderItemsInPeriod(from, to)
    const productIds = Array.from(new Set(items.map((i) => i.productId).filter((id): id is string => id !== null)))
    const latestCosts = productIds.length > 0 ? await stockValuationRepository.findLatestMaterialCostByProduct(productIds) : []
    const costByProduct = new Map(latestCosts.map((c) => [c.productId, c.materialCost as number]))

    let revenue = 0
    let estimatedCost = 0
    let revenueWithKnownCost = 0
    for (const item of items) {
      revenue += item.total
      const unitCost = item.productId ? costByProduct.get(item.productId) : undefined
      if (unitCost !== undefined) {
        estimatedCost += unitCost * item.quantity
        revenueWithKnownCost += item.total
      }
    }

    const grossMargin = revenue - estimatedCost
    return {
      revenue,
      estimatedCost,
      grossMargin,
      grossMarginPercent: revenue > 0 ? (grossMargin / revenue) * 100 : null,
      costCoveragePercent: revenue > 0 ? (revenueWithKnownCost / revenue) * 100 : 0,
    }
  }

  async getMaterialCostHistory(productId: string): Promise<MaterialCostHistoryPoint[]> {
    const batches = await financialReportRepository.findMaterialCostHistory(productId)
    return batches.map((b) => ({
      batchNumber: b.batchNumber,
      producedAt: b.producedAt,
      materialCost: b.materialCost as number,
      quantityProduced: b.quantityProduced,
    }))
  }
}

export const financialReportService = new FinancialReportService()
