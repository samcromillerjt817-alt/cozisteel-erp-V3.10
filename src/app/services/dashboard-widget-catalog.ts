// Catálogo central de widgets do Dashboard (Fase 11, ADR-017) — fonte única de verdade para a
// evolução do Dashboard, por instrução explícita do usuário (2026-07-10, aprovação da Subetapa 1):
// todo widget planejado existe registrado aqui, mesmo antes de ser implementado. `dashboard-widgets.
// service.ts` (o registro em tempo de execução, `WIDGET_REGISTRY`) só aceita `registerWidget()` para
// um `id` que já exista neste catálogo — garante que nada é implementado fora do que está planejado
// e documentado.
//
// Cada entrada corresponde 1:1 a um indicador já catalogado no levantamento original (ADR-017 §3).
// `implementado` é atualizado manualmente pela subetapa que realmente construir o widget — nunca
// inferido automaticamente.
//
// `kind`/`linkToModule` (ADR-019, Subetapa 7.1) — base da nova experiência "perguntas, não widgets":
// `alert` = número que deveria ser zero/baixo, exige decisão agora, sempre com `linkToModule`;
// `kpi` = termômetro sempre visível; `detail` = analítico de apoio, agrupado e recolhido por padrão.

import type { DashboardProfile } from '@/app/services/dashboard-types'

export type DashboardWidgetKind = 'alert' | 'kpi' | 'detail'

export interface DashboardWidgetCatalogEntry {
  id: string
  nome: string
  categoria: 'comercial' | 'producao' | 'estoque' | 'compras' | 'administrativo' | 'financeiro'
  perfilPadrao: DashboardProfile[] // perfil(is) dono(s) do widget — Diretoria/PCP herdam por composição
  ordemPadrao: number
  implementado: boolean
  dependencias: string[] // pré-requisitos técnicos ou ressalvas, texto livre — [] quando nenhuma
  faseRoadmap: string
  kind: DashboardWidgetKind
  linkToModule?: string // ModuleKey do page.tsx — só presente quando kind === 'alert'
}

