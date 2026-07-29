import { TrendingUp, TrendingDown, Minus, type LucideIcon } from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import type { DashboardCardData } from '@/app/services/dashboard-types'

/**
 * Extraído de `DashboardWidgetCard`/`DashboardModuleSummaryCard` (eram duplicados verbatim) —
 * "sucesso"/"crítico" usam os tokens semânticos novos (ver globals.css), não mais
 * text-emerald-600/text-red-600 crus.
 */
export const TREND_STYLE: Record<NonNullable<DashboardCardData['trend']>, { icon: LucideIcon; colorClass: string }> = {
  up: { icon: TrendingUp, colorClass: 'text-ms-success' },
  down: { icon: TrendingDown, colorClass: 'text-ms-critical' },
  stable: { icon: Minus, colorClass: 'text-muted-foreground' },
}

export function formatIndicatorValue(data: Pick<DashboardCardData, 'value' | 'format'>): string | number {
  if (data.format === 'currency' && typeof data.value === 'number') return formatCurrency(data.value)
  return data.value
}
