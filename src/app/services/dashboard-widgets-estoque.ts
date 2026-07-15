// Widgets reais do perfil Estoque (Fase 11, ADR-017, Subetapa 3) — mesmo padrão da Subetapa 2.

import { dashboardRepository } from '@/app/repositories/dashboard.repository'
import { registerWidget } from '@/app/services/dashboard-widgets.service'
import { stockValuationService } from '@/app/services/stock-valuation.service'
import { formatCurrency } from '@/lib/format'
import type { DashboardWidgetDTO } from '@/app/services/dashboard-types'

const EXPIRING_BATCH_HORIZON_DAYS = 30
// Severidade dos alertas (ADR-019, Subetapa 7.2, decisão do usuário) — cada um por regra própria:
// - lotes-vencendo: severidade pela PROXIMIDADE do vencimento, não pela contagem de lotes.
// - materiais-baixo-estoque: severidade pelo quanto abaixo do mínimo, como aproximação de risco
//   operacional. O schema de Material hoje não tem um campo de "criticidade"/"material essencial" —
//   essa é uma aproximação com o dado que já existe (stockQty/minStockQty), não uma substituição real
//   do conceito pedido pelo usuário; se o usuário quiser risco operacional de fato (materiais
//   essenciais críticos mesmo com pequena falta), isso exige um campo novo no schema, fora do escopo
//   desta subetapa — sinalizado, não decidido silenciosamente.
const BATCH_EXPIRING_CRITICAL_DAYS = 7
const MATERIAL_BAIXO_ESTOQUE_CRITICAL_RATIO = 0.5

registerWidget({
  id: 'estoque.saldo-atual',
  sourceProfiles: ['estoque'],
  expensive: false,
  compute: async (): Promise<DashboardWidgetDTO> => {
    const rows = await dashboardRepository.topMaterialsByStock(10)
    return {
      id: 'estoque.saldo-atual',
      type: 'table',
      title: 'Saldo atual por material (top 10)',
      order: 10,
      data: { columns: [{ key: 'name', label: 'Material' }, { key: 'stockQty', label: 'Saldo' }], rows: rows.map((r) => ({ name: r.name, stockQty: r.stockQty })) },
    }
  },
})

registerWidget({
  id: 'estoque.materiais-baixo-estoque',
  sourceProfiles: ['estoque'],
  expensive: false,
  compute: async (): Promise<DashboardWidgetDTO> => {
    const rows = await dashboardRepository.findLowStockMaterials()
    const count = rows.length
    const ratios = rows.map((r) => (r.minStockQty > 0 ? r.stockQty / r.minStockQty : r.stockQty > 0 ? 1 : 0))
    const minRatio = ratios.length > 0 ? Math.min(...ratios) : 1
    const severity = count === 0 ? 'info' : minRatio <= MATERIAL_BAIXO_ESTOQUE_CRITICAL_RATIO ? 'critical' : 'warning'
    return {
      id: 'estoque.materiais-baixo-estoque',
      type: 'alert',
      title: 'Materiais com estoque baixo',
      order: 20,
      data: {
        severity,
        count,
        message: count === 1 ? '1 material abaixo do estoque mínimo.' : `${count} materiais abaixo do estoque mínimo.`,
        linkToModule: 'estoque',
      },
    }
  },
})

registerWidget({
  id: 'estoque.reservado-a-caminho-em-producao',
  sourceProfiles: ['estoque'],
  expensive: false,
  compute: async (): Promise<DashboardWidgetDTO> => {
    const { materialTotals, productTotals } = await dashboardRepository.sumReservedOnOrderInProduction()
    return {
      id: 'estoque.reservado-a-caminho-em-producao',
      type: 'table',
      title: 'Reservado / a caminho / em produção',
      order: 30,
      data: {
        columns: [{ key: 'categoria', label: 'Categoria' }, { key: 'reservado', label: 'Reservado' }, { key: 'aCaminho', label: 'A caminho' }, { key: 'emProducao', label: 'Em produção' }],
        rows: [
          { categoria: 'Materiais', reservado: materialTotals.reservedQty || 0, aCaminho: materialTotals.onOrderQty || 0, emProducao: materialTotals.inProductionQty || 0 },
          { categoria: 'Produtos', reservado: productTotals.reservedQty || 0, aCaminho: productTotals.onOrderQty || 0, emProducao: productTotals.inProductionQty || 0 },
        ],
      },
    }
  },
})

