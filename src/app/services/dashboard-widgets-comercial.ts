// Widgets reais do perfil Comercial (Fase 11, ADR-017, Subetapa 2) — cada `id` corresponde a uma
// entrada já registrada em dashboard-widget-catalog.ts; `registerWidget()` rejeitaria qualquer id que
// não estivesse lá. Import por efeito colateral em dashboard-widgets.service.ts garante que este
// arquivo é carregado (e os widgets registrados) antes de qualquer `getDashboard()`.

import { dashboardRepository } from '@/app/repositories/dashboard.repository'
import { registerWidget } from '@/app/services/dashboard-widgets.service'
import type { DashboardPeriod, DashboardWidgetDTO } from '@/app/services/dashboard-types'

/** Converte "dd/mm/aaaa" (formato de data de negócio usado em Quote.validUntil) — retorna null se o formato não bater. */
function parseBrDate(value: string): Date | null {
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!match) return null
  return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]))
}

function avgDaysBetween(pairs: { start: Date; end: Date }[]): number | null {
  if (pairs.length === 0) return null
  const totalMs = pairs.reduce((sum, p) => sum + (p.end.getTime() - p.start.getTime()), 0)
  const avgMs = totalMs / pairs.length
  return Math.round((avgMs / (1000 * 60 * 60 * 24)) * 10) / 10
}

registerWidget({
  id: 'comercial.orcamentos-por-status',
  sourceProfiles: ['comercial'],
  expensive: false,
  compute: async (period: DashboardPeriod): Promise<DashboardWidgetDTO> => {
    const groups = await dashboardRepository.countQuotesByStatus(period.from, period.to)
    return {
      id: 'comercial.orcamentos-por-status',
      type: 'chart',
      title: 'Orçamentos por status',
      order: 10,
      data: { chartType: 'donut', series: [{ label: 'Orçamentos', data: groups.map((g) => ({ x: g.status, y: g._count.status })) }] },
    }
  },
})

registerWidget({
  id: 'comercial.pedidos-por-status',
  sourceProfiles: ['comercial'],
  expensive: false,
  compute: async (period): Promise<DashboardWidgetDTO> => {
    const groups = await dashboardRepository.countSalesOrdersByStatus(period.from, period.to)
    return {
      id: 'comercial.pedidos-por-status',
      type: 'chart',
      title: 'Pedidos de venda por status',
      order: 20,
      data: { chartType: 'donut', series: [{ label: 'Pedidos', data: groups.map((g) => ({ x: g.status, y: g._count.status })) }] },
    }
  },
})

registerWidget({
  id: 'comercial.valor-aprovado-por-periodo',
  sourceProfiles: ['comercial'],
  expensive: false,
  compute: async (period): Promise<DashboardWidgetDTO> => {
    const result = await dashboardRepository.sumApprovedQuoteValue(period.from, period.to)
    return {
      id: 'comercial.valor-aprovado-por-periodo',
      type: 'card',
      title: 'Valor aprovado em orçamentos',
      order: 30,
      data: { value: result._sum.total || 0, format: 'currency', hint: 'Valor negociado aprovado — não é receita reconhecida (depende do Financeiro, Fase 12)' },
    }
  },
})

registerWidget({
  id: 'comercial.taxa-conversao',
  sourceProfiles: ['comercial'],
  expensive: false,
  compute: async (period): Promise<DashboardWidgetDTO> => {
    const [approvedResult, salesOrders] = await Promise.all([
      dashboardRepository.sumApprovedQuoteValue(period.from, period.to),
      dashboardRepository.countSalesOrdersInPeriod(period.from, period.to),
    ])
    const approvedCount = approvedResult._count._all
    const conversionRate = approvedCount > 0 ? Math.round((salesOrders._count._all / approvedCount) * 1000) / 10 : 0
    return {
      id: 'comercial.taxa-conversao',
      type: 'card',
      title: 'Taxa de conversão Orçamento → Pedido',
      order: 40,
      data: { value: `${conversionRate}%`, hint: `${salesOrders._count._all} de ${approvedCount} orçamentos aprovados` },
    }
  },
})

