// Widgets reais do perfil Produção/PCP (Fase 11, ADR-017, Subetapa 3) — mesmo padrão da Subetapa 2
// (Comercial): cada `id` já existe em dashboard-widget-catalog.ts, `registerWidget()` rejeitaria
// qualquer id fora do catálogo.

import { dashboardRepository } from '@/app/repositories/dashboard.repository'
import { registerWidget } from '@/app/services/dashboard-widgets.service'
import type { DashboardWidgetDTO } from '@/app/services/dashboard-types'

/** Converte "dd/mm/aaaa" (ProductionOrder.dueDate) — retorna null se o formato não bater (mesma limitação do ADR-007). */
function parseBrDate(value: string): Date | null {
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!match) return null
  return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]))
}

registerWidget({
  id: 'producao.ops-por-status',
  sourceProfiles: ['producao'],
  expensive: false,
  compute: async (period): Promise<DashboardWidgetDTO> => {
    const groups = await dashboardRepository.countProductionOrdersByStatus(period.from, period.to)
    return {
      id: 'producao.ops-por-status',
      type: 'chart',
      title: 'OPs por status',
      order: 10,
      data: { chartType: 'donut', series: [{ label: 'OPs', data: groups.map((g) => ({ x: g.status, y: g._count.status })) }] },
    }
  },
})

// Severidade do alerta (ADR-019, Subetapa 7.2, decisão do usuário): considera atraso E quantidade
// pendente, não só a contagem de OPs — um atraso curto numa OP grande pode ser tão crítico quanto
// um atraso longo numa OP pequena. Limiares ajustáveis conforme validação com o usuário.
const OPS_ATRASADAS_CRITICAL_DAYS = 7
const OPS_ATRASADAS_CRITICAL_QTY = 100

registerWidget({
  id: 'producao.ops-atrasadas',
  sourceProfiles: ['producao'],
  expensive: false,
  compute: async (): Promise<DashboardWidgetDTO> => {
    const openOrders = await dashboardRepository.findOpenProductionOrdersWithDueDate()
    const today = new Date()
    const overdue = openOrders
      .map((o) => ({ ...o, dueDate: parseBrDate(o.dueDate) }))
      .filter((o): o is typeof o & { dueDate: Date } => o.dueDate !== null && o.dueDate < today)
    const count = overdue.length
    const maxDaysLate = count > 0 ? Math.max(...overdue.map((o) => (today.getTime() - o.dueDate.getTime()) / (1000 * 60 * 60 * 24))) : 0
    const totalRemainingQty = overdue.reduce((sum, o) => sum + (o.quantity - o.quantityCompleted), 0)
    const severity =
      count === 0 ? 'info' : maxDaysLate >= OPS_ATRASADAS_CRITICAL_DAYS || totalRemainingQty >= OPS_ATRASADAS_CRITICAL_QTY ? 'critical' : 'warning'
    return {
      id: 'producao.ops-atrasadas',
      type: 'alert',
      title: 'OPs atrasadas',
      order: 20,
      data: {
        severity,
        count,
        message: count === 1 ? `1 OP atrasada, ${totalRemainingQty} unidades pendentes.` : `${count} OPs atrasadas, ${totalRemainingQty} unidades pendentes.`,
        linkToModule: 'producao',
      },
    }
  },
})

registerWidget({
  id: 'producao.wip-total',
  sourceProfiles: ['producao'],
  expensive: false,
  compute: async (): Promise<DashboardWidgetDTO> => {
    const orders = await dashboardRepository.findInProgressProductionOrders()
    const wip = orders.reduce((sum, o) => sum + (o.quantity - o.quantityCompleted), 0)
    return { id: 'producao.wip-total', type: 'card', title: 'WIP (quantidade em produção)', order: 30, data: { value: wip } }
  },
})

registerWidget({
  id: 'producao.backlog-por-produto',
  sourceProfiles: ['producao'],
  expensive: true,
  compute: async (): Promise<DashboardWidgetDTO> => {
    const rows = await dashboardRepository.findOpenProductionOrdersByProduct()
    const byProduct = new Map<string, number>()
    for (const row of rows) {
      byProduct.set(row.productName, (byProduct.get(row.productName) || 0) + row.remaining)
    }
    return {
      id: 'producao.backlog-por-produto',
      type: 'table',
      title: 'Backlog de produção por produto',
      order: 40,
      data: { columns: [{ key: 'productName', label: 'Produto' }, { key: 'remaining', label: 'Quantidade restante' }], rows: Array.from(byProduct.entries()).map(([productName, remaining]) => ({ productName, remaining })) },
    }
  },
})

