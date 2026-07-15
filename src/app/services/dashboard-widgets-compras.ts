// Widgets reais do perfil Compras (Fase 11, ADR-017, Subetapa 4) — mesmo padrão das Subetapas 2-3.
// Correções incorporadas na aprovação do levantamento (2026-07-10): percentual-atendido-estoque
// segmentado por originModule (ADR-009); tempo-ciclo-requisicao só considera ciclos concluídos;
// tempo-por-etapa-po expõe sampleSize por etapa; performance-fornecedor filtra por critérios
// explícitos e expõe prometido/real/diferença; taxa-vitoria-fornecedor é vitórias/participações.

import { dashboardRepository } from '@/app/repositories/dashboard.repository'
import { registerWidget } from '@/app/services/dashboard-widgets.service'
import type { DashboardWidgetDTO } from '@/app/services/dashboard-types'

registerWidget({
  id: 'compras.requisicoes-por-status-tipo-origem',
  sourceProfiles: ['compras'],
  expensive: false,
  compute: async (period): Promise<DashboardWidgetDTO> => {
    const [byStatus, byTipo, byOrigin] = await Promise.all([
      dashboardRepository.countRequisitionsByStatus(period.from, period.to),
      dashboardRepository.countRequisitionsByTipo(period.from, period.to),
      dashboardRepository.countRequisitionsByOriginModule(period.from, period.to),
    ])
    return {
      id: 'compras.requisicoes-por-status-tipo-origem',
      type: 'table',
      title: 'Requisições por status / tipo / origem',
      order: 10,
      data: {
        columns: [{ key: 'dimensao', label: 'Dimensão' }, { key: 'valor', label: 'Valor' }, { key: 'quantidade', label: 'Quantidade' }],
        rows: [
          ...byStatus.map((g) => ({ dimensao: 'Status', valor: g.status, quantidade: g._count.status })),
          ...byTipo.map((g) => ({ dimensao: 'Tipo', valor: g.tipo, quantidade: g._count.tipo })),
          ...byOrigin.map((g) => ({ dimensao: 'Origem', valor: g.originModule, quantidade: g._count.originModule })),
        ],
      },
    }
  },
})

registerWidget({
  id: 'compras.tempo-ciclo-requisicao',
  sourceProfiles: ['compras'],
  expensive: true,
  compute: async (period): Promise<DashboardWidgetDTO> => {
    // Só requisições com status='ordered' (ciclo concluído) — ver dashboard.repository.ts.
    const history = await dashboardRepository.findCompletedRequisitionStatusHistory(period.from, period.to)
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
    const series = Array.from(durationsByStatus.entries()).map(([status, days]) => ({ x: status, y: Math.round((days.reduce((a, b) => a + b, 0) / days.length) * 10) / 10 }))
    return {
      id: 'compras.tempo-ciclo-requisicao',
      type: 'chart',
      title: 'Tempo médio em cada status (requisições concluídas)',
      order: 20,
      data: { chartType: 'bar', series: [{ label: 'Dias', data: series }] },
    }
  },
})

registerWidget({
  id: 'compras.percentual-atendido-estoque',
  sourceProfiles: ['compras'],
  expensive: false,
  compute: async (period): Promise<DashboardWidgetDTO> => {
    const rows = await dashboardRepository.sumRequisitionFulfillmentByOrigin(period.from, period.to)
    return {
      id: 'compras.percentual-atendido-estoque',
      type: 'table',
      title: '% de itens atendidos por estoque vs. comprados (por origem)',
      order: 30,
      data: {
        columns: [{ key: 'originModule', label: 'Origem' }, { key: 'fromStock', label: 'Atendido por estoque' }, { key: 'toPurchase', label: 'A comprar' }],
        rows: rows.map((r) => ({ originModule: r.originModule, fromStock: r.fromStock, toPurchase: r.toPurchase })),
      },
    }
  },
})

registerWidget({
  id: 'compras.pedidos-por-status',
  sourceProfiles: ['compras'],
  expensive: false,
  compute: async (period): Promise<DashboardWidgetDTO> => {
    const groups = await dashboardRepository.countPurchaseOrdersByStatus(period.from, period.to)
    return {
      id: 'compras.pedidos-por-status',
      type: 'chart',
      title: 'Pedidos de compra por status',
      order: 40,
      data: { chartType: 'donut', series: [{ label: 'Pedidos', data: groups.map((g) => ({ x: g.status, y: g._count.status })) }] },
    }
  },
})

// Severidade do alerta (ADR-019, Subetapa 7.2, decisão do usuário): aprovação pendente bloqueia o
// fluxo de compras e pode virar crítico rapidamente — escala com há quanto tempo a mais antiga está
// esperando, não só com a contagem. Limiares ajustáveis conforme validação com o usuário.
const APROVACAO_PENDENTE_CRITICAL_DAYS = 3
const APROVACAO_PENDENTE_CRITICAL_COUNT = 5

registerWidget({
  id: 'compras.aprovacoes-pendentes',
  sourceProfiles: ['compras'],
  expensive: false,
  compute: async (): Promise<DashboardWidgetDTO> => {
    const rows = await dashboardRepository.findPendingApprovalAges()
    const count = rows.length
    const now = new Date()
    const ages = rows.filter((r) => r.enteredPendingApprovalAt !== null).map((r) => (now.getTime() - r.enteredPendingApprovalAt!.getTime()) / (1000 * 60 * 60 * 24))
    const maxAgeDays = ages.length > 0 ? Math.max(...ages) : 0
    const severity =
      count === 0 ? 'info' : maxAgeDays >= APROVACAO_PENDENTE_CRITICAL_DAYS || count >= APROVACAO_PENDENTE_CRITICAL_COUNT ? 'critical' : 'warning'
    return {
      id: 'compras.aprovacoes-pendentes',
      type: 'alert',
      title: 'Aprovações de compra pendentes',
      order: 50,
      data: {
        severity,
        count,
        message: count === 1 ? '1 aprovação de compra pendente aguardando decisão.' : `${count} aprovações de compra pendentes aguardando decisão.`,
        linkToModule: 'compras',
      },
    }
  },
})

