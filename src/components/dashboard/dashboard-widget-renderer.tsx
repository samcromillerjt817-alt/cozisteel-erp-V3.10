import type { ReactNode } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { DashboardChart } from '@/components/dashboard/dashboard-chart'
import { DashboardWidgetCard } from '@/components/dashboard/dashboard-widget-card'
import { DashboardWidgetTable } from '@/components/dashboard/dashboard-widget-table'
import type { DashboardWidgetDTO, DashboardCardData, DashboardChartData, DashboardTableData } from '@/app/services/dashboard-types'

interface DashboardWidgetRendererProps {
  widget: DashboardWidgetDTO
  icon: ReactNode
}

/**
 * Dispatcher único por `widget.type` (Fase 11, ADR-017, Subetapa 7) — nenhuma regra de negócio aqui,
 * só decide QUAL componente de exibição usar. Cards de KPI ganham o tratamento de ícone em círculo
 * (mesmo padrão do dashboard atual); gráficos e tabelas usam um cabeçalho simples com o título do
 * widget, já que precisam de mais espaço horizontal.
 */
export function DashboardWidgetRenderer({ widget, icon }: DashboardWidgetRendererProps) {
  if (widget.type === 'card') {
    return <DashboardWidgetCard title={widget.title} data={widget.data as DashboardCardData} icon={icon} />
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{widget.title}</CardTitle>
      </CardHeader>
      <CardContent>
        {widget.type === 'chart' && <DashboardChart data={widget.data as DashboardChartData} />}
        {widget.type === 'table' && <DashboardWidgetTable data={widget.data as DashboardTableData} />}
      </CardContent>
    </Card>
  )
}
