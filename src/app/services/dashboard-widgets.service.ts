import { db } from '@/lib/db'
import { getOrCompute } from '@/lib/dashboard-cache'
import { getCatalogEntry } from '@/app/services/dashboard-widget-catalog'
import type {
  DashboardAlertData, DashboardDiretoriaPayloadDTO, DashboardModuleSummaryDTO, DashboardPayloadDTO,
  DashboardPeriod, DashboardProfile, DashboardWidgetDTO,
} from '@/app/services/dashboard-types'

// TTL aprovado pelo usuário (ADR-017 §13, decisão #2): 30-60s, só em memória, sem Redis/scheduler.
const CACHE_TTL_SECONDS = 60

// Perfis que possuem widgets próprios ("donos" de conteúdo) — Diretoria e PCP nunca têm widget
// próprio, só compõem os widgets dos perfis abaixo (ADR-017 §2/§14). `financeiro` ganhou seu primeiro
// widget nativo na Subetapa 7.5 do ADR-019 (antes só reaproveitava comercial/compras).
type WidgetSourceProfile = 'comercial' | 'compras' | 'producao' | 'estoque' | 'administrativo' | 'financeiro'

export interface WidgetDefinition {
  id: string
  sourceProfiles: WidgetSourceProfile[]
  expensive: boolean // true => passa pelo cache (dashboard-cache.ts); false => consulta direta sempre
  compute: (period: DashboardPeriod) => Promise<DashboardWidgetDTO>
}

// Catálogo de widgets — vazio nesta Subetapa 1 (só infraestrutura). Widgets reais de cada domínio
// entram aqui nas Subetapas 2-6 (ADR-017 §19), nunca duplicados entre perfis que compartilham
// conteúdo (ex.: PCP reaproveita os mesmos widgets de Produção/Estoque, nunca uma cópia).
const WIDGET_REGISTRY: WidgetDefinition[] = []

// Quais domínios de conteúdo compõem cada perfil (ADR-017 §2, decisão #1).
const PROFILE_CONTENT_SOURCES: Record<DashboardProfile, WidgetSourceProfile[]> = {
  diretoria: ['comercial', 'compras', 'producao', 'estoque', 'administrativo', 'financeiro'],
  comercial: ['comercial'],
  compras: ['compras'],
  producao: ['producao'],
  estoque: ['estoque'],
  pcp: ['producao', 'estoque'], // + MRP/Engenharia quando esses widgets existirem (mesmos domínios)
  administrativo: ['administrativo'],
  // Hardening pós-11.5, Prioridade 2: `financeiro` virou cidadão de primeira classe do Dashboard v2
  // reaproveitando os widgets de Comercial/Compras, os dois domínios em que o papel já tem
  // `read`/`export` no RBAC (`orcamentos`/`compras`). ADR-019, Subetapa 7.5: ganhou também seu primeiro
  // widget nativo (`financeiro.saldo-liquido-em-aberto`) — a própria aba Financeiro passa a exibi-lo.
  financeiro: ['comercial', 'compras', 'financeiro'],
}

// Nenhum widget é implementado fora do que já está planejado e documentado no catálogo central
// (dashboard-widget-catalog.ts) — decisão do usuário, 2026-07-10, na aprovação da Subetapa 1. Se o
// `id` não existir no catálogo, é sinal de que o levantamento (ADR-017 §3) precisa ser atualizado
// primeiro, não que o widget deve ser criado silenciosamente.
export function registerWidget(definition: WidgetDefinition): void {
  if (!getCatalogEntry(definition.id)) {
    throw new Error(
      `Widget "${definition.id}" não está registrado em dashboard-widget-catalog.ts — adicione-o ao catálogo antes de implementar.`
    )
  }
  WIDGET_REGISTRY.push(definition)
}

export async function getDashboard(profile: DashboardProfile, period: DashboardPeriod = {}): Promise<DashboardPayloadDTO> {
  const sources = PROFILE_CONTENT_SOURCES[profile]
  const widgetDefs = WIDGET_REGISTRY.filter((def) => def.sourceProfiles.some((source) => sources.includes(source)))

  const cacheKeySuffix = `${period.from?.toISOString() ?? ''}:${period.to?.toISOString() ?? ''}`
  const widgets = await Promise.all(
    widgetDefs.map((def) =>
      def.expensive
        ? getOrCompute(`dashboard-widget:${def.id}:${cacheKeySuffix}`, CACHE_TTL_SECONDS, () => def.compute(period))
        : def.compute(period)
    )
  )

  return { profile, widgets: widgets.sort((a, b) => a.order - b.order) }
}

/**
 * Requisições aguardando aprovação — mesmo cálculo ad-hoc que já existia no sino de notificações de
 * `page.tsx` antes da Subetapa 11.5.10. Fica fora do `WIDGET_REGISTRY` de propósito:
 * `registerWidget()` exige uma entrada prévia no catálogo (ADR-017 §1, decisão do usuário) e
 * formalizar isso como indicador oficial do Dashboard seria um levantamento à parte, não algo a
 * decidir dentro de uma subetapa de shell de navegação. Devolve já no formato `DashboardWidgetDTO`
 * (com `title` sintético) para poder ser tratado exatamente como os widgets reais do catálogo por
 * quem consome `getAllAlerts()`.
 */
