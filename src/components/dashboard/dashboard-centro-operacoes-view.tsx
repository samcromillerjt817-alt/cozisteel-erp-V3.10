'use client'

import { useEffect, useState } from 'react'
import { Radar, Gauge } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { DashboardAlertCenter } from '@/components/dashboard/dashboard-alert-center'
import { DashboardModuleSummaryCard } from '@/components/dashboard/dashboard-module-summary-card'
import { DashboardPipelineBreadcrumb } from '@/components/dashboard/dashboard-pipeline-breadcrumb'
import { PROFILE_ICONS } from '@/components/dashboard/dashboard-profile-view'
import type { DashboardCardData, DashboardCentroOperacoesPayloadDTO } from '@/app/services/dashboard-types'

interface DashboardCentroOperacoesViewProps {
  onNavigate: (moduleKey: string) => void
}

// Tela inicial limpa mesmo com alertas de todos os módulos somados — mesmo limite já usado na
// Diretoria (ADR-019), consistente entre as duas telas que agregam o ERP inteiro.
const CENTRO_OPERACOES_MAX_ALERTS_VISIBLE = 4

/**
 * Centro de Operações (ADR-024, Fase 1) — home única de todo usuário: pipeline Orçamento→Financeiro
 * primeiro (retrato do agora), Central de Alertas depois (Ação), KPIs operacionais por último
 * (Resumo) — mesma diretriz "Ação → Resumo → Análise" do resto do Dashboard v2 (ADR-019), só com o
 * pipeline como camada extra no topo, específica desta tela.
 *
 * Causa/sugestão por alerta, "Meu trabalho hoje", "Destaques do dia" e o painel lateral "Como
 * resolver" (com travessia entre documentos) são fases futuras — ver ADR-024, Parte 6. Esta é
 * deliberadamente só a Fase 1: monta a tela reaproveitando 100% da infraestrutura já existente do
 * Dashboard v2, sem nenhum dado novo além do pipeline em si.
 */
export function DashboardCentroOperacoesView({ onNavigate }: DashboardCentroOperacoesViewProps) {
  const [payload, setPayload] = useState<DashboardCentroOperacoesPayloadDTO | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(false)

    fetch('/api/dashboard/centro-operacoes')
      .then((response) => {
        if (!response.ok) throw new Error('Erro ao buscar dashboard')
        return response.json()
      })
      .then((data: DashboardCentroOperacoesPayloadDTO) => {
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
  }, [])

  return (
    <div className="space-y-6">
      {loading ? (
        <div className="space-y-6">
          <Skeleton className="h-16 rounded-xl" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
        </div>
      ) : error ? (
        <p className="text-muted-foreground text-center py-12">Erro ao carregar o Centro de Operações</p>
      ) : !payload ? (
        <p className="text-muted-foreground text-center py-12">Nenhum indicador disponível ainda</p>
      ) : (
        <>
          <DashboardPipelineBreadcrumb stages={payload.pipeline} onNavigate={onNavigate} />

          <section className="space-y-3">
            <header className="flex items-center gap-2">
              <Radar className="w-4 h-4 text-red-600" />
              <div>
                <h3 className="text-sm font-bold leading-tight">Central de Alertas</h3>
                <p className="text-xs text-muted-foreground leading-tight">O que precisa de atenção agora, em toda a empresa.</p>
              </div>
            </header>
            <DashboardAlertCenter widgets={payload.alerts} onNavigate={onNavigate} fetchedAt={fetchedAt} maxVisible={CENTRO_OPERACOES_MAX_ALERTS_VISIBLE} />
          </section>

          {payload.kpis.length > 0 && (
            <section className="space-y-3 rounded-xl bg-muted/30 p-4">
              <header className="flex items-center gap-2">
                <Gauge className="w-4 h-4 text-primary" />
                <div>
                  <h3 className="text-sm font-bold leading-tight">Indicadores Operacionais</h3>
                  <p className="text-xs text-muted-foreground leading-tight">Um número por frente de trabalho — abra o módulo para o detalhe completo.</p>
                </div>
              </header>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {payload.kpis.map((kpi) => {
                  const Icon = PROFILE_ICONS[kpi.profile]
                  return (
                    <DashboardModuleSummaryCard
                      key={kpi.widget.id}
                      label={kpi.label}
                      data={kpi.widget.data as DashboardCardData}
                      icon={<Icon className="w-6 h-6 text-primary" />}
                      onOpen={() => onNavigate(kpi.linkModule)}
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
