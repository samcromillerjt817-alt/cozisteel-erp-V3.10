'use client'

import type { ReactNode } from 'react'
import { ArrowRight } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { TREND_STYLE, formatIndicatorValue } from '@/lib/dashboard-trend'
import { useCountUp } from '@/lib/use-count-up'
import type { DashboardCardData } from '@/app/services/dashboard-types'

type DashboardIndicatorCardProps =
  | { variant: 'wide'; title: string; data: DashboardCardData; icon: ReactNode }
  | { variant: 'compact'; label: string; data: DashboardCardData; icon: ReactNode; onOpen: () => void }

/**
 * Substitui `DashboardWidgetCard` (variant="wide", usado nas abas de perfil) e
 * `DashboardModuleSummaryCard` (variant="compact", usado na Diretoria/Centro de Operações) — eram
 * dois componentes quase-idênticos com TREND_STYLE duplicado verbatim. As DUAS anatomias são
 * preservadas exatamente como estavam (não são a mesma coisa por acidente): "wide" põe o ícone GRANDE
 * ao lado do valor; "compact" põe o ícone pequeno em cima e o valor sozinho embaixo, porque a anatomia
 * "wide" truncava valores em grades de 5 colunas (achado do usuário, ADR-019 Subetapa 7.5) — nunca
 * volte a unificar o layout em si, só a lógica de trend/formatação estava duplicada.
 */
export function DashboardIndicatorCard(props: DashboardIndicatorCardProps) {
  const trend = props.data.trend ? TREND_STYLE[props.data.trend] : null
  const TrendIcon = trend?.icon
  // Contagem de 0 até o valor real só quando é um número puro (não moeda) — "R$ 0,00" subindo até
  // "R$ 891,20" em incrementos intermediários lê como errado; só um contador inteiro simples (ex.: "4
  // materiais") ganha com o efeito de instrumento se calibrando. useCountUp já respeita
  // prefers-reduced-motion (retorna o valor final direto).
  const numericTarget = typeof props.data.value === 'number' && props.data.format !== 'currency' ? props.data.value : null
  const countedValue = useCountUp(numericTarget ?? 0)
  const displayValue = numericTarget !== null ? countedValue : formatIndicatorValue(props.data)

  if (props.variant === 'wide') {
    return (
      <Card className="rounded-ms-lg overflow-hidden">
        <CardContent className="p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            {props.icon}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-muted-foreground truncate">{props.title}</p>
            <div className="flex items-baseline gap-2 flex-wrap">
              <p className="text-2xl font-bold tabular-nums truncate">{displayValue}</p>
              {trend && TrendIcon && (
                <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${trend.colorClass}`}>
                  <TrendIcon className="w-3.5 h-3.5" />
                  {props.data.trendValue}
                </span>
              )}
            </div>
            {props.data.trendLabel && <p className="text-xs text-muted-foreground truncate">{props.data.trendLabel}</p>}
            {props.data.hint && <p className="text-xs text-muted-foreground truncate" title={props.data.hint}>{props.data.hint}</p>}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="rounded-ms-lg overflow-hidden">
      <CardContent className="p-5 flex flex-col gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 [&_svg]:w-4 [&_svg]:h-4">
            {props.icon}
          </div>
          <p className="text-sm text-muted-foreground truncate">{props.label}</p>
        </div>
        <div className="flex items-baseline gap-2 flex-wrap">
          <p className="text-xl font-bold tabular-nums truncate">{displayValue}</p>
          {trend && TrendIcon && (
            <span className={`inline-flex items-center gap-0.5 text-xs font-semibold shrink-0 ${trend.colorClass}`}>
              <TrendIcon className="w-3.5 h-3.5" />
              {props.data.trendValue}
            </span>
          )}
        </div>
        <Button variant="ghost" size="sm" className="w-full justify-start px-0 h-auto text-sm font-medium" onClick={props.onOpen}>
          Ver mais <ArrowRight className="w-3.5 h-3.5" />
        </Button>
      </CardContent>
    </Card>
  )
}
