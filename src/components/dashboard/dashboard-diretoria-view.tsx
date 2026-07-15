'use client'

import { useEffect, useState } from 'react'
import { Radar, Compass } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { DashboardAlertCenter } from '@/components/dashboard/dashboard-alert-center'
import { DashboardModuleSummaryCard } from '@/components/dashboard/dashboard-module-summary-card'
import { DashboardPeriodFilter, type DashboardPeriodPreset } from '@/components/dashboard/dashboard-period-filter'
import { PROFILE_ICONS } from '@/components/dashboard/dashboard-profile-view'
import type { DashboardCardData, DashboardDiretoriaPayloadDTO } from '@/app/services/dashboard-types'

interface DashboardDiretoriaViewProps {
  onNavigate: (moduleKey: string) => void
}

// Tela inicial limpa mesmo com muitos alertas de todos os módulos somados (ADR-019, decisão de
// aprovação) — só os mais relevantes de cara, resto via expansão dentro do próprio `DashboardAlertCenter`.
const DIRETORIA_MAX_ALERTS_VISIBLE = 4

/**
 * Diretoria (ADR-019, Subetapa 7.5) — "não é união, é síntese" (Seção 2.6 da proposta): consome
 * `/api/dashboard/diretoria`, que devolve um payload próprio (`DashboardDiretoriaPayloadDTO`), não
 * a lista plana de widgets que `DashboardProfileView` espera. Central de Alertas consolidada de todo o
 * ERP primeiro (Ação), 1 KPI headline por módulo depois (Resumo) — nunca a união bruta dos widgets
 * `kind==='kpi'` de cada perfil, nunca uma seção de detalhe (quem quiser o analítico completo troca de
 * aba).
 */
export function DashboardDiretoriaView({ onNavigate }: DashboardDiretoriaViewProps) {
  const [preset, setPreset] = useState<DashboardPeriodPreset>('30d')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [payload, setPayload] = useState<DashboardDiretoriaPayloadDTO | null>(null)
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

    fetch(`/api/dashboard/diretoria?${params.toString()}`)
      .then((response) => {
        if (!response.ok) throw new Error('Erro ao buscar dashboard')
        return response.json()
      })
      .then((data: DashboardDiretoriaPayloadDTO) => {
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
  }, [preset, customFrom, customTo])

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
        <p className="text-muted-foreground text-center py-12">Erro ao carregar o dashboard da Diretoria</p>
      ) : !payload ? (
        <p className="text-muted-foreground text-center py-12">Nenhum indicador disponível ainda</p>
      ) : (
        <>
          <section className="space-y-3">
            <header className="flex items-center gap-2">
              <Radar className="w-4 h-4 text-red-600" />
              <div>
                <h3 className="text-sm font-bold leading-tight">Central de Alertas</h3>
                <p className="text-xs text-muted-foreground leading-tight">O que precisa de atenção agora, em toda a empresa.</p>
              </div>
            </header>
            <DashboardAlertCenter widgets={payload.alerts} onNavigate={onNavigate} fetchedAt={fetchedAt} maxVisible={DIRETORIA_MAX_ALERTS_VISIBLE} />
          </section>

          {payload.moduleSummaries.length > 0 && (
            <section className="space-y-3 rounded-xl bg-muted/30 p-4">
              <header className="flex items-center gap-2">
                <Compass className="w-4 h-4 text-primary" />
                <div>
                  <h3 className="text-sm font-bold leading-tight">Visão Geral</h3>
                  <p className="text-xs text-muted-foreground leading-tight">1 indicador por módulo — abra o módulo para o detalhe completo.</p>
                </div>
              </header>
              {/* ADR-019 §5 (QA responsivo, Subetapa 7.6): a faixa "notebook" (768-1536px) é onde os
                  Achados 4/5 apareceram (cards muito estreitos) — 5 colunas só a partir de `2xl`
                  (1536px), o próprio limiar de "ultrawide" que o ADR já documentava. */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-5 gap-4">
                {payload.moduleSummaries.map((summary) => {
                  const Icon = PROFILE_ICONS[summary.profile]
                  return (
                    <DashboardModuleSummaryCard
                      key={summary.profile}
                      label={summary.label}
                      data={summary.widget.data as DashboardCardData}
                      icon={<Icon className="w-6 h-6 text-primary" />}
                      onOpen={() => onNavigate(summary.linkModule)}
                    />
                  )
                })}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