registerWidget({
  id: 'comercial.ticket-medio',
  sourceProfiles: ['comercial'],
  expensive: false,
  compute: async (period): Promise<DashboardWidgetDTO> => {
    const [approvedResult, salesOrders] = await Promise.all([
      dashboardRepository.sumApprovedQuoteValue(period.from, period.to),
      dashboardRepository.countSalesOrdersInPeriod(period.from, period.to),
    ])
    return {
      id: 'comercial.ticket-medio',
      type: 'card',
      title: 'Ticket médio',
      order: 50,
      data: { value: salesOrders._avg.total || approvedResult._avg.total || 0, format: 'currency', hint: 'Pedido de Venda quando existir, senão Orçamento aprovado' },
    }
  },
})

registerWidget({
  id: 'comercial.top-clientes',
  sourceProfiles: ['comercial'],
  expensive: true,
  compute: async (period): Promise<DashboardWidgetDTO> => {
    const rows = await dashboardRepository.topClientsBySalesOrderValue(10, period.from, period.to)
    return {
      id: 'comercial.top-clientes',
      type: 'table',
      title: 'Top clientes por valor',
      order: 60,
      data: {
        columns: [{ key: 'clientName', label: 'Cliente' }, { key: 'total', label: 'Valor total' }],
        rows: rows.map((r) => ({ clientName: r.clientName, total: r.total })),
      },
    }
  },
})

registerWidget({
  id: 'comercial.top-produtos',
  sourceProfiles: ['comercial'],
  expensive: true,
  compute: async (period): Promise<DashboardWidgetDTO> => {
    const rows = await dashboardRepository.topProductsBySalesOrderItems(10, period.from, period.to)
    return {
      id: 'comercial.top-produtos',
      type: 'table',
      title: 'Top produtos mais vendidos',
      order: 70,
      data: {
        columns: [{ key: 'productName', label: 'Produto' }, { key: 'quantity', label: 'Quantidade' }, { key: 'total', label: 'Valor total' }],
        rows: rows.map((r) => ({ productName: r.productName, quantity: r.quantity, total: r.total })),
      },
    }
  },
})

registerWidget({
  id: 'comercial.clientes-produtos-ativos',
  sourceProfiles: ['comercial'],
  expensive: false,
  compute: async (): Promise<DashboardWidgetDTO> => {
    const counts = await dashboardRepository.countActiveClientsAndProducts()
    return {
      id: 'comercial.clientes-produtos-ativos',
      type: 'table',
      title: 'Clientes/produtos ativos vs. inativos',
      order: 80,
      data: {
        columns: [{ key: 'categoria', label: 'Categoria' }, { key: 'ativos', label: 'Ativos' }, { key: 'inativos', label: 'Inativos' }],
        rows: [
          { categoria: 'Clientes', ativos: counts.activeClients, inativos: counts.inactiveClients },
          { categoria: 'Produtos', ativos: counts.activeProducts, inativos: counts.inactiveProducts },
        ],
      },
    }
  },
})

// Severidade do alerta (ADR-019, Subetapa 7.2, decisão do usuário): não é a contagem que decide —
// é o quanto o orçamento já passou da validade. Acima do limiar, o orçamento provavelmente perdeu a
// janela comercial (preço/condições desatualizados); ajustável conforme validação com o usuário.
const ORCAMENTO_VENCIDO_CRITICAL_DAYS = 15

registerWidget({
  id: 'comercial.orcamentos-vencidos',
  sourceProfiles: ['comercial'],
  expensive: true,
  compute: async (): Promise<DashboardWidgetDTO> => {
    const openQuotes = await dashboardRepository.findOpenQuotesWithValidUntil()
    const today = new Date()
    const daysOverdueList = openQuotes
      .map((q) => parseBrDate(q.validUntil))
      .filter((validUntil): validUntil is Date => validUntil !== null && validUntil < today)
      .map((validUntil) => (today.getTime() - validUntil.getTime()) / (1000 * 60 * 60 * 24))
    const count = daysOverdueList.length
    const maxDaysOverdue = count > 0 ? Math.max(...daysOverdueList) : 0
    const severity = count === 0 ? 'info' : maxDaysOverdue > ORCAMENTO_VENCIDO_CRITICAL_DAYS ? 'critical' : 'warning'
    return {
      id: 'comercial.orcamentos-vencidos',
      type: 'alert',
      title: 'Orçamentos vencidos',
      order: 90,
      data: {
        severity,
        count,
        message: count === 1 ? '1 orçamento vencido aguardando revisão.' : `${count} orçamentos vencidos aguardando revisão.`,
        linkToModule: 'orcamentos',
      },
    }
  },
})

