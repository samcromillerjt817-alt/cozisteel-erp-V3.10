import { describe, it, expect } from 'vitest'
import { resolveDashboardPeriod } from '@/lib/dashboard-period'

/**
 * Fase 11 (Dashboard e KPIs), Subetapa 6 (ADR-017) — resolver central do filtro global de período.
 * Fonte única de verdade: toda rota/perfil chama só esta função, nunca faz seu próprio `new
 * Date(param)` — estes testes garantem o contrato que todas as rotas passam a compartilhar.
 */
describe('resolveDashboardPeriod — fonte única do filtro global de período', () => {
  const now = new Date('2026-07-10T12:00:00Z')

  it('sem parâmetros, usa o preset padrão de 30 dias', () => {
    const period = resolveDashboardPeriod(new URLSearchParams(''), now)
    expect(period.to).toEqual(now)
    expect(period.from).toEqual(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000))
  })

  it('period=30d é equivalente ao padrão', () => {
    const period = resolveDashboardPeriod(new URLSearchParams('period=30d'), now)
    expect(period.from).toEqual(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000))
    expect(period.to).toEqual(now)
  })

  it('period=90d usa uma janela de 90 dias', () => {
    const period = resolveDashboardPeriod(new URLSearchParams('period=90d'), now)
    expect(period.from).toEqual(new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000))
    expect(period.to).toEqual(now)
  })

  it('period=custom com from/to usa exatamente as datas informadas', () => {
    const period = resolveDashboardPeriod(new URLSearchParams('period=custom&from=2020-01-01&to=2020-01-31'), now)
    expect(period.from).toEqual(new Date('2020-01-01'))
    expect(period.to).toEqual(new Date('2020-01-31'))
  })

  it('from/to sem period explícito também é tratado como custom', () => {
    const period = resolveDashboardPeriod(new URLSearchParams('from=2021-05-01&to=2021-05-10'), now)
    expect(period.from).toEqual(new Date('2021-05-01'))
    expect(period.to).toEqual(new Date('2021-05-10'))
  })

  it('custom com só from (sem to) devolve to indefinido — filtro em aberto para frente', () => {
    const period = resolveDashboardPeriod(new URLSearchParams('period=custom&from=2020-01-01'), now)
    expect(period.from).toEqual(new Date('2020-01-01'))
    expect(period.to).toBeUndefined()
  })

  it('custom pedido mas com datas inválidas cai no preset padrão (nunca sem filtro nenhum)', () => {
    const period = resolveDashboardPeriod(new URLSearchParams('period=custom&from=nao-e-data&to=tambem-nao'), now)
    expect(period.from).toEqual(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000))
    expect(period.to).toEqual(now)
  })

  it('preset desconhecido cai no padrão de 30 dias', () => {
    const period = resolveDashboardPeriod(new URLSearchParams('period=1ano'), now)
    expect(period.from).toEqual(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000))
  })
})
