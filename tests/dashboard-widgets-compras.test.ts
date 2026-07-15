import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { db } from '@/lib/db'
import { createTestUser, createTestMaterial, createTestSupplier } from './helpers/fixtures'
import '@/app/services/dashboard-bootstrap'
import { getDashboard } from '@/app/services/dashboard-widgets.service'
import { DASHBOARD_WIDGET_CATALOG, getImplementedWidgets, getCatalogEntry } from '@/app/services/dashboard-widget-catalog'

/**
 * Fase 11 (Dashboard e KPIs), Subetapa 4 (ADR-017) — os 9 widgets reais de Compras, incluindo as 5
 * correções exigidas pelo usuário na aprovação do levantamento: segmentação por originModule
 * (ADR-009), tempo de ciclo só para requisições concluídas, sampleSize no tempo por etapa,
 * performance de fornecedor com critérios explícitos + prometido/real/diferença, e taxa de vitória
 * como vitórias/participações (não sobre o total de pedidos).
 */
describe('Dashboard Compras — widgets reais (Subetapa 4)', () => {
  const PERIOD = { from: new Date('2020-05-01'), to: new Date('2020-06-01') }
  let userId: string
  const supplierIds: string[] = []
  const materialIds: string[] = []
  const requisitionIds: string[] = []
  const requisitionItemIds: string[] = []
  const quoteIds: string[] = []
  const purchaseOrderIds: string[] = []
  const purchaseOrderItemIds: string[] = []
  const statusHistoryIds: string[] = []

  beforeAll(async () => {
    const user = await createTestUser(`dash-compras-${Date.now()}`)
    userId = user.id

    const supplierA = await createTestSupplier(`dash-compras-a-${Date.now()}`)
    const supplierB = await createTestSupplier(`dash-compras-b-${Date.now()}`)
    supplierIds.push(supplierA.id, supplierB.id)

    const materialA = await createTestMaterial(`dash-compras-a-${Date.now()}`)
    const materialB = await createTestMaterial(`dash-compras-b-${Date.now()}`)
    materialIds.push(materialA.id, materialB.id)

    // R1: manual, ciclo CONCLUÍDO (ordered) — única que deve entrar em tempo-ciclo-requisicao.
    const r1 = await db.requisition.create({
      data: { number: `DASH-REQ-${Date.now()}-1`, status: 'ordered', tipo: 'PRODUCAO', originModule: 'manual', date: '01/05/2020', userId, createdAt: new Date('2020-05-01') },
    })
    // R2: mrp, ainda em andamento (sent) — nunca usa atendimento por estoque (ADR-009), excluída do ciclo.
    const r2 = await db.requisition.create({
      data: { number: `DASH-REQ-${Date.now()}-2`, status: 'sent', tipo: 'PRODUCAO', originModule: 'mrp', date: '02/05/2020', userId, createdAt: new Date('2020-05-02') },
    })
    // R3: manual, em andamento (draft) — excluída do ciclo.
    const r3 = await db.requisition.create({
      data: { number: `DASH-REQ-${Date.now()}-3`, status: 'draft', tipo: 'MANUTENCAO', originModule: 'manual', date: '03/05/2020', userId, createdAt: new Date('2020-05-03') },
    })
    requisitionIds.push(r1.id, r2.id, r3.id)

    const ri1 = await db.requisitionItem.create({ data: { requisitionId: r1.id, materialId: materialA.id, quantity: 15, quantityFromStock: 5, quantityToPurchase: 10 } })
    const ri2 = await db.requisitionItem.create({ data: { requisitionId: r2.id, materialId: materialA.id, quantity: 20, quantityFromStock: 0, quantityToPurchase: 20 } })
    const ri3 = await db.requisitionItem.create({ data: { requisitionId: r3.id, materialId: materialB.id, quantity: 10, quantityFromStock: 8, quantityToPurchase: 2 } })
    requisitionItemIds.push(ri1.id, ri2.id, ri3.id)

    // Cotações: fornecedor A vence 2 de 3 participações (66,7%); fornecedor B vence 0 de 1 (0%).
    const q1 = await db.requisitionItemQuote.create({ data: { requisitionItemId: ri1.id, supplierId: supplierA.id, price: 100, leadTimeDays: 3, isSelected: true } })
    const q2 = await db.requisitionItemQuote.create({ data: { requisitionItemId: ri1.id, supplierId: supplierB.id, price: 110, leadTimeDays: 5, isSelected: false } })
    const q3 = await db.requisitionItemQuote.create({ data: { requisitionItemId: ri3.id, supplierId: supplierA.id, price: 50, leadTimeDays: 4, isSelected: true } })
    const q4 = await db.requisitionItemQuote.create({ data: { requisitionItemId: ri3.id, supplierId: supplierA.id, price: 55, leadTimeDays: 6, isSelected: false } })
    quoteIds.push(q1.id, q2.id, q3.id, q4.id)

    // StatusHistory de R1 (única concluída): draft(01/05) -> sent(03/05, +2d) -> approved(06/05, +3d) -> ordered(08/05, +2d).
    const sh1 = await db.statusHistory.create({ data: { entityType: 'requisition', entityId: r1.id, fromStatus: 'draft', toStatus: 'draft', userId, createdAt: new Date('2020-05-01') } })
    const sh2 = await db.statusHistory.create({ data: { entityType: 'requisition', entityId: r1.id, fromStatus: 'draft', toStatus: 'sent', userId, createdAt: new Date('2020-05-03') } })
    const sh3 = await db.statusHistory.create({ data: { entityType: 'requisition', entityId: r1.id, fromStatus: 'sent', toStatus: 'approved', userId, createdAt: new Date('2020-05-06') } })
    const sh4 = await db.statusHistory.create({ data: { entityType: 'requisition', entityId: r1.id, fromStatus: 'approved', toStatus: 'ordered', userId, createdAt: new Date('2020-05-08') } })
    // StatusHistory "ruído" de R2 (ainda em andamento) — não deve contaminar a média (deveria ser ignorada por completo).
    const shNoise = await db.statusHistory.create({ data: { entityType: 'requisition', entityId: r2.id, fromStatus: 'draft', toStatus: 'sent', userId, createdAt: new Date('2020-05-02') } })
    statusHistoryIds.push(sh1.id, sh2.id, sh3.id, sh4.id, shNoise.id)

    // PO1: fornecedor A, status='received', com todas as datas de etapa e item ligado a ri1 (leadTimeDays=3 prometido).
    const po1 = await db.purchaseOrder.create({
      data: {
        number: `DASH-PO-${Date.now()}-1`, status: 'received', supplierId: supplierA.id, requisitionId: r1.id, date: '01/05/2020', userId, total: 1000,
        createdAt: new Date('2020-05-01'), approvedAt: new Date('2020-05-02'), sentAt: new Date('2020-05-04'), confirmedAt: new Date('2020-05-05'), receivedAt: new Date('2020-05-08'),
      },
    })
    const poi1 = await db.purchaseOrderItem.create({ data: { purchaseOrderId: po1.id, requisitionItemId: ri1.id, materialId: materialA.id, quantity: 10, unitPrice: 100, total: 1000 } })

    // PO2: fornecedor B, status='received', item ligado a ri3 — mas a cotação SELECIONADA de ri3 é do fornecedor A (leadTimeDays=4);
    // como o PO2 é do fornecedor B, nenhuma cotação selecionada do fornecedor B existe para ri3 -> sem leadTimeDays informado -> excluído da performance.
    const po2 = await db.purchaseOrder.create({
      data: { number: `DASH-PO-${Date.now()}-2`, status: 'received', supplierId: supplierB.id, requisitionId: r3.id, date: '01/05/2020', userId, total: 500, createdAt: new Date('2020-05-01'), receivedAt: new Date('2020-05-10') },
    })
    const poi2 = await db.purchaseOrderItem.create({ data: { purchaseOrderId: po2.id, requisitionItemId: ri3.id, materialId: materialB.id, quantity: 5, unitPrice: 100, total: 500 } })

    // PO3: fornecedor A, status='cancelled' — nunca deve aparecer em pedidos-por-status/valor-total-po/performance (fora do período de teste do delta, mas ainda no groupBy de status).
    const po3 = await db.purchaseOrder.create({
      data: { number: `DASH-PO-${Date.now()}-3`, status: 'cancelled', supplierId: supplierA.id, requisitionId: r1.id, date: '01/05/2020', userId, total: 200, createdAt: new Date('2020-05-01') },
    })

    purchaseOrderIds.push(po1.id, po2.id, po3.id)
    purchaseOrderItemIds.push(poi1.id, poi2.id)
  })

  afterAll(async () => {
    await db.purchaseOrderItem.deleteMany({ where: { id: { in: purchaseOrderItemIds } } })
    await db.purchaseOrder.deleteMany({ where: { id: { in: purchaseOrderIds } } })
    await db.statusHistory.deleteMany({ where: { id: { in: statusHistoryIds } } })
    await db.requisitionItemQuote.deleteMany({ where: { id: { in: quoteIds } } })
    await db.requisitionItem.deleteMany({ where: { id: { in: requisitionItemIds } } })
    await db.requisition.deleteMany({ where: { id: { in: requisitionIds } } })
    await db.material.deleteMany({ where: { id: { in: materialIds } } })
    await db.supplier.deleteMany({ where: { id: { in: supplierIds } } })
    await db.user.delete({ where: { id: userId } })
  })

  it('catálogo confirma Comercial+Produção+Estoque+Compras implementados (46 entradas destas 4 categorias)', () => {
    const implementedIds = new Set(getImplementedWidgets().map((w) => w.id))
    const expectedIds = DASHBOARD_WIDGET_CATALOG.filter((e) => ['comercial', 'producao', 'estoque', 'compras'].includes(e.categoria))
    // 46 desde o ADR-019 Subetapa 7.5: +2 (`compras.valor-total-po-periodo` e
    // `estoque.valor-total-estoque`, headlines agregados pro Resumo por Módulo da Diretoria).
    expect(expectedIds.length).toBe(46)
    for (const entry of expectedIds) expect(implementedIds.has(entry.id)).toBe(true)
  })

  it('getDashboard("compras") devolve os 10 widgets do catálogo', async () => {
    const payload = await getDashboard('compras', PERIOD)
    const catalogIds = DASHBOARD_WIDGET_CATALOG.filter((e) => e.categoria === 'compras').map((e) => e.id)
    const payloadIds = payload.widgets.map((w) => w.id)
    for (const id of catalogIds) expect(payloadIds).toContain(id)
    expect(payload.widgets.length).toBe(catalogIds.length)
  })

  it('widget.type == "alert" se e somente se catalogEntry.kind == "alert" (ADR-019, Subetapa 7.2)', async () => {
    const payload = await getDashboard('compras', PERIOD)
    for (const widget of payload.widgets) {
      const entry = getCatalogEntry(widget.id)!
      expect(widget.type === 'alert').toBe(entry.kind === 'alert')
    }
  })

  it('requisicoes-por-status-tipo-origem cobre as 3 dimensões (status/tipo/origem)', async () => {
    const payload = await getDashboard('compras', PERIOD)
    const widget = payload.widgets.find((w) => w.id === 'compras.requisicoes-por-status-tipo-origem')!
    const data = widget.data as unknown as { rows: { dimensao: string }[] }
    const dimensions = new Set(data.rows.map((r) => r.dimensao))
    expect(dimensions.has('Status')).toBe(true)
    expect(dimensions.has('Tipo')).toBe(true)
    expect(dimensions.has('Origem')).toBe(true)
  })

  it('percentual-atendido-estoque segmenta por originModule — mrp nunca soma quantityFromStock (ADR-009)', async () => {
    const payload = await getDashboard('compras', PERIOD)
    const widget = payload.widgets.find((w) => w.id === 'compras.percentual-atendido-estoque')!
    const data = widget.data as unknown as { rows: { originModule: string; fromStock: number; toPurchase: number }[] }
    const manualRow = data.rows.find((r) => r.originModule === 'manual')
    const mrpRow = data.rows.find((r) => r.originModule === 'mrp')
    expect(manualRow?.fromStock).toBe(13) // ri1 (5) + ri3 (8)
    expect(manualRow?.toPurchase).toBe(12) // ri1 (10) + ri3 (2)
    expect(mrpRow?.fromStock).toBe(0) // regra ADR-009 — nunca atendido por estoque
    expect(mrpRow?.toPurchase).toBe(20)
  })

  it('tempo-ciclo-requisicao considera só a requisição concluída (R1), ignora R2/R3 em andamento', async () => {
    const payload = await getDashboard('compras', PERIOD)
    const widget = payload.widgets.find((w) => w.id === 'compras.tempo-ciclo-requisicao')!
    const data = widget.data as unknown as { series: { data: { x: string; y: number }[] }[] }
    const byStatus = Object.fromEntries(data.series[0].data.map((d) => [d.x, d.y]))
    expect(byStatus.draft).toBe(2) // 01/05 -> 03/05
    expect(byStatus.sent).toBe(3) // 03/05 -> 06/05
    expect(byStatus.approved).toBe(2) // 06/05 -> 08/05
    // R2 (sent, em andamento) não deveria contribuir nenhuma duração — só existiria como 'draft' se
    // tivesse 2+ transições; como só tem 1 transição registrada, não gera duração de qualquer forma,
    // mas o filtro por status='ordered' garante isso mesmo se tivesse mais transições.
  })

  it('tempo-por-etapa-po expõe sampleSize junto com a média de cada etapa', async () => {
    const payload = await getDashboard('compras', PERIOD)
    const widget = payload.widgets.find((w) => w.id === 'compras.tempo-por-etapa-po')!
    const data = widget.data as unknown as { rows: { etapa: string; mediaDias: number; sampleSize: number }[] }
    const criacaoAprovacao = data.rows.find((r) => r.etapa === 'Criação → Aprovação')
    expect(criacaoAprovacao?.mediaDias).toBe(1) // 01/05 -> 02/05
    expect(criacaoAprovacao?.sampleSize).toBeGreaterThanOrEqual(1)
    const confirmacaoRecebimento = data.rows.find((r) => r.etapa === 'Confirmação → Recebimento')
    expect(confirmacaoRecebimento?.mediaDias).toBe(3) // 05/05 -> 08/05
  })

  it('performance-fornecedor só inclui POs recebidos com leadTimeDays informado — exclui cancelado e sem cotação', async () => {
    const payload = await getDashboard('compras', PERIOD)
    const widget = payload.widgets.find((w) => w.id === 'compras.performance-fornecedor')!
    const data = widget.data as unknown as { rows: { supplierName: string; avgPromised: number; avgActual: number; diff: number; sampleSize: number }[] }
    const supplierARow = data.rows.find((r) => r.supplierName.includes('dash-compras-a'))
    expect(supplierARow?.avgPromised).toBe(3) // leadTimeDays de ri1 (cotação selecionada do fornecedor A)
    expect(supplierARow?.avgActual).toBe(7) // 01/05 -> 08/05
    expect(supplierARow?.diff).toBe(4)
    expect(supplierARow?.sampleSize).toBe(1)
    // Fornecedor B: PO2 recebido, mas sem cotação selecionada DELE para ri3 (a selecionada é do fornecedor A) — não deve aparecer.
    const supplierBRow = data.rows.find((r) => r.supplierName.includes('dash-compras-b'))
    expect(supplierBRow).toBeUndefined()
  })

  it('taxa-vitoria-fornecedor calcula vitórias/participações, não sobre o total de pedidos', async () => {
    const payload = await getDashboard('compras')
    const widget = payload.widgets.find((w) => w.id === 'compras.taxa-vitoria-fornecedor')!
    const data = widget.data as unknown as { rows: { supplierName: string; participations: number; wins: number; winRate: string }[] }
    const supplierARow = data.rows.find((r) => r.supplierName.includes('dash-compras-a'))
    const supplierBRow = data.rows.find((r) => r.supplierName.includes('dash-compras-b'))
    expect(supplierARow?.participations).toBe(3) // q1, q3, q4
    expect(supplierARow?.wins).toBe(2) // q1, q3
    expect(supplierARow?.winRate).toBe('66.7%')
    expect(supplierBRow?.participations).toBe(1) // q2
    expect(supplierBRow?.wins).toBe(0)
    expect(supplierBRow?.winRate).toBe('0%')
  })

  it('pedidos-por-status e valor-total-po refletem os 3 POs da janela (received x2, cancelled x1)', async () => {
    const payload = await getDashboard('compras', PERIOD)
    const statusWidget = payload.widgets.find((w) => w.id === 'compras.pedidos-por-status')!
    const statusData = statusWidget.data as unknown as { series: { data: { x: string; y: number }[] }[] }
    const byStatus = Object.fromEntries(statusData.series[0].data.map((d) => [d.x, d.y]))
    expect(byStatus.received).toBeGreaterThanOrEqual(2)
    expect(byStatus.cancelled).toBeGreaterThanOrEqual(1)

    const valueWidget = payload.widgets.find((w) => w.id === 'compras.valor-total-po')!
    const valueData = valueWidget.data as unknown as { series: { data: { x: string; y: number }[] }[] }
    const valueByStatus = Object.fromEntries(valueData.series[0].data.map((d) => [d.x, d.y]))
    expect(valueByStatus.received).toBeGreaterThanOrEqual(1500) // 1000 + 500
  })

  it('aprovacoes-pendentes reflete o estado atual (delta 0 — nenhum PO pending_approval criado neste teste)', async () => {
    const before = await db.purchaseOrder.count({ where: { status: 'pending_approval' } })
    const payload = await getDashboard('compras')
    const widget = payload.widgets.find((w) => w.id === 'compras.aprovacoes-pendentes')!
    expect(widget.type).toBe('alert')
    const data = widget.data as unknown as { severity: 'critical' | 'warning' | 'info'; count: number; linkToModule: string }
    expect(data.count).toBe(before)
    if (before === 0) expect(data.severity).toBe('info')
    else expect(['critical', 'warning']).toContain(data.severity)
    expect(data.linkToModule).toBe('compras')
  })

  it('aprovacoes-pendentes escala a severidade com o tempo de espera (via StatusHistory), não só a contagem (ADR-019, Subetapa 7.2)', async () => {
    const supplierC = await createTestSupplier(`dash-compras-aprov-${Date.now()}`)
    supplierIds.push(supplierC.id)
    const oldPending = await db.purchaseOrder.create({
      data: { number: `DASH-PO-APROV-${Date.now()}`, status: 'pending_approval', supplierId: supplierC.id, requisitionId: requisitionIds[0], date: '01/01/2020', userId, total: 100, createdAt: new Date('2020-01-01') },
    })
    purchaseOrderIds.push(oldPending.id)
    const oldHistory = await db.statusHistory.create({ data: { entityType: 'purchase_order', entityId: oldPending.id, fromStatus: 'draft', toStatus: 'pending_approval', userId, createdAt: new Date('2020-01-01') } })
    statusHistoryIds.push(oldHistory.id)

    const payload = await getDashboard('compras')
    const widget = payload.widgets.find((w) => w.id === 'compras.aprovacoes-pendentes')!
    const data = widget.data as unknown as { severity: 'critical' | 'warning' | 'info'; count: number }
    expect(data.count).toBeGreaterThanOrEqual(1)
    // Aprovação pendente desde 2020 -> muito além do limiar de 3 dias -> crítico.
    expect(data.severity).toBe('critical')
  })
})