registerWidget({
  id: 'comercial.tempo-criacao-aprovacao',
  sourceProfiles: ['comercial'],
  expensive: true,
  compute: async (period): Promise<DashboardWidgetDTO> => {
    const timings = await dashboardRepository.findApprovedQuoteTimings(period.from, period.to)
    const avgDays = avgDaysBetween(timings.map((t) => ({ start: t.createdAt, end: t.approvedAt! })))
    return {
      id: 'comercial.tempo-criacao-aprovacao',
      type: 'card',
      title: 'Tempo médio criação → aprovação',
      order: 100,
      data: { value: avgDays !== null ? `${avgDays} dias` : '—', hint: `${timings.length} orçamentos aprovados` },
    }
  },
})

registerWidget({
  id: 'comercial.tempo-aprovacao-conversao',
  sourceProfiles: ['comercial'],
  expensive: true,
  compute: async (period): Promise<DashboardWidgetDTO> => {
    const timings = await dashboardRepository.findQuoteToSalesOrderTimings(period.from, period.to)
    const avgDays = avgDaysBetween(timings.map((t) => ({ start: t.quoteApprovedAt, end: t.salesOrderCreatedAt })))
    return {
      id: 'comercial.tempo-aprovacao-conversao',
      type: 'card',
      title: 'Tempo médio aprovação → conversão em Pedido',
      order: 110,
      data: { value: avgDays !== null ? `${avgDays} dias` : '—', hint: `${timings.length} pedidos de venda` },
    }
  },
})

registerWidget({
  id: 'comercial.tempo-medio-por-status',
  sourceProfiles: ['comercial'],
  expensive: true,
  compute: async (period): Promise<DashboardWidgetDTO> => {
    const history = await dashboardRepository.findQuoteStatusHistory(period.from, period.to)
    // Pareia transições consecutivas por entityId — StatusHistory não agrega isso em SQL (ADR-017 §11).
    const durationsByStatus = new Map<string, number[]>()
    let currentEntityId: string | null = null
    let previousCreatedAt: Date | null = null
    for (const entry of history) {
      if (entry.entityId !== currentEntityId) {
        currentEntityId = entry.entityId
        previousCreatedAt = entry.createdAt
        continue
      }
      const days = (entry.createdAt.getTime() - (previousCreatedAt as Date).getTime()) / (1000 * 60 * 60 * 24)
      const list = durationsByStatus.get(entry.fromStatus) || []
      list.push(days)
      durationsByStatus.set(entry.fromStatus, list)
      previousCreatedAt = entry.createdAt
    }
    const series = Array.from(durationsByStatus.entries()).map(([status, days]) => ({
      x: status,
      y: Math.round((days.reduce((a, b) => a + b, 0) / days.length) * 10) / 10,
    }))
    return {
      id: 'comercial.tempo-medio-por-status',
      type: 'chart',
      title: 'Tempo médio em cada status (dias)',
      order: 120,
      data: { chartType: 'bar', series: [{ label: 'Dias', data: series }] },
    }
  },
})

registerWidget({
  id: 'comercial.distribuicao-por-vendedor',
  sourceProfiles: ['comercial'],
  expensive: false,
  compute: async (period): Promise<DashboardWidgetDTO> => {
    const rows = await dashboardRepository.countQuotesByUser(period.from, period.to)
    return {
      id: 'comercial.distribuicao-por-vendedor',
      type: 'chart',
      title: 'Distribuição de orçamentos por vendedor',
      order: 130,
      data: { chartType: 'bar', series: [{ label: 'Orçamentos', data: rows.map((r) => ({ x: r.userName, y: r.count })) }] },
    }
  },
})

registerWidget({
  id: 'comercial.clientes-novos-periodo',
  sourceProfiles: ['comercial'],
  expensive: false,
  compute: async (period): Promise<DashboardWidgetDTO> => {
    const count = await dashboardRepository.countNewClients(period.from, period.to)
    return {
      id: 'comercial.clientes-novos-periodo',
      type: 'card',
      title: 'Clientes novos no período',
      order: 140,
      data: { value: count },
    }
  },
})