async function getPendingRequisitionsWidget(): Promise<DashboardWidgetDTO | null> {
  const count = await db.requisition.count({ where: { status: 'sent' } })
  if (count === 0) return null
  const data: DashboardAlertData = {
    severity: 'warning',
    count,
    message: `${count} requisição${count === 1 ? '' : 'ões'} aguardando aprovação.`,
    linkToModule: 'requisicoes',
  }
  return { id: 'requisicoes.pendentes-aprovacao', type: 'alert', title: 'Requisições Pendentes', order: 999, data }
}

/**
 * Todos os widgets do tipo "alerta" de qualquer domínio, independente de perfil — usado pelo sino de
 * notificações da barra lateral (Subetapa 11.5.10), substituindo as 2 buscas manuais que existiam em
 * `page.tsx` (estoque baixo, requisições pendentes calculada aqui via `getPendingRequisitionsWidget`).
 * Devolve `DashboardWidgetDTO[]` (não só `DashboardAlertData[]`) de propósito — `title` é necessário
 * para reaproveitar `DashboardAlertCard` tal como está, sem duplicar o componente. A filtragem por
 * permissão do usuário acontece na rota (`checkPermission` por `linkToModule`), não aqui — este
 * Service não conhece o usuário chamador, só calcula os dados.
 */
export async function getAllAlerts(): Promise<DashboardWidgetDTO[]> {
  const alertDefs = WIDGET_REGISTRY.filter((def) => getCatalogEntry(def.id)?.kind === 'alert')
  const widgets = await Promise.all(
    alertDefs.map((def) =>
      def.expensive
        ? getOrCompute(`dashboard-widget:${def.id}:alerts`, CACHE_TTL_SECONDS, () => def.compute({}))
        : def.compute({})
    )
  )
  const alerts = widgets.filter((w) => (w.data as DashboardAlertData).count > 0)

  const pendingRequisitions = await getPendingRequisitionsWidget()
  if (pendingRequisitions) alerts.push(pendingRequisitions)

  return alerts
}

/** Computa só os widgets pedidos por `id` — usado pela Diretoria para pegar 1 KPI headline por
 * módulo sem computar (e pagar o custo de) todo o resto do catálogo de cada perfil. */
async function getWidgetsByIds(ids: string[], period: DashboardPeriod): Promise<DashboardWidgetDTO[]> {
  const defs = WIDGET_REGISTRY.filter((def) => ids.includes(def.id))
  const cacheKeySuffix = `${period.from?.toISOString() ?? ''}:${period.to?.toISOString() ?? ''}`
  return Promise.all(
    defs.map((def) =>
      def.expensive
        ? getOrCompute(`dashboard-widget:${def.id}:${cacheKeySuffix}`, CACHE_TTL_SECONDS, () => def.compute(period))
        : def.compute(period)
    )
  )
}

// 1 KPI headline por módulo operacional (ADR-019, Subetapa 7.5, Seção 2.6 — "Resumo por módulo", não
// a união dos 48 widgets). `linkModule` é o `ModuleKey` do `page.tsx` que o botão "Ver detalhes de X"
// abre — mesmo widget que já é a "cara" daquele módulo na própria aba dele.
const MODULE_HEADLINES: Array<{ profile: DashboardProfile; widgetId: string; label: string; linkModule: string }> = [
  { profile: 'comercial', widgetId: 'comercial.valor-aprovado-por-periodo', label: 'Comercial', linkModule: 'orcamentos' },
  { profile: 'producao', widgetId: 'producao.wip-total', label: 'Produção', linkModule: 'producao' },
  { profile: 'compras', widgetId: 'compras.valor-total-po-periodo', label: 'Compras', linkModule: 'compras' },
  { profile: 'estoque', widgetId: 'estoque.valor-total-estoque', label: 'Estoque', linkModule: 'estoque' },
  { profile: 'financeiro', widgetId: 'financeiro.saldo-liquido-em-aberto', label: 'Financeiro', linkModule: 'financeiro' },
]

/**
 * Diretoria (ADR-019, Subetapa 7.5) — síntese, não composição: Central de Alertas consolidada de todo
 * o ERP (`getAllAlerts()`, já existente, reaproveitado sem mudança — mesma função que alimenta o sino
 * de notificações) + 1 KPI headline por módulo. Nunca a união bruta dos widgets `kind==='kpi'` de
 * `PROFILE_CONTENT_SOURCES.diretoria` (era o problema #4 catalogado na proposta original do ADR-019).
 */
export async function getDiretoriaSummary(period: DashboardPeriod = {}): Promise<DashboardDiretoriaPayloadDTO> {
  const [alerts, headlineWidgets] = await Promise.all([
    getAllAlerts(),
    getWidgetsByIds(MODULE_HEADLINES.map((m) => m.widgetId), period),
  ])

  const moduleSummaries: DashboardModuleSummaryDTO[] = MODULE_HEADLINES.flatMap((m) => {
    const widget = headlineWidgets.find((w) => w.id === m.widgetId)
    return widget ? [{ profile: m.profile, label: m.label, linkModule: m.linkModule, widget }] : []
  })

  return { alerts, moduleSummaries }
}
