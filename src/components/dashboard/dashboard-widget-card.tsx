import type { ReactNode } from 'react'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { formatCurrency } from '@/lib/format'
import type { DashboardCardData } from '@/app/services/dashboard-types'

interface DashboardWidgetCardProps {
  title: string
  data: DashboardCardData
  icon: ReactNode
}

const TREND_STYLE = {
  up: { icon: TrendingUp, color: 'text-emerald-600' },
  down: { icon: TrendingDown, color: 'text-red-600' },
  stable: { icon: Minus, color: 'text-muted-foreground' },
} as const

/**
 * Renderiza `type: 'card'` — mesmo padrão visual (ícone em círculo + rótulo + valor) já usado no
 * dashboard atual (`page.tsx`, seção `activeModule === 'dashboard'`), para consistência visual entre
 * os dois. Puramente de exibição, nenhum cálculo — o valor já vem pronto da API.
 *
 * Tendência (`data.trend`, ADR-019 Subetapa 7.4) é opcional e só aparece quando o backend a envia —
 * nenhum widget preenche esse campo ainda (exige histórico período-a-período, fora do escopo desta
 * subetapa), mas o layout já reserva o espaço e o formato final, sem precisar mudar depois.
 */
export function DashboardWidgetCard({ title, data, icon }: DashboardWidgetCardProps) {
  const trend = data.trend ? TREND_STYLE[data.trend] : null
  const TrendIcon = trend?.icon
  const displayValue = data.format === 'currency' && typeof data.value === 'number' ? formatCurrency(data.value) : data.value

  return (
    <Card className="rounded-xl overflow-hidden">
      <CardContent className="p-5 flex items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-muted-foreground truncate">{title}</p>
          <div className="flex items-baseline gap-2 flex-wrap">
            <p className="text-2xl font-bold tabular-nums truncate">{displayValue}</p>
            {trend && TrendIcon && (
              <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${trend.color}`}>
                <TrendIcon className="w-3.5 h-3.5" />
                {data.trendValue}
              </span>
            )}
          </div>
          {data.trendLabel && <p className="text-[11px] text-muted-foreground truncate">{data.trendLabel}</p>}
          {data.hint && <p className="text-xs text-muted-foreground truncate" title={data.hint}>{data.hint}</p>}
        </div>
      </CardContent>
    </Card>
  )
}
