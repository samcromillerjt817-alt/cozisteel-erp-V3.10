import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { db } from '@/lib/db'
import bcrypt from 'bcryptjs'
import '@/app/services/dashboard-bootstrap'
import { getDashboard } from '@/app/services/dashboard-widgets.service'
import { DASHBOARD_WIDGET_CATALOG, getImplementedWidgets } from '@/app/services/dashboard-widget-catalog'

/**
 * Fase 11 (Dashboard e KPIs), Subetapa 5 (ADR-017) — último perfil de conteúdo: os 4 widgets reais de
 * Administrativo, e confirmação de que Diretoria continua sendo pura composição (sem widget próprio,
 * sem duplicar lógica, preservando ordenação/permissões já existentes desde a Subetapa 1).
 */
describe('Dashboard Administrativo + Diretoria — widgets reais (Subetapa 5)', () => {
  const PERIOD = { from: new Date('2020-06-01'), to: new Date('2020-07-01') }
  const userIds: string[] = []
  const auditLogIds: string[] = []
  const patchLogIds: string[] = []

  beforeAll(async () => {
    const passwordHash = await bcrypt.hash('teste123', 4)
    const activeUser = await db.user.create({ data: { username: `dash-admin-ativo-${Date.now()}`, name: 'Ativo', password: passwordHash, role: 'financeiro', active: true } })
    const inactiveUser = await db.user.create({ data: { username: `dash-admin-inativo-${Date.now()}`, name: 'Inativo', password: passwordHash, role: 'financeiro', active: false } })
    userIds.push(activeUser.id, inactiveUser.id)

    const log1 = await db.auditLog.create({ data: { userId: activeUser.id, action: 'CREATE', module: 'dashboard-teste', createdAt: new Date('2020-06-05') } })
    const log2 = await db.auditLog.create({ data: { userId: activeUser.id, action: 'UPDATE', module: 'dashboard-teste', createdAt: new Date('2020-06-06') } })
    auditLogIds.push(log1.id, log2.id)

    const patch1 = await db.patchLog.create({ data: { fromVersion: '9.9.1', toVersion: '9.9.2', status: 'success', createdAt: new Date('2099-01-01') } })
    const patch2 = await db.patchLog.create({ data: { fromVersion: '9.9.2', toVersion: '9.9.3', status: 'success', createdAt: new Date('2099-01-02') } })
    patchLogIds.push(patch1.id, patch2.id)
  })

  afterAll(async () => {
    await db.patchLog.deleteMany({ where: { id: { in: patchLogIds } } })
    await db.auditLog.deleteMany({ where: { id: { in: auditLogIds } } })
    await db.user.deleteMany({ where: { id: { in: userIds } } })
  })

  it('catálogo confirma as 48/48 entradas implementadas (todos os perfis de conteúdo concluídos)', () => {
    expect(getImplementedWidgets().length).toBe(DASHBOARD_WIDGET_CATALOG.length)
  })

  it('getDashboard("administrativo") devolve os 4 widgets do catálogo', async () => {
    const payload = await getDashboard('administrativo', PERIOD)
    const catalogIds = DASHBOARD_WIDGET_CATALOG.filter((e) => e.categoria === 'administrativo').map((e) => e.id)
    const payloadIds = payload.widgets.map((w) => w.id)
    for (const id of catalogIds) expect(payloadIds).toContain(id)
    expect(payload.widgets.length).toBe(catalogIds.length)
  })

  it('usuarios-ativos-por-papel só conta o usuário active=true (delta +1, não +2)', async () => {
    const before = await db.user.count({ where: { active: true, id: { notIn: userIds } } })
    const payload = await getDashboard('administrativo')
    const widget = payload.widgets.find((w) => w.id === 'administrativo.usuarios-ativos-por-papel')!
    const data = widget.data as unknown as { series: { data: { x: string; y: number }[] }[] }
    const total = data.series[0].data.reduce((sum, d) => sum + d.y, 0)
    expect(total).toBe(before + 1) // só o usuário ativo; o inativo não entra
  })

  it('volume-auditoria-por-periodo respeita o filtro global de período (só os 2 logs da janela)', async () => {
    const payload = await getDashboard('administrativo', PERIOD)
    const widget = payload.widgets.find((w) => w.id === 'administrativo.volume-auditoria-por-periodo')!
    const data = widget.data as unknown as { series: { data: { x: string; y: number }[] }[] }
    const testeModule = data.series[0].data.find((d) => d.x === 'dashboard-teste')
    expect(testeModule?.y).toBe(2)

    // Fora do período, os logs sintéticos não devem aparecer.
    const outsidePeriod = { from: new Date('2019-01-01'), to: new Date('2019-02-01') }
    const payloadOutside = await getDashboard('administrativo', outsidePeriod)
    const widgetOutside = payloadOutside.widgets.find((w) => w.id === 'administrativo.volume-auditoria-por-periodo')!
    const dataOutside = widgetOutside.data as unknown as { series: { data: { x: string; y: number }[] }[] }
    expect(dataOutside.series[0].data.find((d) => d.x === 'dashboard-teste')).toBeUndefined()
  })

  it('sequencias-numeracao é somente leitura — não altera NumberSequence', async () => {
    const before = await db.numberSequence.findMany()
    const payload = await getDashboard('administrativo')
    const after = await db.numberSequence.findMany()
    expect(after.length).toBe(before.length)
    const widget = payload.widgets.find((w) => w.id === 'administrativo.sequencias-numeracao')!
    const data = widget.data as unknown as { rows: unknown[] }
    expect(Array.isArray(data.rows)).toBe(true)
  })

  it('ultimas-execucoes-patch traz os mais recentes primeiro, respeitando o limite', async () => {
    const payload = await getDashboard('administrativo')
    const widget = payload.widgets.find((w) => w.id === 'administrativo.ultimas-execucoes-patch')!
    const data = widget.data as unknown as { rows: { versoes: string; createdAt: string }[] }
    expect(data.rows.length).toBeLessThanOrEqual(20)
    // Os 2 patches sintéticos (data futura, 2099) devem aparecer no topo (mais recentes de todo o banco).
    expect(data.rows[0].versoes).toBe('9.9.2 → 9.9.3')
    expect(data.rows[1].versoes).toBe('9.9.1 → 9.9.2')
  })

  // `getDashboard('diretoria')` continua existindo e sendo mantida como a composição bruta de TODO o
  // catálogo (útil para qualquer chamador futuro que precise da união completa) — a tela real da
  // Diretoria NÃO usa mais esta função desde o ADR-019 Subetapa 7.5: usa `getDiretoriaSummary()`
  // (síntese: Central de Alertas consolidada + 1 KPI headline por módulo), testada em
  // `dashboard-diretoria-summary.test.ts`.
  it('Diretoria (getDashboard, composição legada) compõe a união de TODOS os widgets do catálogo, sem duplicar nenhum id', async () => {
    const payload = await getDashboard('diretoria', PERIOD)
    const ids = payload.widgets.map((w) => w.id)
    expect(new Set(ids).size).toBe(ids.length) // sem duplicação
    for (const entry of DASHBOARD_WIDGET_CATALOG) expect(ids).toContain(entry.id)
    expect(payload.widgets.length).toBe(DASHBOARD_WIDGET_CATALOG.length)
  })

  it('Diretoria preserva a ordenação por order dentro do payload', async () => {
    const payload = await getDashboard('diretoria', PERIOD)
    const orders = payload.widgets.map((w) => w.order)
    const sorted = [...orders].sort((a, b) => a - b)
    expect(orders).toEqual(sorted)
  })
})
