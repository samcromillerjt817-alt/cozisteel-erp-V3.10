'use client'

import { useEffect, useState, type ElementType } from 'react'
import { LayoutDashboard, TrendingUp, ClipboardList, ShoppingCart, Factory, Package, Settings2, Radar, Gauge, Wallet } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { DashboardAlertCenter } from '@/components/dashboard/dashboard-alert-center'
import { DashboardKpiRow } from '@/components/dashboard/dashboard-kpi-row'
import { DashboardSecondaryDetails } from '@/components/dashboard/dashboard-secondary-details'
import { DashboardPeriodFilter, type DashboardPeriodPreset } from '@/components/dashboard/dashboard-period-filter'
import { getCatalogEntry } from '@/app/services/dashboard-widget-catalog'
import type { DashboardPayloadDTO, DashboardProfile, DashboardWidgetDTO } from '@/app/services/dashboard-types'

interface DashboardProfileViewProps {
  profile: DashboardProfile
  onNavigate: (moduleKey: string) => void
}

// Um ícone por perfil (não por widget) — identidade visual simples e sem ruído de cor: todo card de
// KPI usa o mesmo círculo `bg-primary/10`, só o ícone varia por perfil (mesmo espírito do dashboard
// atual, que já varia ícone por card).
export const PROFILE_ICONS: Record<DashboardProfile, ElementType> = {
  diretoria: LayoutDashboard,
  comercial: TrendingUp,
  pcp: ClipboardList,
  producao: Factory,
  estoque: Package,
  compras: ShoppingCart,
  administrativo: Settings2,
  financeiro: Wallet,
}

// Exclui os widgets já promovidos ao Resumo (kind==='kpi', Subetapa 7.3) — o que sobra aqui é
// kind==='detail' (kind==='alert' já não chega em `type==='card'/'chart'/'table'`). Alimenta o bloco
// recolhível único da Subetapa 7.4 (`DashboardSecondaryDetails`).
function groupByType(widgets: DashboardWidgetDTO[]) {
  const detail = widgets.filter((w) => getCatalogEntry(w.id)?.kind !== 'kpi')
  return {
    cards: detail.filter((w) => w.type === 'card'),
    charts: detail.filter((w) => w.type === 'chart'),
    tables: detail.filter((w) => w.type === 'table'),
  }
}

/**
 * Consumidor puro da API do Dashboard (Fase 11, ADR-017/ADR-019, Subetapas 7 e 7.2) — `/api/
 * dashboard/[profile]`. Nenhum cálculo aqui: o filtro de período só monta a querystring, o payload
 * já vem pronto (widgets ordenados, valores computados, severidade de alerta já decidida) do backend.
 *
 * Ação → Resumo → Análise (diretriz permanente do usuário, aprovação do ADR-019): Central de Alertas
 * primeiro (`widget.type === 'alert'`) → Indicadores (cards) → Gráficos/Tabelas analíticas.
 */
export function DashboardProfileView({ profile, onNavigate }: DashboardProfileViewProps) {
  const [preset, setPreset] = useState<DashboardPeriodPreset>('30d')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [payload, setPayload] = useState<DashboardPayloadDTO | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(false)

    const params = new URLSearchParams({ period: preset })
    if (preset === 'custom') {
      if (customFrom) params.set('from', customFrom)
      if (customTo) params.set('to', customTo)
    }

    fetch(`/api/dashboard/${profile}?${params.toString()}`)
      .then((response) => {
        if (!response.ok) throw new Error('Erro ao buscar dashboard')
        return response.json()
      })
      .then((data: DashboardPayloadDTO) => {
        if (!cancelled) {
          setPayload(data)
          setFetchedAt(new Date())
        }
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [profile, preset, customFrom, customTo])

  const Icon = PROFILE_ICONS[profile]
  const alerts = payload ? payload.widgets.filter((w) => w.type === 'alert') : []
  const kpis = payload ? payload.widgets.filter((w) => getCatalogEntry(w.id)?.kind === 'kpi') : []
  const { cards, charts, tables } = payload ? groupByType(payload.widgets) : { cards: [], charts: [], tables: [] }

  return (
    <div className="space-y-6">
      <DashboardPeriodFilter
        value={preset}
        customFrom={customFrom}
        customTo={customTo}
        onChange={setPreset}
        onCustomChange={(from, to) => {
          setCustomFrom(from)
          setCustomTo(to)
        }}
      />

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <p className="text-muted-foreground text-center py-12">Erro ao carregar este dashboard</p>
      ) : !payload || payload.widgets.length === 0 ? (
        <p className="text-muted-foreground text-center py-12">Nenhum indicador disponível para este perfil ainda</p>
      ) : (
        <>
          <section className="space-y-3">
            <header className="flex items-center gap-2">
              <Radar className="w-4 h-4 text-red-600" />
              <div>
                <h3 className="text-sm font-bold leading-tight">Centro de Comando</h3>
                <p className="text-xs text-muted-foreground leading-tight">O que precisa da sua atenção agora.</p>
              </div>
            </header>
            <DashboardAlertCenter widgets={alerts} onNavigate={onNavigate} fetchedAt={fetchedAt} />
          </section>

          {kpis.length > 0 && (
            <section className="space-y-3 rounded-xl bg-muted/30 p-4">
              <header className="flex items-center gap-2">
                <Gauge className="w-4 h-4 text-primary" />
                <div>
                  <h3 className="text-sm font-bold leading-tight">Resumo Operacional</h3>
                  <p className="text-xs text-muted-foreground leading-tight">Indicadores-chave do período selecionado.</p>
                </div>
              </header>
              <DashboardKpiRow widgets={kpis} icon={<Icon className="w-6 h-6 text-primary" />} />
            </section>
          )}

          <DashboardSecondaryDetails cards={cards} charts={charts} tables={tables} icon={<Icon className="w-6 h-6 text-primary" />} />
        </>
      )}
    </div>
  )
}