registerWidget({
  id: 'estoque.movimentacoes-por-tipo',
  sourceProfiles: ['estoque'],
  expensive: false,
  compute: async (period): Promise<DashboardWidgetDTO> => {
    const groups = await dashboardRepository.countStockMovementsByType(period.from, period.to)
    return {
      id: 'estoque.movimentacoes-por-tipo',
      type: 'chart',
      title: 'Movimentações por tipo',
      order: 40,
      data: { chartType: 'bar', series: [{ label: 'Movimentações', data: groups.map((g) => ({ x: g.type, y: g._count.type })) }] },
    }
  },
})

registerWidget({
  id: 'estoque.materiais-mais-consumidos',
  sourceProfiles: ['estoque'],
  expensive: true,
  compute: async (period): Promise<DashboardWidgetDTO> => {
    const rows = await dashboardRepository.topConsumedMaterials(10, period.from, period.to)
    return {
      id: 'estoque.materiais-mais-consumidos',
      type: 'table',
      title: 'Materiais mais consumidos',
      order: 50,
      data: { columns: [{ key: 'materialName', label: 'Material' }, { key: 'quantity', label: 'Quantidade consumida' }], rows: rows.map((r) => ({ materialName: r.materialName, quantity: r.quantity })) },
    }
  },
})

registerWidget({
  id: 'estoque.lotes-vencendo',
  sourceProfiles: ['estoque'],
  expensive: false,
  compute: async (): Promise<DashboardWidgetDTO> => {
    const rows = await dashboardRepository.findExpiringBatches(EXPIRING_BATCH_HORIZON_DAYS)
    const now = new Date()
    const count = rows.length
    const minDaysUntilExpiry = count > 0 ? Math.min(...rows.map((r) => (r.expiresAt!.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))) : Infinity
    const severity = count === 0 ? 'info' : minDaysUntilExpiry <= BATCH_EXPIRING_CRITICAL_DAYS ? 'critical' : 'warning'
    return {
      id: 'estoque.lotes-vencendo',
      type: 'alert',
      title: 'Lotes próximos do vencimento',
      order: 60,
      data: {
        severity,
        count,
        message:
          count === 1
            ? `1 lote vencendo nos próximos ${EXPIRING_BATCH_HORIZON_DAYS} dias.`
            : `${count} lotes vencendo nos próximos ${EXPIRING_BATCH_HORIZON_DAYS} dias.`,
        linkToModule: 'estoque',
      },
    }
  },
})

registerWidget({
  id: 'estoque.saldo-valorizado-quantidade',
  sourceProfiles: ['estoque'],
  expensive: false,
  compute: async (): Promise<DashboardWidgetDTO> => {
    const total = await dashboardRepository.sumValorizedStockQuantity()
    return {
      id: 'estoque.saldo-valorizado-quantidade',
      type: 'card',
      title: 'Saldo valorizado em quantidade',
      order: 70,
      data: { value: total, hint: 'Só materiais com lote (lotControlled) — valorização em R$ depende do Financeiro (Fase 12)' },
    }
  },
})

registerWidget({
  id: 'estoque.ajustes-inventario',
  sourceProfiles: ['estoque'],
  expensive: false,
  compute: async (period): Promise<DashboardWidgetDTO> => {
    const count = await dashboardRepository.countStockAdjustments(period.from, period.to)
    return { id: 'estoque.ajustes-inventario', type: 'card', title: 'Ajustes de inventário', order: 80, data: { value: count } }
  },
})

// ADR-019, Subetapa 7.5 — resolve a lacuna que `estoque.saldo-valorizado-quantidade` já sinalizava no
// próprio hint ("valorização em R$ depende do Financeiro"): agora que `StockValuationService` (Fase 12,
// Subetapa 5) existe, delega 100% a ele — zero recálculo próprio, mesmo princípio de
// `financeiro.saldo-liquido-em-aberto`.
registerWidget({
  id: 'estoque.valor-total-estoque',
  sourceProfiles: ['estoque'],
  expensive: false,
  compute: async (): Promise<DashboardWidgetDTO> => {
    const valuation = await stockValuationService.getTotalValuation()
    return {
      id: 'estoque.valor-total-estoque',
      type: 'card',
      title: 'Valor total de estoque',
      order: 90,
      data: {
        value: valuation.total,
        format: 'currency',
        hint: `Matéria-prima: ${formatCurrency(valuation.rawMaterial)} · Produto acabado: ${formatCurrency(valuation.finishedGoods)}`,
      },
    }
  },
})
