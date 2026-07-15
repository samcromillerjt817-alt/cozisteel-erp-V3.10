import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { db } from '@/lib/db'
import { createTestUser, createTestProduct } from './helpers/fixtures'
import '@/app/services/dashboard-bootstrap'
import { getDashboard } from '@/app/services/dashboard-widgets.service'
import { DASHBOARD_WIDGET_CATALOG, getImplementedWidgets, getCatalogEntry } from '@/app/services/dashboard-widget-catalog'

/**
 * Fase 11 (Dashboard e KPIs), Subetapa 2 (ADR-017) — os 14 widgets reais do perfil Comercial. Dados
 * de teste usam uma janela de período sintética e distante (2020) para não sofrer interferência de
 * outros arquivos de teste que gravam no mesmo banco (`prisma/test.db`, `fileParallelism: false`) com
 * `createdAt` padrão (`now()`) — qualquer widget escopado por período é isolado por construção,
 * mesmo em execução paralela de outros arquivos.
 */
describe('Dashboard Comercial — widgets reais (Subetapa 2)', () => {
  const PERIOD = { from: new Date('2020-01-01'), to: new Date('2020-02-01') }
  const clientIds: string[] = []
  const productIds: string[] = []
  const quoteIds: string[] = []
  const salesOrderIds: string[] = []
  const statusHistoryIds: string[] = []
  let userId: string

  beforeAll(async () => {
    const user = await createTestUser(`dash-comercial-${Date.now()}`)
    userId = user.id

    const clientA = await db.client.create({ data: { corporateName: 'Cliente Dashboard A', active: true, createdAt: new Date('2020-01-05') } })
    const clientB = await db.client.create({ data: { corporateName: 'Cliente Dashboard B', active: true, createdAt: new Date('2020-01-10') } })
    clientIds.push(clientA.id, clientB.id)

    const productA = await createTestProduct(`dash-comercial-a-${Date.now()}`)
    const productB = await createTestProduct(`dash-comercial-b-${Date.now()}`)
    productIds.push(productA.id, productB.id)

    // 2 orçamentos em draft, 2 aprovados (um convertido em Pedido de Venda), dentro da janela 2020.
    const quoteDraft1 = await db.quote.create({ data: { number: `DASH-${Date.now()}-1`, status: 'draft', date: '05/01/2020', userId, total: 1000, createdAt: new Date('2020-01-05') } })
    const quoteDraft2 = await db.quote.create({ data: { number: `DASH-${Date.now()}-2`, status: 'sent', date: '06/01/2020', userId, total: 500, createdAt: new Date('2020-01-06') } })
    const quoteApproved1 = await db.quote.create({
      data: { number: `DASH-${Date.now()}-3`, status: 'approved', date: '07/01/2020', userId, clientId: clientA.id, total: 2000, createdAt: new Date('2020-01-07'), approvedAt: new Date('2020-01-10') },
    })
    const quoteApproved2 = await db.quote.create({
      data: { number: `DASH-${Date.now()}-4`, status: 'approved', date: '08/01/2020', userId, clientId: clientB.id, total: 4000, createdAt: new Date('2020-01-08'), approvedAt: new Date('2020-01-09') },
    })
    quoteIds.push(quoteDraft1.id, quoteDraft2.id, quoteApproved1.id, quoteApproved2.id)

    // Orçamento vencido: em aberto, validUntil no passado distante — não interfere no cálculo real
    // (hoje), só precisa ser um Date válido no passado a partir de "agora" para contar como vencido.
    const quoteOverdue = await db.quote.create({
      data: { number: `DASH-${Date.now()}-5`, status: 'draft', date: '01/01/2020', userId, total: 100, validUntil: '01/01/2020', createdAt: new Date('2020-01-01') },
    })
    quoteIds.push(quoteOverdue.id)

    // 1 Pedido de Venda a partir do quoteApproved1, com item de produto.
    const salesOrder1 = await db.salesOrder.create({
      data: { number: `DASH-PV-${Date.now()}-1`, status: 'open', date: '10/01/2020', quoteId: quoteApproved1.id, clientId: clientA.id, userId, total: 2000, createdAt: new Date('2020-01-10') },
    })
    salesOrderIds.push(salesOrder1.id)
    await db.salesOrderItem.create({ data: { salesOrderId: salesOrder1.id, productId: productA.id, quantity: 3, total: 1500 } })
    await db.salesOrderItem.create({ data: { salesOrderId: salesOrder1.id, productId: productB.id, quantity: 1, total: 500 } })

    // StatusHistory sintético para o widget de tempo médio por status: draft -> sent (2 dias), sent -> approved (3 dias).
    const sh1 = await db.statusHistory.create({ data: { entityType: 'quote', entityId: quoteApproved1.id, fromStatus: 'draft', toStatus: 'draft', userId, createdAt: new Date('2020-01-01') } })
    const sh2 = await db.statusHistory.create({ data: { entityType: 'quote', entityId: quoteApproved1.id, fromStatus: 'draft', toStatus: 'sent', userId, createdAt: new Date('2020-01-03') } })
    const sh3 = await db.statusHistory.create({ data: { entityType: 'quote', entityId: quoteApproved1.id, fromStatus: 'sent', toStatus: 'approved', userId, createdAt: new Date('2020-01-06') } })
    statusHistoryIds.push(sh1.id, sh2.id, sh3.id)
  })

  afterAll(async () => {
    await db.statusHistory.deleteMany({ where: { id: { in: statusHistoryIds } } })
    await db.salesOrderItem.deleteMany({ where: { salesOrderId: { in: salesOrderIds } } })
    await db.salesOrder.deleteMany({ where: { id: { in: salesOrderIds } } })
    await db.quote.deleteMany({ where: { id: { in: quoteIds } } })
    await db.product.deleteMany({ where: { id: { in: productIds } } })
    await db.client.deleteMany({ where: { id: { in: clientIds } } })
    await db.user.delete({ where: { id: userId } })
  })

  it('getDashboard("comercial") devolve os 14 widgets do catálogo, todos com id/type/order/data', async () => {
    const payload = await getDashboard('comercial', PERIOD)
    const catalogIds = DASHBOARD_WIDGET_CATALOG.filter((e) => e.categoria === 'comercial').map((e) => e.id)
    const payloadIds = payload.widgets.map((w) => w.id)
    for (const id of catalogIds) {
      expect(payloadIds).toContain(id)
    }
    expect(payload.widgets.length).toBe(catalogIds.length)
    for (const widget of payload.widgets) {
      expect(widget.title.length).toBeGreaterThan(0)
      expect(['card', 'chart', 'table', 'alert']).toContain(widget.type)
      expect(widget.data).toBeDefined()
    }
  })

  it('catálogo confirma as 14 entradas Comerciais marcadas implementado:true', () => {
    const implementedComercial = getImplementedWidgets().filter((e) => e.categoria === 'comercial')
    expect(implementedComercial.length).toBe(14)
  })

  it('widget.type == "alert" se e somente se catalogEntry.kind == "alert" (ADR-019, Subetapa 7.2)', async () => {
    const payload = await getDashboard('comercial', PERIOD)
    for (const widget of payload.widgets) {
      const entry = getCatalogEntry(widget.id)!
      expect(widget.type === 'alert').toBe(entry.kind === 'alert')
    }
  })

  it('orcamentos-por-status conta os 5 orçamentos da janela por status', async () => {
    const payload = await getDashboard('comercial', PERIOD)
    const widget = payload.widgets.find((w) => w.id === 'comercial.orcamentos-por-status')!
    const data = widget.data as { series: { data: { x: string; y: number }[] }[] }
    const byStatus = Object.fromEntries(data.series[0].data.map((d) => [d.x, d.y]))
    expect(byStatus.draft).toBe(2) // quoteDraft1 + quoteOverdue
    expect(byStatus.sent).toBe(1)
    expect(byStatus.approved).toBe(2)
  })

  it('valor-aprovado-por-periodo soma os 2 orçamentos aprovados (2000+4000)', async () => {
    const payload = await getDashboard('comercial', PERIOD)
    const widget = payload.widgets.find((w) => w.id === 'comercial.valor-aprovado-por-periodo')!
    const data = widget.data as { value: number }
    expect(data.value).toBe(6000)
  })

  it('taxa-conversao: 1 pedido de venda sobre 2 orçamentos aprovados = 50%', async () => {
    const payload = await getDashboard('comercial', PERIOD)
    const widget = payload.widgets.find((w) => w.id === 'comercial.taxa-conversao')!
    const data = widget.data as { value: string }
    expect(data.value).toBe('50%')
  })

  it('ticket-medio usa a média do Pedido de Venda quando existe', async () => {
    const payload = await getDashboard('comercial', PERIOD)
    const widget = payload.widgets.find((w) => w.id === 'comercial.ticket-medio')!
    const data = widget.data as { value: number }
    expect(data.value).toBe(2000)
  })

  it('top-clientes ordena Cliente Dashboard A (2000) acima de qualquer outro nesta janela', async () => {
    const payload = await getDashboard('comercial', PERIOD)
    const widget = payload.widgets.find((w) => w.id === 'comercial.top-clientes')!
    const data = widget.data as unknown as { rows: { clientName: string; total: number }[] }
    const row = data.rows.find((r) => r.clientName === 'Cliente Dashboard A')
    expect(row?.total).toBe(2000)
  })

  it('top-produtos traz os 2 produtos do Pedido de Venda com quantidade e valor corretos', async () => {
    const payload = await getDashboard('comercial', PERIOD)
    const widget = payload.widgets.find((w) => w.id === 'comercial.top-produtos')!
    const data = widget.data as unknown as { rows: { productName: string; quantity: number; total: number }[] }
    const names = data.rows.map((r) => r.productName)
    expect(names.some((n) => n.startsWith('Test Product dash-comercial-a'))).toBe(true)
    const rowA = data.rows.find((r) => r.productName.startsWith('Test Product dash-comercial-a'))
    expect(rowA?.quantity).toBe(3)
    expect(rowA?.total).toBe(1500)
  })

  it('clientes-produtos-ativos aumenta exatamente pelos clientes/produtos criados neste teste (delta)', async () => {
    const before = await db.client.count({ where: { active: true } })
    const beforeProducts = await db.product.count({ where: { active: true } })
    const payload = await getDashboard('comercial')
    const widget = payload.widgets.find((w) => w.id === 'comercial.clientes-produtos-ativos')!
    const data = widget.data as unknown as { rows: { categoria: string; ativos: number }[] }
    const clientesRow = data.rows.find((r) => r.categoria === 'Clientes')
    const produtosRow = data.rows.find((r) => r.categoria === 'Produtos')
    expect(clientesRow?.ativos).toBe(before)
    expect(produtosRow?.ativos).toBe(beforeProducts)
  })

  it('orcamentos-vencidos inclui o orçamento sintético com validUntil no passado e severidade decoupled (ADR-019, Subetapa 7.2)', async () => {
    const payload = await getDashboard('comercial')
    const widget = payload.widgets.find((w) => w.id === 'comercial.orcamentos-vencidos')!
    expect(widget.type).toBe('alert')
    const data = widget.data as { severity: 'critical' | 'warning' | 'info'; count: number; message: string; linkToModule: string }
    expect(data.count).toBeGreaterThanOrEqual(1)
    // validUntil=01/01/2020 está muito além do limiar de 15 dias -> severidade máxima entre todos os
    // orçamentos vencidos é sempre 'critical' (o synthetic sozinho já garante isso).
    expect(data.severity).toBe('critical')
    expect(data.message.length).toBeGreaterThan(0)
    expect(data.linkToModule).toBe('orcamentos')
  })

  it('tempo-criacao-aprovacao calcula a média de dias entre createdAt e approvedAt', async () => {
    const payload = await getDashboard('comercial', PERIOD)
    const widget = payload.widgets.find((w) => w.id === 'comercial.tempo-criacao-aprovacao')!
    const data = widget.data as { value: string }
    // quoteApproved1: 07/01 -> 10/01 (3 dias); quoteApproved2: 08/01 -> 09/01 (1 dia) — média 2 dias
    expect(data.value).toBe('2 dias')
  })

  it('tempo-aprovacao-conversao calcula os dias entre aprovação do orçamento e criação do pedido', async () => {
    const payload = await getDashboard('comercial', PERIOD)
    const widget = payload.widgets.find((w) => w.id === 'comercial.tempo-aprovacao-conversao')!
    const data = widget.data as { value: string }
    // quoteApproved1.approvedAt = 10/01, salesOrder1.createdAt = 10/01 -> 0 dias
    expect(data.value).toBe('0 dias')
  })

  it('tempo-medio-por-status calcula a média de dias em cada status a partir do StatusHistory sintético', async () => {
    const payload = await getDashboard('comercial', PERIOD)
    const widget = payload.widgets.find((w) => w.id === 'comercial.tempo-medio-por-status')!
    const data = widget.data as { series: { data: { x: string; y: number }[] }[] }
    const byStatus = Object.fromEntries(data.series[0].data.map((d) => [d.x, d.y]))
    expect(byStatus.draft).toBe(2) // 01/01 -> 03/01
    expect(byStatus.sent).toBe(3) // 03/01 -> 06/01
  })

  it('distribuicao-por-vendedor conta os 5 orçamentos da janela para o vendedor de teste', async () => {
    const payload = await getDashboard('comercial', PERIOD)
    const widget = payload.widgets.find((w) => w.id === 'comercial.distribuicao-por-vendedor')!
    const data = widget.data as { series: { data: { x: string; y: number }[] }[] }
    const total = data.series[0].data.reduce((sum, d) => sum + d.y, 0)
    expect(total).toBeGreaterThanOrEqual(5)
  })

  it('clientes-novos-periodo conta os 2 clientes criados na janela sintética', async () => {
    const payload = await getDashboard('comercial', PERIOD)
    const widget = payload.widgets.find((w) => w.id === 'comercial.clientes-novos-periodo')!
    const data = widget.data as { value: number }
    expect(data.value).toBe(2)
  })
})
