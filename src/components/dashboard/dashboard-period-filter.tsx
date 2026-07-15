'use client'

import { Button } from '@/components/ui/button'

export type DashboardPeriodPreset = '30d' | '90d' | 'custom'

interface DashboardPeriodFilterProps {
  value: DashboardPeriodPreset
  customFrom: string
  customTo: string
  onChange: (preset: DashboardPeriodPreset) => void
  onCustomChange: (from: string, to: string) => void
}

/**
 * Filtro global de período (Fase 11, ADR-017, Subetapa 7) — só emite os parâmetros que a API espera
 * (`period`, `from`, `to`); NUNCA calcula a janela de datas no cliente. A resolução real (30/90 dias,
 * fallback para datas inválidas) acontece inteiramente no backend (`resolveDashboardPeriod`,
 * Subetapa 6) — este componente é um controle de UI puro.
 */
export function DashboardPeriodFilter({ value, customFrom, customTo, onChange, onCustomChange }: DashboardPeriodFilterProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant={value === '30d' ? 'default' : 'outline'} onClick={() => onChange('30d')}>
        30 dias
      </Button>
      <Button size="sm" variant={value === '90d' ? 'default' : 'outline'} onClick={() => onChange('90d')}>
        90 dias
      </Button>
      <Button size="sm" variant={value === 'custom' ? 'default' : 'outline'} onClick={() => onChange('custom')}>
        Personalizado
      </Button>
      {value === 'custom' && (
        <div className="flex items-center gap-2">
          <input
            type="date"
            className="h-8 rounded-md border px-2 text-sm bg-background"
            value={customFrom}
            onChange={(e) => onCustomChange(e.target.value, customTo)}
          />
          <span className="text-sm text-muted-foreground">até</span>
          <input
            type="date"
            className="h-8 rounded-md border px-2 text-sm bg-background"
            value={customTo}
            onChange={(e) => onCustomChange(customFrom, e.target.value)}
          />
        </div>
      )}
    </div>
  )
}
