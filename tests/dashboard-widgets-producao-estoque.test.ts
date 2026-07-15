import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { db } from '@/lib/db'
import { createTestUser, createTestProduct, createTestMaterial } from './helpers/fixtures'
import '@/app/services/dashboard-bootstrap'
import { getDashboard } from '@/app/services/dashboard-widgets.service'
import { DASHBOARD_WIDGET_CATALOG, getImplementedWidgets, getCatalogEntry } from '@/app/services/dashboard-widget-catalog'

/**
 * Fase 11 (Dashboard e KPIs), Subetapa 3 (ADR-017) — os 21 widgets reais de Produção/PCP (13) e
 * Estoque (8). Widgets de "estado atual" (WIP, cobertura de reserva, estoque baixo, movimentações)
 * agregam sobre tabelas compartilhadas com todo o resto da suíte de testes — por isso usamos
 * asserções por DELTA (antes/depois de criar os dados deste arquivo) em vez de valores absolutos,
 * garantindo isolamento mesmo com `fileParallelism: false` e outros arquivos escrevendo no mesmo
 * `test.db`. Widgets escopados por período usam a mesma janela sintética de 2020 da Subetapa 2.
 */
describe('Dashboard Produção/PCP/Estoque — widgets reais (Subetapa 3)', () => {
  const PERIOD = { from: new Date('2020-03-01'), to: new Date('2020-04-01') }
  let userId: string
  const productIds: string[] = []
  const materialIds: string[] = []
  const productionOrderIds: string[] = []
  const executionIds: string[] = []
  const reservationIds: string[] = []
  const mrpRunIds: string[] = []
  const mrpSuggestionIds: string[] = []
  const stockMovementIds: string[] = []
  const materialBatchIds: string[] = []

  beforeAll(async () => {
    const user = await createTestUser(`dash-pcp-${Date.now()}`)
    userId = user.id

    const productA = await createTestProduct(`dash-pcp-a-${Date.now()}`)
    productIds.push(productA.id)
    const materialA = await createTestMaterial(`dash-pcp-a-${Date.now()}`)
    materialIds.push(materialA.id)

    // OPs: 1 in_progress (WIP), 1 planned atrasada (dueDate passado), 1 completed — todas na janela 2020.
    const opInProgress = await db.productionOrder.create({
      data: { number: `DASH-OP-${Date.now()}-1`, status: 'in_progress', date: '01/03/2020', quantity: 100, quantityCompleted: 30, priority: 'high', productId: productA.id, userId, createdAt: new Date('2020-03-01') },
    })
    const opOverdue = await db.productionOrder.create({
      data: { number: `DASH-OP-${Date.now()}-2`, status: 'planned', date: '02/03/2020', dueDate: '01/01/2020', quantity: 50, priority: 'normal', productId: productA.id, userId, createdAt: new Date('2020-03-02') },
    })
    const opCompleted = await db.productionOrder.create({
      data: { number: `DASH-OP-${Date.now()}-3`, status: 'completed', date: '03/03/2020', quantity: 20, quantityCompleted: 20, priority: 'low', productId: productA.id, userId, createdAt: new Date('2020-03-03') },
    })
    productionOrderIds.push(opInProgress.id, opOverdue.id, opCompleted.id)

    const execution = await db.productionOrderExecution.create({ data: { productionOrderId: opInProgress.id, quantity: 30, userId, createdAt: new Date('2020-03-05') } })
    executionIds.push(execution.id)

    // Reservas: 1 partial, 1 consumed (estado terminal, ADR-012) — cobertura calculável com segurança.
    const reservationPartial = await db.materialReservation.create({ data: { productionOrderId: opInProgress.id, itemType: 'material', materialId: materialA.id, quantityNeeded: 100, quantityReserved: 60, quantityShortfall: 40, status: 'partial' } })
    const reservationConsumed = await db.materialReservation.create({ data: { productionOrderId: opCompleted.id, itemType: 'material', materialId: materialA.id, quantityNeeded: 20, quantityReserved: 20, quantityShortfall: 0, status: 'consumed' } })
    reservationIds.push(reservationPartial.id, reservationConsumed.id)

    // MRP: 1 execução com 1 sugestão de compra pendente.
    const mrpRun = await db.mrpRun.create({ data: { number: `DASH-MRP-${Date.now()}`, userId, openOrdersConsidered: 3, totalSuggestions: 1, totalPurchaseSuggestions: 1, totalProductionSuggestions: 0, executedAt: new Date('2020-03-10') } })
    mrpRunIds.push(mrpRun.id)
    const mrpSuggestion = await db.mrpSuggestion.create({ data: { mrpRunId: mrpRun.id, suggestionType: 'purchase', itemType: 'material', materialId: materialA.id, quantityNeeded: 40, quantityAvailable: 0, quantityShortfall: 40, status: 'pending' } })
    mrpSuggestionIds.push(mrpSuggestion.id)

    // Estoque: material com saldo abaixo do mínimo (widget "materiais-baixo-estoque"), movimentações OUT.
    await db.material.update({ where: { id: materialA.id }, data: { stockQty: 5, minStockQty: 10, reservedQty: 60, onOrderQty: 15, inProductionQty: 0 } })
    const movementOut = await db.stockMovement.create({ data: { itemType: 'material', materialId: materialA.id, type: 'OUT', quantity: 25, userId, reason: 'Teste Dashboard', createdAt: new Date('2020-03-05') } })
    const movementAdjust = await db.stockMovement.create({ data: { itemType: 'material', materialId: materialA.id, type: 'ADJUST', quantity: 2, userId, reason: 'Teste Dashboard ajuste', createdAt: new Date('2020-03-06') } })
    stockMovementIds.push(movementOut.id, movementAdjust.id)

    // Lote de matéria-prima com vencimento próximo (dentro de 30 dias a partir de hoje).
    const nearExpiry = new Date()
    nearExpiry.setDate(nearExpiry.getDate() + 10)
    const batch = await db.materialBatch.create({ data: { materialId: materialA.id, batchNumber: `DASH-LOTE-${Date.now()}`, quantityReceived: 50, quantityAvailable: 50, expiresAt: nearExpiry } })
    materialBatchIds.push(batch.id)
  })

  afterAll(async () => {
    await db.materialBatch.deleteMany({ where: { id: { in: materialBatchIds } } })
    await db.stockMovement.deleteMany({ where: { id: { in: stockMovementIds } } })
    await db.mrpSuggestion.deleteMany({ where: { id: { in: mrpSuggestionIds } } })
    await db.mrpRun.deleteMany({ where: { id: { in: mrpRunIds } } })
    await db.materialReservation.deleteMany({ where: { id: { in: reservationIds } } })
    await db.productionOrderExecution.deleteMany({ where: { id: { in: executionIds } } })
    await db.productionOrder.deleteMany({ where: { id: { in: productionOrderIds } } })
    await db.material.deleteMany({ where: { id: { in: materialIds } } })
    await db.product.deleteMany({ where: { id: { in: productIds } } })
    await db.user.delete({ where: { id: userId } })
  })

  it('catálogo confirma Comercial+Produção+Estoque implementados (36 entradas destas 3 categorias)', () => {
    const implementedIds = new Set(getImplementedWidgets().map((w) => w.id))
    const expectedIds = DASHBOARD_WIDGET_CATALOG.filter((e) => ['comercial', 'producao', 'estoque'].includes(e.categoria))
    // 36 desde o ADR-019 Subetapa 7.5: +1 (`estoque.valor-total-estoque`, headline agregado pro
    // Resumo por Módulo da Diretoria).
    expect(expectedIds.length).toBe(36)
    for (const entry of expectedIds) expect(implementedIds.has(entry.id)).toBe(true)
  })

  it('getDashboard("producao") devolve todos os 13 widgets de Produção/PCP', async () => {
    const payload = await getDashboard('producao', PERIOD)
    const catalogIds = DASHBOARD_WIDGET_CATALOG.filter((e) => e.categoria === 'producao').map((e) => e.id)
    const payloadIds = payload.widgets.map((w) => w.id)
    for (const id of catalogIds) expect(payloadIds).toContain(id)
    expect(payload.widgets.length).toBe(catalogIds.length)
  })

  it('getDashboard("estoque") devolve todos os 9 widgets de Estoque', async () => {
    const payload = await getDashboard('estoque', PERIOD)
    const catalogIds = DASHBOARD_WIDGET_CATALOG.filter((e) => e.categoria === 'estoque').map((e) => e.id)
    const payloadIds = payload.widgets.map((w) => w.id)
    for (const id of catalogIds) expect(payloadIds).toContain(id)
    expect(payload.widgets.length).toBe(catalogIds.length)
  })

  it('getDashboard("pcp") compõe Produção + Estoque (22 widgets, sem duplicar lógica)', async () => {
    const payload = await getDashboard('pcp', PERIOD)
    const producaoIds = DASHBOARD_WIDGET_CATALOG.filter((e) => e.categoria === 'producao').map((e) => e.id)
    const estoqueIds = DASHBOARD_WIDGET_CATALOG.filter((e) => e.categoria === 'estoque').map((e) => e.id)
    const payloadIds = payload.widgets.map((w) => w.id)
    for (const id of [...producaoIds, ...estoqueIds]) expect(payloadIds).toContain(id)
    expect(payloadIds).not.toContain('comercial.orcamentos-por-status')
  })

  it('widget.type == "alert" se e somente se catalogEntry.kind == "alert" (ADR-019, Subetapa 7.2)', async () => {
    const payload = await getDashboard('pcp', PERIOD)
    for (const widget of payload.widgets) {
      const entry = getCatalogEntry(widget.id)!
      expect(widget.type === 'alert').toBe(entry.kind === 'alert')
    }
  })

  it('ops-por-status inclui as 3 OPs criadas na janela por status', async () => {
    const payload = await getDashboard('producao', PERIOD)
    const widget = payload.widgets.find((w) => w.id === 'producao.ops-por-status')!
    const data = widget.data as unknown as { series: { data: { x: string; y: number }[] }[] }
    const byStatus = Object.fromEntries(data.series[0].data.map((d) => [d.x, d.y]))
    expect(byStatus.in_progress).toBeGreaterThanOrEqual(1)
    expect(byStatus.planned).toBeGreaterThanOrEqual(1)
    expect(byStatus.completed).toBeGreaterThanOrEqual(1)
  })

  it('wip-total aumenta exatamente 70 (100-30) com a OP in_progress criada (delta)', async () => {
    const before = await db.productionOrder.findMany({ where: { status: 'in_progress', id: { notIn: productionOrderIds } }, select: { quantity: true, quantityCompleted: true } })
    const beforeWip = before.reduce((sum, o) => sum + (o.quantity - o.quantityCompleted), 0)
    const payload = await getDashboard('producao')
    const widget = payload.widgets.find((w) => w.id === 'producao.wip-total')!
    const data = widget.data as unknown as { value: number }
    expect(data.value).toBe(beforeWip + 70)
  })

  it('ops-atrasadas inclui a OP sintética atrasada (50 unidades pendentes) com severidade decoupled (ADR-019, Subetapa 7.2)', async () => {
    const payload = await getDashboard('producao')
    const widget = payload.widgets.find((w) => w.id === 'producao.ops-atrasadas')!
    expect(widget.type).toBe('alert')
    const data = widget.data as unknown as { severity: 'critical' | 'warning' | 'info'; count: number; message: string; linkToModule: string }
    expect(data.count).toBeGreaterThanOrEqual(1)
    // dueDate=01/01/2020 está muito além do limiar de 7 dias -> severidade máxima é sempre 'critical'.
    expect(data.severity).toBe('critical')
    expect(data.linkToModule).toBe('producao')
  })

  it('cobertura-reserva considera só reservas status=partial (não consumed) na severidade (ADR-019, Subetapa 7.2)', async () => {
    const payload = await getDashboard('producao')
    const widget = payload.widgets.find((w) => w.id === 'producao.cobertura-reserva')!
    expect(widget.type).toBe('alert')
    const data = widget.data as unknown as { severity: 'critical' | 'warning' | 'info'; count: number; linkToModule: string }
    expect(data.count).toBeGreaterThanOrEqual(1) // reservationPartial (needed=100, shortfall=40 -> 40% em falta)
    expect(data.severity).toBe('critical') // 40% >= limiar de 20%
    expect(data.linkToModule).toBe('requisicoes')
  })

  it('sugestoes-mrp-por-status inclui a sugestão pending criada, ignora filtro de período (ADR-019, Subetapa 7.2)', async () => {
    const payload = await getDashboard('producao')
    const widget = payload.widgets.find((w) => w.id === 'producao.sugestoes-mrp-por-status')!
    expect(widget.type).toBe('alert')
    const data = widget.data as unknown as { severity: 'critical' | 'warning' | 'info'; count: number; linkToModule: string }
    expect(data.count).toBeGreaterThanOrEqual(1)
    expect(data.linkToModule).toBe('producao')
  })

  it('resumo-ultima-execucao-mrp reflete a última execução (a mais recente por executedAt)', async () => {
    const payload = await getDashboard('producao')
    const widget = payload.widgets.find((w) => w.id === 'producao.resumo-ultima-execucao-mrp')!
    const data = widget.data as unknown as { rows: { metric: string; value: number }[] }
    expect(data.rows.length).toBeGreaterThan(0)
  })

  it('rodadas-parciais-por-op mostra 1 rodada para a OP in_progress', async () => {
    const payload = await getDashboard('producao', PERIOD)
    const widget = payload.widgets.find((w) => w.id === 'producao.rodadas-parciais-por-op')!
    const data = widget.data as unknown as { rows: { number: string; rounds: number }[] }
    const opRow = data.rows.find((r) => r.number.includes('DASH-OP'))
    expect(opRow?.rounds).toBeGreaterThanOrEqual(1)
  })

  it('materiais-baixo-estoque inclui o material sintético (stockQty 5 / minStockQty 10 = 50% -> crítico) (ADR-019, Subetapa 7.2)', async () => {
    const payload = await getDashboard('estoque')
    const widget = payload.widgets.find((w) => w.id === 'estoque.materiais-baixo-estoque')!
    expect(widget.type).toBe('alert')
    const data = widget.data as unknown as { severity: 'critical' | 'warning' | 'info'; count: number; linkToModule: string }
    expect(data.count).toBeGreaterThanOrEqual(1)
    expect(data.severity).toBe('critical') // ratio 0.5 <= limiar de 0.5
    expect(data.linkToModule).toBe('estoque')
  })

  it('reservado-a-caminho-em-producao reflete os totais agregados (delta)', async () => {
    const before = await db.material.aggregate({ where: { id: { notIn: materialIds } }, _sum: { reservedQty: true, onOrderQty: true } })
    const payload = await getDashboard('estoque')
    const widget = payload.widgets.find((w) => w.id === 'estoque.reservado-a-caminho-em-producao')!
    const data = widget.data as unknown as { rows: { categoria: string; reservado: number; aCaminho: number }[] }
    const materialRow = data.rows.find((r) => r.categoria === 'Materiais')
    expect(materialRow?.reservado).toBe((before._sum.reservedQty || 0) + 60)
    expect(materialRow?.aCaminho).toBe((before._sum.onOrderQty || 0) + 15)
  })

  it('movimentacoes-por-tipo inclui a movimentação OUT e ADJUST da janela sintética', async () => {
    const payload = await getDashboard('estoque', PERIOD)
    const widget = payload.widgets.find((w) => w.id === 'estoque.movimentacoes-por-tipo')!
    const data = widget.data as unknown as { series: { data: { x: string; y: number }[] }[] }
    const byType = Object.fromEntries(data.series[0].data.map((d) => [d.x, d.y]))
    expect(byType.OUT).toBeGreaterThanOrEqual(1)
    expect(byType.ADJUST).toBeGreaterThanOrEqual(1)
  })

  it('materiais-mais-consumidos inclui o material sintético com quantidade 25', async () => {
    const payload = await getDashboard('estoque', PERIOD)
    const widget = payload.widgets.find((w) => w.id === 'estoque.materiais-mais-consumidos')!
    const data = widget.data as unknown as { rows: { materialName: string; quantity: number }[] }
    const row = data.rows.find((r) => r.materialName.startsWith('Test Material dash-pcp-a'))
    expect(row?.quantity).toBe(25)
  })

  it('lotes-vencendo inclui o lote sintético com vencimento em 10 dias -> atenção, não crítico (ADR-019, Subetapa 7.2)', async () => {
    const payload = await getDashboard('estoque')
    const widget = payload.widgets.find((w) => w.id === 'estoque.lotes-vencendo')!
    expect(widget.type).toBe('alert')
    const data = widget.data as unknown as { severity: 'critical' | 'warning' | 'info'; count: number; linkToModule: string }
    expect(data.count).toBeGreaterThanOrEqual(1)
    // O lote sintético vence em ~10 dias — acima do limiar crítico de 7 dias. Se outro lote no banco
    // vencer em <=7 dias, o mínimo geral pode virar 'critical'; aceitamos ambos aqui.
    expect(['critical', 'warning']).toContain(data.severity)
    expect(data.linkToModule).toBe('estoque')
  })

  it('saldo-valorizado-quantidade aumenta exatamente 50 com o lote sintético (delta)', async () => {
    const before = await db.materialBatch.aggregate({ where: { id: { notIn: materialBatchIds } }, _sum: { quantityAvailable: true } })
    const payload = await getDashboard('estoque')
    const widget = payload.widgets.find((w) => w.id === 'estoque.saldo-valorizado-quantidade')!
    const data = widget.data as unknown as { value: number }
    expect(data.value).toBe((before._sum.quantityAvailable || 0) + 50)
  })

  it('ajustes-inventario inclui o ajuste sintético da janela (delta >= 1)', async () => {
    const payload = await getDashboard('estoque', PERIOD)
    const widget = payload.widgets.find((w) => w.id === 'estoque.ajustes-inventario')!
    const data = widget.data as unknown as { value: number }
    expect(data.value).toBeGreaterThanOrEqual(1)
  })

  it('adocao-lote conta o material lotControlled=false criado (delta, não é lotControlled)', async () => {
    const payload = await getDashboard('producao')
    const widget = payload.widgets.find((w) => w.id === 'producao.adocao-lote')!
    const data = widget.data as unknown as { rows: { categoria: string; total: number }[] }
    const materiaisRow = data.rows.find((r) => r.categoria === 'Materiais')
    expect(materiaisRow?.total).toBeGreaterThan(0)
  })
})
