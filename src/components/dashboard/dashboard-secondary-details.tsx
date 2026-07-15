'use client'

import { useState, type ReactNode } from 'react'
import { Search, ChevronDown, ChevronUp } from 'lucide-react'
import { DashboardWidgetRenderer } from '@/components/dashboard/dashboard-widget-renderer'
import type { DashboardWidgetDTO } from '@/app/services/dashboard-types'

interface DashboardSecondaryDetailsProps {
  cards: DashboardWidgetDTO[]
  charts: DashboardWidgetDTO[]
  tables: DashboardWidgetDTO[]
  icon: ReactNode
}

/**
 * Análises Detalhadas (ADR-019, Subetapa 7.4, mockup aprovado pelo usuário) — a camada de EXPLORAÇÃO
 * do dashboard, deliberadamente separada da Ação (Central de Alertas) e do Resumo (KPI Row): o
 * usuário entra para agir, não para analisar, então este bloco fica **fechado por padrão sempre**
 * (mesmo em telas grandes — diretriz permanente de zero-scroll do ADR-019) e usa uma identidade
 * visualmente neutra/consultiva (cinza, borda tracejada, sem as cores de severidade nem o `primary`
 * do Resumo) — o espaçamento e o tom sozinhos já comunicam "isso é opcional", mesmo sem ler o texto.
 * Nenhuma lógica nova: só reorganiza a exibição dos widgets `kind==='detail'`, mesmo agrupamento por
 * tipo (Indicadores/Gráficos/Tabelas) que já existia soltas na página antes desta subetapa.
 */
export function DashboardSecondaryDetails({ cards, charts, tables, icon }: DashboardSecondaryDetailsProps) {
  const [expanded, setExpanded] = useState(false)
  const total = cards.length + charts.length + tables.length
  if (total === 0) return null

  return (
    <section className="rounded-xl border border-dashed border-muted-foreground/30 bg-muted/10 mt-2">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between gap-3 p-4 text-left"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <Search className="w-4 h-4 text-muted-foreground shrink-0" />
          <div className="min-w-0">
            <h3 className="text-sm font-semibold leading-tight text-muted-foreground">Análises detalhadas</h3>
            <p className="text-xs text-muted-foreground/80 leading-tight truncate">
              Indicadores históricos, gráficos e métricas para acompanhamento.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 text-xs text-muted-foreground">
          <span className="tabular-nums">{total} indicador{total === 1 ? '' : 'es'}</span>
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-5 border-t border-dashed border-muted-foreground/30 pt-4">
          {cards.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Indicadores</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {cards.map((widget) => (
                  <DashboardWidgetRenderer key={widget.id} widget={widget} icon={icon} />
                ))}
              </div>
            </div>
          )}

          {charts.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Gráficos</h4>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {charts.map((widget) => (
                  <DashboardWidgetRenderer key={widget.id} widget={widget} icon={null} />
                ))}
              </div>
            </div>
          )}

          {tables.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tabelas analíticas</h4>
              <div className="space-y-4">
                {tables.map((widget) => (
                  <DashboardWidgetRenderer key={widget.id} widget={widget} icon={null} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
