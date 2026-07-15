import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { canAccessProfile, getAccessibleProfiles } from '@/app/services/dashboard-access.service'
import { getDashboard, registerWidget } from '@/app/services/dashboard-widgets.service'
import { getOrCompute, invalidate, clearAll } from '@/lib/dashboard-cache'
import { buildPeriodFilter } from '@/app/repositories/dashboard.repository'
import { DASHBOARD_WIDGET_CATALOG, getCatalogEntry, getPendingWidgets, getImplementedWidgets, getWidgetsByKind } from '@/app/services/dashboard-widget-catalog'
import type { DashboardWidgetDTO } from '@/app/services/dashboard-types'

/**
 * Fase 11 (Dashboard e KPIs), Subetapa 1 (ADR-017) — infraestrutura de widgets modulares: tabela de
 * acesso perfil→Role (decisão #1), catálogo/composição de widgets (Diretoria/PCP compõem sobre os
 * demais perfis, nunca duplicam widget), cache genérico em memória (decisão #2), e o helper de
 * filtro de período (ADR-017 §12). Nenhum widget de domínio real existe ainda — só a infraestrutura.
 */
describe('Dashboard — RBAC composto por perfil (dashboard-access.service)', () => {
  it('perfis 1:1 só aceitam o Role homônimo, além de admin/manager', () => {
    expect(canAccessProfile('comercial', 'comercial')).toBe(true)
    expect(canAccessProfile('admin', 'comercial')).toBe(true)
    expect(canAccessProfile('manager', 'comercial')).toBe(true)
    expect(canAccessProfile('compras', 'comercial')).toBe(false)
    expect(canAccessProfile('estoque', 'comercial')).toBe(false)
  })

  it('Diretoria só é acessível a admin/manager', () => {
    expect(canAccessProfile('admin', 'diretoria')).toBe(true)
    expect(canAccessProfile('manager', 'diretoria')).toBe(true)
    expect(canAccessProfile('comercial', 'diretoria')).toBe(false)
    expect(canAccessProfile('producao', 'diretoria')).toBe(false)
  })

  it('PCP é acessível a producao, além de admin/manager — nunca a compras/estoque/comercial', () => {
    expect(canAccessProfile('producao', 'pcp')).toBe(true)
    expect(canAccessProfile('admin', 'pcp')).toBe(true)
    expect(canAccessProfile('manager', 'pcp')).toBe(true)
    expect(canAccessProfile('compras', 'pcp')).toBe(false)
    expect(canAccessProfile('estoque', 'pcp')).toBe(false)
    expect(canAccessProfile('comercial', 'pcp')).toBe(false)
  })

  it('Administrativo é exclusivo de admin — nem manager tem acesso', () => {
    expect(canAccessProfile('admin', 'administrativo')).toBe(true)
    expect(canAccessProfile('manager', 'administrativo')).toBe(false)
    expect(canAccessProfile('financeiro', 'administrativo')).toBe(false)
  })

  it('getAccessibleProfiles(role) devolve exatamente os perfis esperados por Role', () => {
    expect(getAccessibleProfiles('comercial').sort()).toEqual(['comercial'])
    expect(getAccessibleProfiles('producao').sort()).toEqual(['pcp', 'producao'].sort())
    expect(getAccessibleProfiles('admin').sort()).toEqual(
      ['diretoria', 'comercial', 'compras', 'producao', 'estoque', 'pcp', 'administrativo', 'financeiro'].sort()
    )
    // Hardening pós-11.5, Prioridade 2: `financeiro` ganhou seu próprio perfil no Dashboard v2 —
    // antes disto, era o único Role com `dashboard: ['read']` que nunca aparecia em nenhum perfil.
    expect(getAccessibleProfiles('financeiro')).toEqual(['financeiro'])
  })
})

describe('Dashboard — cache genérico em memória (dashboard-cache)', () => {
  it('getOrCompute só chama compute() uma vez enquanto o TTL não expira', async () => {
    let calls = 0
    const key = `teste:${Date.now()}`
    const compute = async () => {
      calls++
      return 'valor'
    }

    const first = await getOrCompute(key, 60, compute)
    const second = await getOrCompute(key, 60, compute)

    expect(first).toBe('valor')
    expect(second).toBe('valor')
    expect(calls).toBe(1)
  })

  it('recalcula após invalidate()', async () => {
    let calls = 0
    const key = `teste-invalidate:${Date.now()}`
    const compute = async () => {
      calls++
      return calls
    }

    await getOrCompute(key, 60, compute)
    invalidate(key)
    await getOrCompute(key, 60, compute)

    expect(calls).toBe(2)
  })

  it('recalcula depois que o TTL expira', async () => {
    let calls = 0
    const key = `teste-ttl:${Date.now()}`
    const compute = async () => {
      calls++
      return calls
    }

    await getOrCompute(key, 0, compute)
    await new Promise((resolve) => setTimeout(resolve, 10))
    await getOrCompute(key, 0, compute)

    expect(calls).toBe(2)
  })
})

describe('Dashboard — filtro de período (dashboard.repository)', () => {
  it('devolve undefined sem from/to (evita WHERE vazio em consulta de estado atual)', () => {
    expect(buildPeriodFilter()).toBeUndefined()
  })

  it('monta gte/lte só com os limites informados', () => {
    const from = new Date('2026-01-01')
    const to = new Date('2026-01-31')
    expect(buildPeriodFilter(from, to)).toEqual({ gte: from, lte: to })
    expect(buildPeriodFilter(from)).toEqual({ gte: from })
    expect(buildPeriodFilter(undefined, to)).toEqual({ lte: to })
  })
})

