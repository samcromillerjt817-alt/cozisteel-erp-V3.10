import { db } from '@/lib/db'
import { getAllAlerts, getWidgetsByIds } from '@/app/services/dashboard-widgets.service'
import type { DashboardCentroOperacoesPayloadDTO, DashboardModuleSummaryDTO, DashboardPipelineStageDTO } from '@/app/services/dashboard-types'

/**
 * Centro de Operações (ADR-024, Fase 1) — home única de todo usuário, mostrando o pipeline
 * Orçamento→Pedido→Produção→Compra→Entrega→Financeiro inteiro, mais a Central de Alertas e um
 * resumo de KPIs operacionais já existentes. Fase 1 reaproveita ao máximo a infraestrutura do
 * Dashboard v2 (ADR-017/019) — só o pipeline em si é cálculo novo, tudo o resto é composição.
 */
class CentroOperacoesService {
  /**
   * Uma contagem "em trânsito" por etapa — nunca a mesma definição de um widget de alerta específico
   * (esses medem atraso/risco; aqui é só "quanto tem parado nesta etapa agora"). `severity` decide só
   * a cor do ícone da etapa, não dispara nenhuma ação — a ação de verdade fica nos alertas abaixo.
   */
  async getPipelineStages(): Promise<DashboardPipelineStageDTO[]> {
    const today = new Date()

    const [
      orcamentosAbertos,
      pedidosAbertos,
      producaoAndamento,
      requisicoesPendentes,
      purchaseOrdersPendentes,
      entregasAtrasadas,
      receivablesVencidas,
      payablesVencidas,
    ] = await Promise.all([
      db.quote.count({ where: { status: { in: ['draft', 'sent'] } } }),
      db.salesOrder.count({ where: { status: 'open' } }),
      db.productionOrder.count({ where: { status: 'in_progress' } }),
      db.requisition.count({ where: { status: 'sent' } }),
      db.purchaseOrder.count({ where: { status: { in: ['draft', 'pending_approval'] } } }),
      db.shipment.count({ where: { scheduledDate: { lt: today }, status: { notIn: ['delivered', 'cancelled'] } } }),
      db.accountReceivable.count({ where: { status: { in: ['open', 'partially_paid'] }, dueDate: { lt: today } } }),
      db.accountPayable.count({ where: { status: { in: ['open', 'partially_paid'] }, dueDate: { lt: today } } }),
    ])

    const comprasPendentes = requisicoesPendentes + purchaseOrdersPendentes
    const financeiroPendencias = receivablesVencidas + payablesVencidas

    return [
      { id: 'orcamento', label: 'Orçamento', count: orcamentosAbertos, severity: 'info', linkToModule: 'orcamentos' },
      { id: 'pedido', label: 'Pedido', count: pedidosAbertos, severity: pedidosAbertos > 0 ? 'warning' : 'info', linkToModule: 'pedidos' },
      { id: 'producao', label: 'Produção', count: producaoAndamento, severity: 'info', linkToModule: 'producao' },
      { id: 'compra', label: 'Compra', count: comprasPendentes, severity: comprasPendentes > 0 ? 'warning' : 'info', linkToModule: 'compras' },
      { id: 'entrega', label: 'Entrega', count: entregasAtrasadas, severity: entregasAtrasadas > 0 ? 'critical' : 'info', linkToModule: 'pedidos' },
      { id: 'financeiro', label: 'Financeiro', count: financeiroPendencias, severity: financeiroPendencias > 0 ? 'critical' : 'info', linkToModule: 'financeiro' },
    ]
  }

  /**
   * KPIs operacionais do mockup — reaproveita 4 widgets já existentes no catálogo (nenhum recálculo
   * de regra de negócio), só reempacotados no formato `DashboardModuleSummaryDTO` (mesmo usado pelo
   * "Resumo por Módulo" da Diretoria) para ganhar de graça o botão "Ver detalhes" que
   * `DashboardModuleSummaryCard` já sabe renderizar. Tendência período-a-período (`trend`, mockup
   * "↑3 vs ontem") fica fora desta fase — reconstruir com precisão o valor "de ontem" para cada uma
   * dessas 4 métricas exigiria uma abordagem própria por métrica (algumas são reconstruíveis a partir
   * de datas já gravadas, `estoque crítico` não tem nenhum histórico de saldo) e não foi feito para
   * não arriscar um número aproximado/errado — ver ADR-024, Parte 6.
   */
  async getOperationalKpis(): Promise<DashboardModuleSummaryDTO[]> {
    const ids = ['producao.ops-atrasadas', 'compras.aprovacoes-pendentes', 'estoque.materiais-baixo-estoque', 'financeiro.contas-vencidas']
    const widgets = await getWidgetsByIds(ids, {})

    const KPI_META: Record<string, { profile: DashboardModuleSummaryDTO['profile']; label: string; linkModule: string }> = {
      'producao.ops-atrasadas': { profile: 'producao', label: 'OPs atrasadas', linkModule: 'producao' },
      'compras.aprovacoes-pendentes': { profile: 'compras', label: 'Compras pendentes', linkModule: 'compras' },
      'estoque.materiais-baixo-estoque': { profile: 'estoque', label: 'Estoque crítico', linkModule: 'estoque' },
      'financeiro.contas-vencidas': { profile: 'financeiro', label: 'Contas vencidas', linkModule: 'financeiro' },
    }

    return ids.flatMap((id) => {
      const widget = widgets.find((w) => w.id === id)
      const meta = KPI_META[id]
      if (!widget || !meta) return []

      // Os 4 widgets reaproveitados são `type: 'alert'` (`data: DashboardAlertData`, com `count`) —
      // `DashboardModuleSummaryCard` espera `DashboardCardData` (com `value`). Reempacota aqui, uma
      // vez só, em vez de o componente de UI ter que saber sobre os dois formatos.
      const alertData = widget.data as { count: number; message: string }
      return [{
        profile: meta.profile,
        label: meta.label,
        linkModule: meta.linkModule,
        widget: { ...widget, type: 'card' as const, data: { value: alertData.count, hint: alertData.message } },
      }]
    })
  }

  async getPayload(): Promise<DashboardCentroOperacoesPayloadDTO> {
    const [pipeline, alerts, kpis] = await Promise.all([this.getPipelineStages(), getAllAlerts(), this.getOperationalKpis()])
    return { pipeline, alerts, kpis }
  }
}

export const centroOperacoesService = new CentroOperacoesService()