registerWidget({
  id: 'compras.tempo-por-etapa-po',
  sourceProfiles: ['compras'],
  expensive: true,
  compute: async (period): Promise<DashboardWidgetDTO> => {
    const orders = await dashboardRepository.findPurchaseOrdersForStageTiming(period.from, period.to)
    const stages: { key: string; from: (keyof typeof orders[number])[]; label: string }[] = [
      { key: 'created-approved', from: ['createdAt', 'approvedAt'], label: 'Criação → Aprovação' },
      { key: 'approved-sent', from: ['approvedAt', 'sentAt'], label: 'Aprovação → Envio' },
      { key: 'sent-confirmed', from: ['sentAt', 'confirmedAt'], label: 'Envio → Confirmação' },
      { key: 'confirmed-received', from: ['confirmedAt', 'receivedAt'], label: 'Confirmação → Recebimento' },
    ]
    const rows = stages.map(({ label, from }) => {
      const [startField, endField] = from
      const days: number[] = []
      for (const order of orders) {
        const start = order[startField] as Date | null
        const end = order[endField] as Date | null
        if (start && end) days.push((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
      }
      const avgDays = days.length > 0 ? Math.round((days.reduce((a, b) => a + b, 0) / days.length) * 10) / 10 : null
      return { etapa: label, mediaDias: avgDays ?? '—', sampleSize: days.length }
    })
    return {
      id: 'compras.tempo-por-etapa-po',
      type: 'table',
      title: 'Tempo médio em cada etapa do Pedido de Compra',
      order: 60,
      data: { columns: [{ key: 'etapa', label: 'Etapa' }, { key: 'mediaDias', label: 'Média (dias)' }, { key: 'sampleSize', label: 'Amostra (POs)' }], rows },
    }
  },
})

registerWidget({
  id: 'compras.performance-fornecedor',
  sourceProfiles: ['compras'],
  expensive: true,
  compute: async (period): Promise<DashboardWidgetDTO> => {
    const rows = await dashboardRepository.findSupplierLeadTimePerformance(period.from, period.to)
    return {
      id: 'compras.performance-fornecedor',
      type: 'table',
      title: 'Performance de fornecedor (prazo prometido × real)',
      order: 70,
      data: {
        columns: [
          { key: 'supplierName', label: 'Fornecedor' },
          { key: 'avgPromised', label: 'Prometido (dias)' },
          { key: 'avgActual', label: 'Real (dias)' },
          { key: 'diff', label: 'Diferença (dias)' },
          { key: 'sampleSize', label: 'Amostra (POs)' },
        ],
        rows: rows.map((r) => ({ supplierName: r.supplierName, avgPromised: r.avgPromised, avgActual: r.avgActual, diff: r.diff, sampleSize: r.sampleSize })),
      },
    }
  },
})

registerWidget({
  id: 'compras.valor-total-po',
  sourceProfiles: ['compras'],
  expensive: false,
  compute: async (period): Promise<DashboardWidgetDTO> => {
    const groups = await dashboardRepository.sumPurchaseOrderValueByStatus(period.from, period.to)
    return {
      id: 'compras.valor-total-po',
      type: 'chart',
      title: 'Valor total de Pedidos de Compra por status',
      order: 80,
      data: { chartType: 'bar', series: [{ label: 'Valor', data: groups.map((g) => ({ x: g.status, y: g._sum.total || 0 })) }] },
    }
  },
})

// ADR-019, Subetapa 7.5 — headline de 1 número pro Resumo por Módulo da Diretoria. Reaproveita a
// mesma consulta de `compras.valor-total-po` (nenhuma query nova), só soma os grupos em vez de
// devolver a série por status/fornecedor — aquele widget é um gráfico, este é um card único.
registerWidget({
  id: 'compras.valor-total-po-periodo',
  sourceProfiles: ['compras'],
  expensive: false,
  compute: async (period): Promise<DashboardWidgetDTO> => {
    const groups = await dashboardRepository.sumPurchaseOrderValueByStatus(period.from, period.to)
    const total = groups.reduce((sum, g) => sum + (g._sum.total || 0), 0)
    return {
      id: 'compras.valor-total-po-periodo',
      type: 'card',
      title: 'Valor total de Pedidos de Compra',
      order: 85,
      data: { value: total, format: 'currency' },
    }
  },
})

registerWidget({
  id: 'compras.taxa-vitoria-fornecedor',
  sourceProfiles: ['compras'],
  expensive: false,
  compute: async (): Promise<DashboardWidgetDTO> => {
    const rows = await dashboardRepository.supplierQuoteWinRate()
    return {
      id: 'compras.taxa-vitoria-fornecedor',
      type: 'table',
      title: 'Taxa de vitória por fornecedor (vitórias / participações)',
      order: 90,
      data: {
        columns: [{ key: 'supplierName', label: 'Fornecedor' }, { key: 'participations', label: 'Participações' }, { key: 'wins', label: 'Vitórias' }, { key: 'winRate', label: 'Taxa' }],
        rows: rows.map((r) => ({ supplierName: r.supplierName, participations: r.participations, wins: r.wins, winRate: `${r.winRate}%` })),
      },
    }
  },
})
