import type { ReactNode } from 'react'
import { DashboardWidgetRenderer } from '@/components/dashboard/dashboard-widget-renderer'
import type { DashboardWidgetDTO } from '@/app/services/dashboard-types'

interface DashboardKpiRowProps {
  widgets: DashboardWidgetDTO[] // já filtrados para catalogEntry.kind === 'kpi' por quem chama
  icon: ReactNode
}

/**
 * Resumo — KPIs headline (ADR-019, Subetapa 7.3) — o "termômetro" sempre visível de cada perfil, uma
 * camada acima do detalhe analítico (Subetapa 7.4). Nenhuma lógica de renderização própria: delega a
 * cada widget para `DashboardWidgetRenderer` (mesmo dispatcher card/chart/table já usado em todo o
 * dashboard), só separa cards compactos (grade densa) de gráficos-resumo (mais largos).
 */
export function DashboardKpiRow({ widgets, icon }: DashboardKpiRowProps) {
  if (widgets.length === 0) return null
  const cards = widgets.filter((w) => w.type === 'card')
  const charts = widgets.filter((w) => w.type !== 'card')

  return (
    <div className="space-y-3">
      {cards.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {cards.map((widget) => (
            <DashboardWidgetRenderer key={widget.id} widget={widget} icon={icon} />
          ))}
        </div>
      )}
      {charts.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {charts.map((widget) => (
            <DashboardWidgetRenderer key={widget.id} widget={widget} icon={null} />
          ))}
        </div>
      )}
    </div>
  )
}
