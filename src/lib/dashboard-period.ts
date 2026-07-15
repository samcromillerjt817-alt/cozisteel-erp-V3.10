import type { DashboardPeriod } from '@/app/services/dashboard-types'

// Fonte única de resolução do filtro global de período do Dashboard (Fase 11, ADR-017, Subetapa 6) —
// toda rota/perfil chama só `resolveDashboardPeriod()`, nunca faz seu próprio `new Date(param)`.
// Isso é o que garante todos os dashboards consumindo exatamente a mesma janela, sem duplicar lógica
// de parsing/default entre rotas ou widgets.

const MS_PER_DAY = 24 * 60 * 60 * 1000
const DEFAULT_PRESET_DAYS = 30

function parseDate(value: string): Date | undefined {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date
}

/**
 * `period=30d` (padrão) | `period=90d` | `period=custom` com `from`/`to` (formato ISO). Se `custom`
 * for pedido mas nenhuma data válida vier junto, cai no preset padrão (30 dias) — nunca devolve um
 * período totalmente aberto, para não permitir uma varredura sem corte numa tabela sem purge
 * (ADR-017 §12).
 */
export function resolveDashboardPeriod(params: URLSearchParams, now: Date = new Date()): DashboardPeriod {
  const presetParam = params.get('period')
  const fromParam = params.get('from')
  const toParam = params.get('to')

  const wantsCustom = presetParam === 'custom' || (!presetParam && (fromParam !== null || toParam !== null))
  if (wantsCustom) {
    const from = fromParam ? parseDate(fromParam) : undefined
    const to = toParam ? parseDate(toParam) : undefined
    if (from || to) return { from, to }
  }

  const days = presetParam === '90d' ? 90 : DEFAULT_PRESET_DAYS
  return { from: new Date(now.getTime() - days * MS_PER_DAY), to: now }
}