export const DASHBOARD_WIDGET_CATALOG: DashboardWidgetCatalogEntry[] = [
  // ── Comercial (ADR-017 §3.1) ──────────────────────────────────────────────
  { id: 'comercial.orcamentos-por-status', nome: 'Orçamentos por status', categoria: 'comercial', perfilPadrao: ['comercial'], ordemPadrao: 10, implementado: true, dependencias: [], faseRoadmap: 'Fase 11 - Subetapa 2', kind: 'kpi' },
  { id: 'comercial.pedidos-por-status', nome: 'Pedidos de venda por status', categoria: 'comercial', perfilPadrao: ['comercial'], ordemPadrao: 20, implementado: true, dependencias: [], faseRoadmap: 'Fase 11 - Subetapa 2', kind: 'detail' },
  { id: 'comercial.valor-aprovado-por-periodo', nome: 'Valor aprovado em orçamentos por período', categoria: 'comercial', perfilPadrao: ['comercial'], ordemPadrao: 30, implementado: true, dependencias: ['renomear "Faturamento" do dashboard atual — é valor negociado, não receita reconhecida (ADR-017 §4)'], faseRoadmap: 'Fase 11 - Subetapa 2', kind: 'kpi' },
  { id: 'comercial.taxa-conversao', nome: 'Taxa de conversão Orçamento→Pedido', categoria: 'comercial', perfilPadrao: ['comercial'], ordemPadrao: 40, implementado: true, dependencias: [], faseRoadmap: 'Fase 11 - Subetapa 2', kind: 'kpi' },
  { id: 'comercial.ticket-medio', nome: 'Ticket médio (orçamento/pedido)', categoria: 'comercial', perfilPadrao: ['comercial'], ordemPadrao: 50, implementado: true, dependencias: [], faseRoadmap: 'Fase 11 - Subetapa 2', kind: 'detail' },
  { id: 'comercial.top-clientes', nome: 'Top clientes por valor', categoria: 'comercial', perfilPadrao: ['comercial'], ordemPadrao: 60, implementado: true, dependencias: [], faseRoadmap: 'Fase 11 - Subetapa 2', kind: 'detail' },
  { id: 'comercial.top-produtos', nome: 'Top produtos mais vendidos/orçados', categoria: 'comercial', perfilPadrao: ['comercial'], ordemPadrao: 70, implementado: true, dependencias: [], faseRoadmap: 'Fase 11 - Subetapa 2', kind: 'detail' },
  { id: 'comercial.clientes-produtos-ativos', nome: 'Clientes/produtos ativos vs. inativos', categoria: 'comercial', perfilPadrao: ['comercial'], ordemPadrao: 80, implementado: true, dependencias: [], faseRoadmap: 'Fase 11 - Subetapa 2', kind: 'detail' },
  { id: 'comercial.orcamentos-vencidos', nome: 'Orçamentos vencidos', categoria: 'comercial', perfilPadrao: ['comercial'], ordemPadrao: 90, implementado: true, dependencias: ['Quote.validUntil é String, sem parser confiável de data'], faseRoadmap: 'Fase 11 - Subetapa 2', kind: 'alert', linkToModule: 'orcamentos' },
  { id: 'comercial.tempo-criacao-aprovacao', nome: 'Tempo médio criação→aprovação', categoria: 'comercial', perfilPadrao: ['comercial'], ordemPadrao: 100, implementado: true, dependencias: [], faseRoadmap: 'Fase 11 - Subetapa 2', kind: 'detail' },
  { id: 'comercial.tempo-aprovacao-conversao', nome: 'Tempo médio aprovação→conversão em Pedido', categoria: 'comercial', perfilPadrao: ['comercial'], ordemPadrao: 110, implementado: true, dependencias: [], faseRoadmap: 'Fase 11 - Subetapa 2', kind: 'detail' },
  { id: 'comercial.tempo-medio-por-status', nome: 'Tempo médio em cada status (Orçamento/Pedido)', categoria: 'comercial', perfilPadrao: ['comercial'], ordemPadrao: 120, implementado: true, dependencias: ['requer leitura de StatusHistory, hoje só escrita — código novo de agregação'], faseRoadmap: 'Fase 11 - Subetapa 2', kind: 'detail' },
  { id: 'comercial.distribuicao-por-vendedor', nome: 'Distribuição por vendedor', categoria: 'comercial', perfilPadrao: ['comercial'], ordemPadrao: 130, implementado: true, dependencias: [], faseRoadmap: 'Fase 11 - Subetapa 2', kind: 'detail' },
  { id: 'comercial.clientes-novos-periodo', nome: 'Clientes novos no período', categoria: 'comercial', perfilPadrao: ['comercial'], ordemPadrao: 140, implementado: true, dependencias: [], faseRoadmap: 'Fase 11 - Subetapa 2', kind: 'detail' },

  // ── Produção / PCP (ADR-017 §3.2) ─────────────────────────────────────────
  { id: 'producao.ops-por-status', nome: 'OPs por status', categoria: 'producao', perfilPadrao: ['producao'], ordemPadrao: 10, implementado: true, dependencias: [], faseRoadmap: 'Fase 11 - Subetapa 3', kind: 'kpi' },
  { id: 'producao.ops-atrasadas', nome: 'OPs atrasadas', categoria: 'producao', perfilPadrao: ['producao'], ordemPadrao: 20, implementado: true, dependencias: ['ProductionOrder.dueDate é String, sem parser confiável (mesma limitação do ADR-007)'], faseRoadmap: 'Fase 11 - Subetapa 3', kind: 'alert', linkToModule: 'producao' },
  { id: 'producao.wip-total', nome: 'WIP (quantidade em produção)', categoria: 'producao', perfilPadrao: ['producao'], ordemPadrao: 30, implementado: true, dependencias: [], faseRoadmap: 'Fase 11 - Subetapa 3', kind: 'kpi' },
  { id: 'producao.backlog-por-produto', nome: 'Backlog de produção por produto', categoria: 'producao', perfilPadrao: ['producao'], ordemPadrao: 40, implementado: true, dependencias: [], faseRoadmap: 'Fase 11 - Subetapa 3', kind: 'detail' },
  { id: 'producao.ops-por-prioridade', nome: 'OPs por prioridade', categoria: 'producao', perfilPadrao: ['producao'], ordemPadrao: 50, implementado: true, dependencias: [], faseRoadmap: 'Fase 11 - Subetapa 3', kind: 'detail' },
  { id: 'producao.rodadas-parciais-por-op', nome: 'Rodadas de produção parcial por OP', categoria: 'producao', perfilPadrao: ['producao'], ordemPadrao: 60, implementado: true, dependencias: [], faseRoadmap: 'Fase 11 - Subetapa 3', kind: 'detail' },
  { id: 'producao.cobertura-reserva', nome: 'Cobertura de reserva / % shortfall', categoria: 'producao', perfilPadrao: ['producao'], ordemPadrao: 70, implementado: true, dependencias: [], faseRoadmap: 'Fase 11 - Subetapa 3', kind: 'alert', linkToModule: 'requisicoes' },
  // linkToModule='producao' (não 'requisicoes'): MRP é atividade de planejamento do PCP — a ação
  // inicial é revisar/processar a sugestão dentro do fluxo de Produção, só depois ela vira
  // requisição/pedido de compra (decisão do usuário, aprovação da Subetapa 7.1 — "o destino deve
  // levar ao primeiro lugar onde o problema se resolve, não ao módulo dono do dado"). Preparado para
  // evoluir no futuro para navegação condicional a Requisições quando a sugestão já tiver virado uma.
  { id: 'producao.sugestoes-mrp-por-status', nome: 'Sugestões MRP por status', categoria: 'producao', perfilPadrao: ['producao'], ordemPadrao: 80, implementado: true, dependencias: ['índice MrpSuggestion.status — concluído na Subetapa 1'], faseRoadmap: 'Fase 11 - Subetapa 3', kind: 'alert', linkToModule: 'producao' },
  { id: 'producao.mrp-compra-vs-producao', nome: 'Proporção compra vs. produção (MRP)', categoria: 'producao', perfilPadrao: ['producao'], ordemPadrao: 90, implementado: true, dependencias: [], faseRoadmap: 'Fase 11 - Subetapa 3', kind: 'detail' },
  { id: 'producao.resumo-ultima-execucao-mrp', nome: 'Resumo da última execução MRP', categoria: 'producao', perfilPadrao: ['producao'], ordemPadrao: 100, implementado: true, dependencias: [], faseRoadmap: 'Fase 11 - Subetapa 3', kind: 'detail' },
  { id: 'producao.volume-lotes-por-periodo', nome: 'Volume de matéria-prima recebida / produto produzido por período', categoria: 'producao', perfilPadrao: ['producao'], ordemPadrao: 110, implementado: true, dependencias: ['índices MaterialBatch.receivedAt / ProductBatch.producedAt — concluídos na Subetapa 1'], faseRoadmap: 'Fase 11 - Subetapa 3', kind: 'detail' },
  { id: 'producao.adocao-lote', nome: 'Adoção de lote (lotControlled)', categoria: 'producao', perfilPadrao: ['producao'], ordemPadrao: 120, implementado: true, dependencias: [], faseRoadmap: 'Fase 11 - Subetapa 3', kind: 'detail' },
  { id: 'producao.bom-revisoes-pendentes', nome: 'Revisões de BOM aguardando liberação', categoria: 'producao', perfilPadrao: ['producao'], ordemPadrao: 130, implementado: true, dependencias: [], faseRoadmap: 'Fase 11 - Subetapa 3', kind: 'detail' },

  // ── Estoque (ADR-017 §3.4) ─────────────────────────────────────────────────
  { id: 'estoque.saldo-atual', nome: 'Saldo atual por material/produto', categoria: 'estoque', perfilPadrao: ['estoque'], ordemPadrao: 10, implementado: true, dependencias: [], faseRoadmap: 'Fase 11 - Subetapa 3', kind: 'detail' },
  { id: 'estoque.materiais-baixo-estoque', nome: 'Materiais com estoque baixo', categoria: 'estoque', perfilPadrao: ['estoque'], ordemPadrao: 20, implementado: true, dependencias: [], faseRoadmap: 'Fase 11 - Subetapa 3', kind: 'alert', linkToModule: 'estoque' },
  { id: 'estoque.reservado-a-caminho-em-producao', nome: 'Reservado / a caminho / em produção', categoria: 'estoque', perfilPadrao: ['estoque'], ordemPadrao: 30, implementado: true, dependencias: [], faseRoadmap: 'Fase 11 - Subetapa 3', kind: 'detail' },
  { id: 'estoque.movimentacoes-por-tipo', nome: 'Volume de movimentações por tipo', categoria: 'estoque', perfilPadrao: ['estoque'], ordemPadrao: 40, implementado: true, dependencias: ['índice StockMovement.type — concluído na Subetapa 1'], faseRoadmap: 'Fase 11 - Subetapa 3', kind: 'detail' },
  { id: 'estoque.materiais-mais-consumidos', nome: 'Materiais mais consumidos/movimentados', categoria: 'estoque', perfilPadrao: ['estoque'], ordemPadrao: 50, implementado: true, dependencias: [], faseRoadmap: 'Fase 11 - Subetapa 3', kind: 'detail' },
  { id: 'estoque.lotes-vencendo', nome: 'Lotes próximos do vencimento', categoria: 'estoque', perfilPadrao: ['estoque'], ordemPadrao: 60, implementado: true, dependencias: ['índice MaterialBatch.expiresAt — concluído na Subetapa 1; expiresAt raramente preenchido hoje (FIFO, não FEFO)'], faseRoadmap: 'Fase 11 - Subetapa 3', kind: 'alert', linkToModule: 'estoque' },
  { id: 'estoque.saldo-valorizado-quantidade', nome: 'Saldo valorizado em quantidade', categoria: 'estoque', perfilPadrao: ['estoque'], ordemPadrao: 70, implementado: true, dependencias: [], faseRoadmap: 'Fase 11 - Subetapa 3', kind: 'kpi' },
  { id: 'estoque.ajustes-inventario', nome: 'Ajustes de inventário', categoria: 'estoque', perfilPadrao: ['estoque'], ordemPadrao: 80, implementado: true, dependencias: [], faseRoadmap: 'Fase 11 - Subetapa 3', kind: 'detail' },
  { id: 'estoque.valor-total-estoque', nome: 'Valor total de estoque (matéria-prima + produto acabado)', categoria: 'estoque', perfilPadrao: ['estoque'], ordemPadrao: 90, implementado: true, dependencias: ['depende de StockValuationService, Fase 12 Subetapa 5 — resolve a lacuna que estoque.saldo-valorizado-quantidade já sinalizava (\"valorização em R$ depende do Financeiro\")'], faseRoadmap: 'Fase 11 - Subetapa 7.5 (ADR-019) — headline para o Resumo por Módulo da Diretoria', kind: 'kpi' },

  // ── Compras (ADR-017 §3.3) ─────────────────────────────────────────────────
  { id: 'compras.requisicoes-por-status-tipo-origem', nome: 'Requisições por status/tipo/origem', categoria: 'compras', perfilPadrao: ['compras'], ordemPadrao: 10, implementado: true, dependencias: ['índice Requisition.tipo — concluído na Subetapa 1'], faseRoadmap: 'Fase 11 - Subetapa 4', kind: 'detail' },
  { id: 'compras.tempo-ciclo-requisicao', nome: 'Tempo de ciclo da requisição', categoria: 'compras', perfilPadrao: ['compras'], ordemPadrao: 20, implementado: true, dependencias: ['requer leitura de StatusHistory, hoje só escrita — código novo de agregação'], faseRoadmap: 'Fase 11 - Subetapa 4', kind: 'detail' },
  { id: 'compras.percentual-atendido-estoque', nome: '% de itens atendidos por estoque vs. comprados', categoria: 'compras', perfilPadrao: ['compras'], ordemPadrao: 30, implementado: true, dependencias: ['segmentar por originModule — requisições "mrp" sempre têm quantityFromStock=0'], faseRoadmap: 'Fase 11 - Subetapa 4', kind: 'detail' },
  { id: 'compras.pedidos-por-status', nome: 'Pedidos de compra por status', categoria: 'compras', perfilPadrao: ['compras'], ordemPadrao: 40, implementado: true, dependencias: [], faseRoadmap: 'Fase 11 - Subetapa 4', kind: 'kpi' },
  { id: 'compras.aprovacoes-pendentes', nome: 'Aprovações de compra pendentes agora', categoria: 'compras', perfilPadrao: ['compras'], ordemPadrao: 50, implementado: true, dependencias: [], faseRoadmap: 'Fase 11 - Subetapa 4', kind: 'alert', linkToModule: 'compras' },
  { id: 'compras.tempo-por-etapa-po', nome: 'Tempo médio em cada etapa do Pedido de Compra', categoria: 'compras', perfilPadrao: ['compras'], ordemPadrao: 60, implementado: true, dependencias: ['índice PurchaseOrder.createdAt — concluído na Subetapa 1; sem índice nas 5 colunas de data de transição'], faseRoadmap: 'Fase 11 - Subetapa 4', kind: 'detail' },
  { id: 'compras.performance-fornecedor', nome: 'Performance de fornecedor (prazo prometido × real)', categoria: 'compras', perfilPadrao: ['compras'], ordemPadrao: 70, implementado: true, dependencias: [], faseRoadmap: 'Fase 11 - Subetapa 4', kind: 'detail' },
  { id: 'compras.valor-total-po', nome: 'Valor total de PO por status/fornecedor', categoria: 'compras', perfilPadrao: ['compras'], ordemPadrao: 80, implementado: true, dependencias: [], faseRoadmap: 'Fase 11 - Subetapa 4', kind: 'kpi' },
  { id: 'compras.valor-total-po-periodo', nome: 'Valor total de Pedidos de Compra no período', categoria: 'compras', perfilPadrao: ['compras'], ordemPadrao: 85, implementado: true, dependencias: ['agregado a partir do mesmo dado de compras.valor-total-po, sem consulta nova — só um número único em vez da série por status/fornecedor'], faseRoadmap: 'Fase 11 - Subetapa 7.5 (ADR-019) — headline para o Resumo por Módulo da Diretoria', kind: 'kpi' },
  { id: 'compras.taxa-vitoria-fornecedor', nome: 'Taxa de vitória por fornecedor (cotação)', categoria: 'compras', perfilPadrao: ['compras'], ordemPadrao: 90, implementado: true, dependencias: [], faseRoadmap: 'Fase 11 - Subetapa 4', kind: 'detail' },

  // ── Administrativo (ADR-017 §3.5) ─────────────────────────────────────────
  { id: 'administrativo.usuarios-ativos-por-papel', nome: 'Usuários ativos por papel', categoria: 'administrativo', perfilPadrao: ['administrativo'], ordemPadrao: 10, implementado: true, dependencias: [], faseRoadmap: 'Fase 11 - Subetapa 5', kind: 'kpi' },
  { id: 'administrativo.volume-auditoria-por-periodo', nome: 'Volume de ações de auditoria por módulo/período', categoria: 'administrativo', perfilPadrao: ['administrativo'], ordemPadrao: 20, implementado: true, dependencias: [], faseRoadmap: 'Fase 11 - Subetapa 5', kind: 'detail' },
  { id: 'administrativo.sequencias-numeracao', nome: 'Sequências de numeração (próximo número por tipo)', categoria: 'administrativo', perfilPadrao: ['administrativo'], ordemPadrao: 30, implementado: true, dependencias: [], faseRoadmap: 'Fase 11 - Subetapa 5', kind: 'detail' },
  { id: 'administrativo.ultimas-execucoes-patch', nome: 'Últimas execuções de patch/sistema', categoria: 'administrativo', perfilPadrao: ['administrativo'], ordemPadrao: 40, implementado: true, dependencias: [], faseRoadmap: 'Fase 11 - Subetapa 5', kind: 'detail' },

  // ── Financeiro (ADR-019, Subetapa 7.5) — primeiro widget nativo do perfil, que até aqui só
  // reaproveitava widgets de Comercial/Compras (Hardening pós-11.5). Também alimenta o card "Financeiro"
  // no Resumo por Módulo da Diretoria.
  { id: 'financeiro.saldo-liquido-em-aberto', nome: 'Saldo líquido em aberto (a receber − a pagar)', categoria: 'financeiro', perfilPadrao: ['financeiro'], ordemPadrao: 10, implementado: true, dependencias: [], faseRoadmap: 'Fase 11 - Subetapa 7.5 (ADR-019)', kind: 'kpi' },
]

export function getCatalogEntry(id: string): DashboardWidgetCatalogEntry | undefined {
  return DASHBOARD_WIDGET_CATALOG.find((entry) => entry.id === id)
}

export function getCatalogByCategoria(categoria: DashboardWidgetCatalogEntry['categoria']): DashboardWidgetCatalogEntry[] {
  return DASHBOARD_WIDGET_CATALOG.filter((entry) => entry.categoria === categoria)
}

export function getImplementedWidgets(): DashboardWidgetCatalogEntry[] {
  return DASHBOARD_WIDGET_CATALOG.filter((entry) => entry.implementado)
}

export function getPendingWidgets(): DashboardWidgetCatalogEntry[] {
  return DASHBOARD_WIDGET_CATALOG.filter((entry) => !entry.implementado)
}

export function getWidgetsByKind(kind: DashboardWidgetKind): DashboardWidgetCatalogEntry[] {
  return DASHBOARD_WIDGET_CATALOG.filter((entry) => entry.kind === kind)
}