registerWidget({
  id: 'producao.ops-por-prioridade',
  sourceProfiles: ['producao'],
  expensive: false,
  compute: async (period): Promise<DashboardWidgetDTO> => {
    const groups = await dashboardRepository.countProductionOrdersByPriority(period.from, period.to)
    return {
      id: 'producao.ops-por-prioridade',
      type: 'chart',
      title: 'OPs por prioridade',
      order: 50,
      data: { chartType: 'bar', series: [{ label: 'OPs', data: groups.map((g) => ({ x: g.priority, y: g._count.priority })) }] },
    }
  },
})

registerWidget({
  id: 'producao.rodadas-parciais-por-op',
  sourceProfiles: ['producao'],
  expensive: false,
  compute: async (period): Promise<DashboardWidgetDTO> => {
    const rows = await dashboardRepository.countExecutionsByProductionOrder(period.from, period.to)
    return {
      id: 'producao.rodadas-parciais-por-op',
      type: 'table',
      title: 'Rodadas de produção parcial por OP',
      order: 60,
      data: { columns: [{ key: 'number', label: 'OP' }, { key: 'rounds', label: 'Rodadas' }], rows: rows.map((r) => ({ number: r.number, rounds: r.rounds })) },
    }
  },
})

// Severidade do alerta (ADR-019, Subetapa 7.2, decisão do usuário): shortfall de reserva bloqueia
// diretamente a produção, então a severidade escala com a fração do necessário que está em falta
// (não com a contagem de reservas). Limiar ajustável conforme validação com o usuário.
const RESERVA_SHORTFALL_CRITICAL_RATIO = 0.2

registerWidget({
  id: 'producao.cobertura-reserva',
  sourceProfiles: ['producao'],
  expensive: false,
  compute: async (): Promise<DashboardWidgetDTO> => {
    const rows = await dashboardRepository.findActivePartialReservations()
    const count = rows.length
    const totalNeeded = rows.reduce((sum, r) => sum + r.quantityNeeded, 0)
    const totalShortfall = rows.reduce((sum, r) => sum + r.quantityShortfall, 0)
    const shortfallRatio = totalNeeded > 0 ? totalShortfall / totalNeeded : 0
    const severity = count === 0 ? 'info' : shortfallRatio >= RESERVA_SHORTFALL_CRITICAL_RATIO ? 'critical' : 'warning'
    return {
      id: 'producao.cobertura-reserva',
      type: 'alert',
      title: 'Cobertura de reserva',
      order: 70,
      data: {
        severity,
        count,
        message:
          count === 1
            ? `1 reserva com cobertura parcial (${Math.round(shortfallRatio * 100)}% em falta).`
            : `${count} reservas com cobertura parcial (${Math.round(shortfallRatio * 100)}% em falta).`,
        linkToModule: 'requisicoes',
      },
    }
  },
})

// Severidade do alerta (ADR-019, Subetapa 7.2, decisão do usuário): escala com a fração pendente do
// total, não só a contagem — um backlog pequeno mas concentrado (a maioria das sugestões ainda sem
// decisão) pesa mais que um backlog grande diluído num total muito maior. Limiar ajustável. Ignora
// o filtro de período: sugestão pendente antiga é MAIS urgente, não menos, diferente de indicadores
// de tendência histórica.
const MRP_PENDENTE_CRITICAL_RATIO = 0.5

registerWidget({
  id: 'producao.sugestoes-mrp-por-status',
  sourceProfiles: ['producao'],
  expensive: false,
  compute: async (): Promise<DashboardWidgetDTO> => {
    const groups = await dashboardRepository.countMrpSuggestionsByStatus()
    const pendingCount = groups.find((g) => g.status === 'pending')?._count.status || 0
    const totalCount = groups.reduce((sum, g) => sum + g._count.status, 0)
    const pendingRatio = totalCount > 0 ? pendingCount / totalCount : 0
    const severity = pendingCount === 0 ? 'info' : pendingRatio > MRP_PENDENTE_CRITICAL_RATIO ? 'critical' : 'warning'
    return {
      id: 'producao.sugestoes-mrp-por-status',
      type: 'alert',
      title: 'Sugestões MRP pendentes',
      order: 80,
      data: {
        severity,
        count: pendingCount,
        message: pendingCount === 1 ? '1 sugestão de MRP aguardando decisão.' : `${pendingCount} sugestões de MRP aguardando decisão.`,
        linkToModule: 'producao',
      },
    }
  },
})