describe('Dashboard — integridade do catálogo central (dashboard-widget-catalog)', () => {
  it('não tem ids duplicados', () => {
    const ids = DASHBOARD_WIDGET_CATALOG.map((entry) => entry.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('toda entrada tem nome/categoria/perfilPadrao/faseRoadmap preenchidos', () => {
    for (const entry of DASHBOARD_WIDGET_CATALOG) {
      expect(entry.nome.length).toBeGreaterThan(0)
      expect(entry.categoria.length).toBeGreaterThan(0)
      expect(entry.perfilPadrao.length).toBeGreaterThan(0)
      expect(entry.faseRoadmap.length).toBeGreaterThan(0)
    }
  })

  it('pendentes + implementados sempre soma o total do catálogo (nenhuma entrada perdida)', () => {
    expect(getPendingWidgets().length + getImplementedWidgets().length).toBe(DASHBOARD_WIDGET_CATALOG.length)
  })

  it('getCatalogEntry devolve undefined para um id inexistente', () => {
    expect(getCatalogEntry('nao-existe')).toBeUndefined()
  })

  it('todo widget tem kind válido (alert/kpi/detail) — ADR-019, Subetapa 7.1', () => {
    for (const entry of DASHBOARD_WIDGET_CATALOG) {
      expect(['alert', 'kpi', 'detail']).toContain(entry.kind)
    }
  })

  it('linkToModule só existe em widgets kind=alert (nunca em kpi/detail)', () => {
    for (const entry of DASHBOARD_WIDGET_CATALOG) {
      if (entry.kind === 'alert') {
        expect(entry.linkToModule).toBeTruthy()
      } else {
        expect(entry.linkToModule).toBeUndefined()
      }
    }
  })

  it('getWidgetsByKind separa corretamente os 3 grupos, somando o total do catálogo', () => {
    const alerts = getWidgetsByKind('alert')
    const kpis = getWidgetsByKind('kpi')
    const details = getWidgetsByKind('detail')
    expect(alerts.length + kpis.length + details.length).toBe(DASHBOARD_WIDGET_CATALOG.length)
    expect(alerts.length).toBeGreaterThan(0)
    expect(kpis.length).toBeGreaterThan(0)
    expect(details.length).toBeGreaterThan(0)
  })
})

describe('Dashboard — catálogo e composição de widgets (dashboard-widgets.service)', () => {
  const makeWidget = (id: string): DashboardWidgetDTO => ({ id, type: 'card', title: id, order: 0, data: { value: 1 } })

  // Ids reais do catálogo central (dashboard-widget-catalog.ts) — registerWidget() rejeita qualquer
  // id que não exista lá, então os testes usam widgets do plano real, ainda não implementados.
  beforeAll(() => {
    registerWidget({ id: 'comercial.orcamentos-por-status', sourceProfiles: ['comercial'], expensive: false, compute: async () => makeWidget('comercial.orcamentos-por-status') })
    registerWidget({ id: 'estoque.saldo-atual', sourceProfiles: ['estoque'], expensive: false, compute: async () => makeWidget('estoque.saldo-atual') })
    registerWidget({ id: 'producao.wip-total', sourceProfiles: ['producao'], expensive: true, compute: async () => makeWidget('producao.wip-total') })
  })

  it('um perfil de conteúdo próprio só recebe os widgets do seu domínio', async () => {
    const payload = await getDashboard('comercial')
    expect(payload.profile).toBe('comercial')
    expect(payload.widgets.map((w) => w.id)).toContain('comercial.orcamentos-por-status')
    expect(payload.widgets.map((w) => w.id)).not.toContain('estoque.saldo-atual')
  })

  it('PCP compõe os widgets de Produção e Estoque, sem duplicar lógica', async () => {
    const payload = await getDashboard('pcp')
    const ids = payload.widgets.map((w) => w.id)
    expect(ids).toContain('estoque.saldo-atual')
    expect(ids).toContain('producao.wip-total')
    expect(ids).not.toContain('comercial.orcamentos-por-status')
  })

  it('Diretoria compõe a união de todos os widgets registrados', async () => {
    const payload = await getDashboard('diretoria')
    const ids = payload.widgets.map((w) => w.id)
    expect(ids).toContain('comercial.orcamentos-por-status')
    expect(ids).toContain('estoque.saldo-atual')
    expect(ids).toContain('producao.wip-total')
  })

  it('widget marcado como caro passa pelo cache (computa uma única vez)', async () => {
    let calls = 0
    registerWidget({
      id: 'estoque.materiais-mais-consumidos',
      sourceProfiles: ['estoque'],
      expensive: true,
      compute: async () => {
        calls++
        return makeWidget('estoque.materiais-mais-consumidos')
      },
    })

    await getDashboard('estoque')
    await getDashboard('estoque')

    expect(calls).toBe(1)
  })

  it('rejeita registrar um widget cujo id não existe no catálogo central', () => {
    expect(() =>
      registerWidget({ id: 'inventado.fora-do-catalogo', sourceProfiles: ['comercial'], expensive: false, compute: async () => makeWidget('inventado.fora-do-catalogo') })
    ).toThrow()
  })

  afterAll(() => {
    clearAll()
  })
})
