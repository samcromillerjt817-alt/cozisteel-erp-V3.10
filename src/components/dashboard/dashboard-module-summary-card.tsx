import type { ReactNode } from 'react'
import { ArrowRight, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/format'
import type { DashboardCardData } from '@/app/services/dashboard-types'

interface DashboardModuleSummaryCardProps {
  label: string
  data: DashboardCardData
  icon: ReactNode
  onOpen: () => void
}

const TREND_STYLE = {
  up: { icon: TrendingUp, color: 'text-emerald-600' },
  down: { icon: TrendingDown, color: 'text-red-600' },
  stable: { icon: Minus, color: 'text-muted-foreground' },
} as const

/**
 * Card do "Resumo por Módulo" da Diretoria (ADR-019, Subetapa 7.5) — mesma anatomia visual de
 * `DashboardWidgetCard` (ícone em círculo + rótulo + valor), com um botão "Ver mais →" que os KPIs
 * comuns não têm: aqui o card É o ponto de entrada pra aquele módulo, não só um número pra olhar. Texto
 * do botão é o mesmo copy curto já aprovado no mockup (Seção 3.1 do ADR-019) — "Ver detalhes de X" foi
 * tentado na primeira versão e estourava a largura do card em telas de 5 colunas (o `Button` base tem
 * `whitespace-nowrap`, então texto mais longo que o card vaza em vez de quebrar linha).
 *
 * Deliberadamente NÃO mostra `data.hint` (achado do usuário: hints longos — ex. "A receber: R$ 0,00 ·
 * A pagar: R$ 0,00" — cortavam no meio em 5 colunas, ilegível mesmo truncado). O mockup aprovado (Seção
 * 3.1) nunca teve uma 2ª linha de texto sob o valor — só rótulo + número + botão. O hint completo
 * continua disponível na própria aba do módulo (`DashboardWidgetCard`, mais largo, cabe o texto todo).
 *
 * Layout em 2 linhas (ícone+rótulo compactos em cima, valor em largura cheia embaixo) — achado do
 * usuário: a anatomia original (ícone grande ao LADO do valor, mesma de `DashboardWidgetCard`) deixava
 * pouco espaço horizontal pro número em 5 colunas, truncando até "R$ 15.960,00" pra "R$ 15…". Aqui o
 * valor nunca disputa espaço com o ícone.
 */
export function DashboardModuleSummaryCard({ label, data, icon, onOpen }: DashboardModuleSummaryCardProps) {
  const trend = data.trend ? TREND_STYLE[data.trend] : null
  const TrendIcon = trend?.icon
  const displayValue = data.format === 'currency' && typeof data.value === 'number' ? formatCurrency(data.value) : data.value

  return (
    <Card className="rounded-xl overflow-hidden">
      <CardContent className="p-5 flex flex-col gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 [&_svg]:w-4 [&_svg]:h-4">
            {icon}
          </div>
          <p className="text-sm text-muted-foreground truncate">{label}</p>
        </div>
        <div className="flex items-baseline gap-2 flex-wrap">
          <p className="text-xl font-bold tabular-nums truncate">{displayValue}</p>
          {trend && TrendIcon && (
            <span className={`inline-flex items-center gap-0.5 text-xs font-semibold shrink-0 ${trend.color}`}>
              <TrendIcon className="w-3.5 h-3.5" />
              {data.trendValue}
            </span>
          )}
        </div>
        <Button variant="ghost" size="sm" className="w-full justify-start px-0 h-auto text-sm font-medium" onClick={onOpen}>
          Ver mais <ArrowRight className="w-3.5 h-3.5" />
        </Button>
      </CardContent>
    </Card>
  )
}
