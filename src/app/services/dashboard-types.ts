// Tipos internos do novo Dashboard (Fase 11, ADR-017) — modular por widgets (Princípio Arquitetural
// Permanente registrado no ADR-017): cada card/gráfico/tabela é um widget independente com `id`/
// `type`/`order` estáveis, nunca um campo fixo por perfil. Isso é o que permite, no futuro, ocultar/
// reordenar/adicionar widgets ou personalizar por usuário/perfil sem mudar o contrato do DTO.

export type DashboardProfile =
  | 'diretoria'
  | 'comercial'
  | 'pcp'
  | 'compras'
  | 'producao'
  | 'estoque'
  | 'administrativo'
  | 'financeiro'

export const DASHBOARD_PROFILES: DashboardProfile[] = [
  'diretoria',
  'comercial',
  'pcp',
  'compras',
  'producao',
  'estoque',
  'administrativo',
  'financeiro',
]

export type DashboardWidgetType = 'card' | 'chart' | 'table' | 'alert'

// `trend`/`trendValue`/`trendLabel` (ADR-019, Subetapa 7.4, pedido do usuário) — arquitetura pronta
// para tendência período-a-período nos KPIs, sem exigir cálculo histórico ainda: campos opcionais,
// nenhum widget os preenche hoje, o componente de card já sabe renderizá-los quando existirem, sem
// precisar mudar layout depois.
export interface DashboardCardData {
  value: number | string
  hint?: string
  trend?: 'up' | 'down' | 'stable'
  trendValue?: string // ex.: "+12%", "-3 dias"
  trendLabel?: string // ex.: "vs. período anterior"
  // ADR-019, Subetapa 7.5 — achado do usuário: widgets com `value` monetário passavam o número cru
  // (ex. "15960"), sem "R$" nem separador de milhar, ilegível. `format: 'currency'` sinaliza pro
  // renderizador aplicar `formatCurrency()`; string já pré-formatada (ex. "42%", "5 dias") não usa isso.
  format?: 'currency'
}

// Severidade decoupled da interface (ADR-019, Subetapa 7.2 — decisão do usuário): cada widget de
// alerta calcula sua própria severidade por uma regra específica do seu domínio (prazo, proximidade
// de vencimento, risco operacional etc.), nunca por um limiar numérico genérico de contagem. O
// frontend só renderiza os campos abaixo — nunca recalcula severidade a partir de `count`.
export type DashboardAlertSeverity = 'critical' | 'warning' | 'info'

export interface DashboardAlertData {
  severity: DashboardAlertSeverity
  count: number
  message: string // frase curta explicativa, ex.: "7 aprovações aguardando decisão."
  linkToModule: string // ModuleKey do page.tsx — sempre o lugar onde o problema é resolvido primeiro
}

export interface DashboardChartSeries {
  label: string
  data: { x: string; y: number }[]
}

export interface DashboardChartData {
  chartType: 'bar' | 'line' | 'donut' | 'funnel' // suportados pelo Recharts (ADR-017, decisão #4)
  series: DashboardChartSeries[]
}

export interface DashboardTableData {
  columns: { key: string; label: string }[]
  rows: Record<string, unknown>[]
}

export interface DashboardWidgetDTO {
  id: string // chave estável — usada para cache (dashboard-cache.ts) e, no futuro, para
  // ocultar/reordenar/personalizar por usuário sem mudar o contrato
  type: DashboardWidgetType
  title: string
  order: number
  data: DashboardCardData | DashboardChartData | DashboardTableData | DashboardAlertData
}

export interface DashboardPayloadDTO {
  profile: DashboardProfile
  widgets: DashboardWidgetDTO[]
}

export interface DashboardPeriod {
  from?: Date
  to?: Date
}

// Diretoria (ADR-019, Subetapa 7.5) — não é uma composição de perfis como PCP, é uma síntese com
// forma própria: Central de Alertas consolidada de todo o ERP + 1 KPI headline por módulo, nunca a
// união dos 48 widgets operacionais. Por isso tem seu próprio DTO, em vez de reaproveitar
// `DashboardPayloadDTO` (que assume "lista plana de widgets de um perfil").
export interface DashboardModuleSummaryDTO {
  profile: DashboardProfile
  label: string
  linkModule: string // ModuleKey do page.tsx
  widget: DashboardWidgetDTO
}

export interface DashboardDiretoriaPayloadDTO {
  alerts: DashboardWidgetDTO[]
  moduleSummaries: DashboardModuleSummaryDTO[]
}