registerWidget({
  id: 'producao.mrp-compra-vs-producao',
  sourceProfiles: ['producao'],
  expensive: false,
  compute: async (period): Promise<DashboardWidgetDTO> => {
    const groups = await dashboardRepository.countMrpSuggestionsByType(period.from, period.to)
    return {
      id: 'producao.mrp-compra-vs-producao',
      type: 'chart',
      title: 'Proporção compra vs. produção (MRP)',
      order: 90,
      data: { chartType: 'donut', series: [{ label: 'Sugestões', data: groups.map((g) => ({ x: g.suggestionType, y: g._count.suggestionType })) }] },
    }
  },
})

registerWidget({
  id: 'producao.resumo-ultima-execucao-mrp',
  sourceProfiles: ['producao'],
  expensive: false,
  compute: async (): Promise<DashboardWidgetDTO> => {
    const run = await dashboardRepository.findLatestMrpRun()
    return {
      id: 'producao.resumo-ultima-execucao-mrp',
      type: 'table',
      title: 'Resumo da última execução MRP',
      order: 100,
      data: {
        columns: [{ key: 'metric', label: 'Métrica' }, { key: 'value', label: 'Valor' }],
        rows: run
          ? [
              { metric: 'OPs consideradas', value: run.openOrdersConsidered },
              { metric: 'Total de sugestões', value: run.totalSuggestions },
              { metric: 'Sugestões de compra', value: run.totalPurchaseSuggestions },
              { metric: 'Sugestões de produção', value: run.totalProductionSuggestions },
            ]
          : [],
      },
    }
  },
})

registerWidget({
  id: 'producao.volume-lotes-por-periodo',
  sourceProfiles: ['producao'],
  expensive: false,
  compute: async (period): Promise<DashboardWidgetDTO> => {
    const { materialReceived, productProduced } = await dashboardRepository.sumBatchVolumeInPeriod(period.from, period.to)
    return {
      id: 'producao.volume-lotes-por-periodo',
      type: 'chart',
      title: 'Volume de matéria-prima recebida / produto produzido',
      order: 110,
      data: { chartType: 'bar', series: [{ label: 'Volume', data: [{ x: 'Matéria-prima recebida', y: materialReceived }, { x: 'Produto produzido', y: productProduced }] }] },
    }
  },
})

registerWidget({
  id: 'producao.adocao-lote',
  sourceProfiles: ['producao'],
  expensive: false,
  compute: async (): Promise<DashboardWidgetDTO> => {
    const adoption = await dashboardRepository.countLotControlledAdoption()
    return {
      id: 'producao.adocao-lote',
      type: 'table',
      title: 'Adoção de lote (lotControlled)',
      order: 120,
      data: {
        columns: [{ key: 'categoria', label: 'Categoria' }, { key: 'comLote', label: 'Com controle de lote' }, { key: 'total', label: 'Total' }],
        rows: [
          { categoria: 'Materiais', comLote: adoption.materialsLotControlled, total: adoption.materialsTotal },
          { categoria: 'Produtos', comLote: adoption.productsLotControlled, total: adoption.productsTotal },
        ],
      },
    }
  },
})

registerWidget({
  id: 'producao.bom-revisoes-pendentes',
  sourceProfiles: ['producao'],
  expensive: false,
  compute: async (): Promise<DashboardWidgetDTO> => {
    const groups = await dashboardRepository.countBomRevisionsByStatus()
    return {
      id: 'producao.bom-revisoes-pendentes',
      type: 'chart',
      title: 'Revisões de BOM por status',
      order: 130,
      data: { chartType: 'donut', series: [{ label: 'Revisões', data: groups.map((g) => ({ x: g.status, y: g._count.status })) }] },
    }
  },
})
