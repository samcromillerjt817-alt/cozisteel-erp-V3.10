import { describe, it, expect } from 'vitest'
import { db } from '@/lib/db'
import '@/app/services/dashboard-bootstrap'
import { centroOperacoesService } from '@/app/services/centro-operacoes.service'
import { createTestUser, createTestProduct, createTestMaterial, createTestSupplier } from './helpers/fixtures'

const PAST = new Date(2020, 0, 1) // muito no passado — sempre "vencido/atrasado" nos testes abaixo
const FUTURE = new Date(2099, 0, 1) // muito no futuro — nunca "vencido/atrasado"

/**
 * ADR-024 (Centro de Operações, Fase 1) — pipeline Orçamento→Financeiro + KPIs operacionais
 * reaproveitados. Cobre só o que é genuinamente novo desta fase: `getPipelineStages()`,
 * `getOperationalKpis()` e o novo widget `financeiro.contas-vencidas` — o resto (severidade de
 * alerta, `getAllAlerts()`, os 3 widgets reaproveitados) já é coberto pelos testes das fases
 * anteriores do Dashboard (ADR-017/019).
 */
describe('Centro de Operações — pipeline e KPIs (ADR-024, Fase 1)', () => {
  it('1. getPipelineStages devolve as 6 etapas na ordem esperada, com linkToModule certo', async () => {
    const stages = await centroOperacoesService.getPipelineStages()
    expect(stages.map((s) => s.id)).toEqual(['orcamento', 'pedido', 'producao', 'compra', 'entrega', 'financeiro'])
    expect(stages.find((s) => s.id === 'orcamento')?.linkToModule).toBe('orcamentos')
    expect(stages.find((s) => s.id === 'pedido')?.linkToModule).toBe('pedidos')
    expect(stages.find((s) => s.id === 'producao')?.linkToModule).toBe('producao')
    expect(stages.find((s) => s.id === 'compra')?.linkToModule).toBe('compras')
    expect(stages.find((s) => s.id === 'entrega')?.linkToModule).toBe('pedidos')
    expect(stages.find((s) => s.id === 'financeiro')?.linkToModule).toBe('financeiro')
  })

  it('2. Etapa "Produção" conta só OPs em status in_progress, nunca planned/completed/cancelled', async () => {
    const user = await createTestUser('centro-op-producao')
    const product = await createTestProduct('centro-op-producao')

    const before = await centroOperacoesService.getPipelineStages()
    const beforeCount = before.find((s) => s.id === 'producao')!.count

    const inProgress = await db.productionOrder.create({ data: { number: `CO-OP-${Date.now()}-1`, status: 'in_progress', date: '01/01/2026', quantity: 10, productId: product.id, userId: user.id } })
    const planned = await db.productionOrder.create({ data: { number: `CO-OP-${Date.now()}-2`, status: 'planned', date: '01/01/2026', quantity: 10, productId: product.id, userId: user.id } })

    const after = await centroOperacoesService.getPipelineStages()
    expect(after.find((s) => s.id === 'producao')!.count).toBe(beforeCount + 1) // só a in_progress

    await db.productionOrder.deleteMany({ where: { id: { in: [inProgress.id, planned.id] } } })
    await db.product.delete({ where: { id: product.id } })
    await db.user.delete({ where: { id: user.id } })
  })

  it('3. Etapa "Entrega" conta só Shipment com scheduledDate no passado e status não-terminal', async () => {
    const user = await createTestUser('centro-op-entrega')
    const quote = await db.quote.create({ data: { number: `CO-Q-${Date.now()}`, status: 'approved', date: '01/01/2026', userId: user.id } })
    const salesOrder = await db.salesOrder.create({ data: { number: `CO-SO-${Date.now()}`, status: 'ready_for_shipping', date: '01/01/2026', quoteId: quote.id, userId: user.id } })

    const before = await centroOperacoesService.getPipelineStages()
    const beforeCount = before.find((s) => s.id === 'entrega')!.count

    const overdueShipment = await db.shipment.create({ data: { number: `CO-EXP-${Date.now()}-1`, salesOrderId: salesOrder.id, status: 'ready', scheduledDate: PAST, userId: user.id } })
    const futureShipment = await db.shipment.create({ data: { number: `CO-EXP-${Date.now()}-2`, salesOrderId: salesOrder.id, status: 'ready', scheduledDate: FUTURE, userId: user.id } })
    const deliveredOverdue = await db.shipment.create({ data: { number: `CO-EXP-${Date.now()}-3`, salesOrderId: salesOrder.id, status: 'delivered', scheduledDate: PAST, userId: user.id } })

    const stages = await centroOperacoesService.getPipelineStages()
    expect(stages.find((s) => s.id === 'entrega')!.count).toBe(beforeCount + 1) // só o overdueShipment
    expect(stages.find((s) => s.id === 'entrega')!.severity).toBe('critical')

    await db.shipment.deleteMany({ where: { id: { in: [overdueShipment.id, futureShipment.id, deliveredOverdue.id] } } })
    await db.salesOrder.delete({ where: { id: salesOrder.id } })
    await db.quote.delete({ where: { id: quote.id } })
    await db.user.delete({ where: { id: user.id } })
  })

  it('4. getOperationalKpis devolve 4 KPIs no formato card (value/hint), nunca alert (count/message)', async () => {
    const kpis = await centroOperacoesService.getOperationalKpis()
    expect(kpis.map((k) => k.widget.id).sort()).toEqual(
      ['compras.aprovacoes-pendentes', 'estoque.materiais-baixo-estoque', 'financeiro.contas-vencidas', 'producao.ops-atrasadas'].sort()
    )
    for (const kpi of kpis) {
      expect(kpi.widget.type).toBe('card')
      const data = kpi.widget.data as { value: number; hint: string }
      expect(typeof data.value).toBe('number')
      expect(typeof data.hint).toBe('string')
    }
  })

  it('5. financeiro.contas-vencidas conta títulos a pagar + a receber com dueDate no passado, ignora os no futuro', async () => {
    const user = await createTestUser('centro-op-contas-vencidas')
    const quote = await db.quote.create({ data: { number: `CO-Q2-${Date.now()}`, status: 'approved', date: '01/01/2026', userId: user.id } })
    const salesOrder = await db.salesOrder.create({ data: { number: `CO-SO2-${Date.now()}`, status: 'open', date: '01/01/2026', quoteId: quote.id, userId: user.id } })
    const invoice = await db.invoice.create({ data: { number: `CO-INV-${Date.now()}`, salesOrderId: salesOrder.id, status: 'issued', total: 100, issuedAt: new Date(), userId: user.id } })
    const overdueReceivable = await db.accountReceivable.create({ data: { number: `CO-AR-${Date.now()}`, invoiceId: invoice.id, amount: 100, dueDate: PAST, status: 'open', userId: user.id } })

    const supplier = await createTestSupplier('centro-op-contas-vencidas')
    const material = await createTestMaterial('centro-op-contas-vencidas')
    const requisition = await db.requisition.create({ data: { number: `CO-REQ-${Date.now()}`, tipo: 'PRODUCAO', originModule: 'manual', date: '01/01/2026', userId: user.id } })
    const po = await db.purchaseOrder.create({ data: { number: `CO-PO-${Date.now()}`, status: 'confirmed', date: '01/01/2026', supplierId: supplier.id, requisitionId: requisition.id, userId: user.id } })
    const overduePayable = await db.accountPayable.create({ data: { number: `CO-AP-${Date.now()}`, purchaseOrderId: po.id, amount: 100, dueDate: PAST, status: 'open', userId: user.id } })

    const kpis = await centroOperacoesService.getOperationalKpis()
    const contasVencidas = kpis.find((k) => k.widget.id === 'financeiro.contas-vencidas')!
    const data = contasVencidas.widget.data as { value: number }
    expect(data.value).toBeGreaterThanOrEqual(2) // pelo menos os 2 criados aqui

    await db.accountReceivable.delete({ where: { id: overdueReceivable.id } })
    await db.accountPayable.delete({ where: { id: overduePayable.id } })
    await db.invoice.delete({ where: { id: invoice.id } })
    await db.purchaseOrder.delete({ where: { id: po.id } })
    await db.requisition.delete({ where: { id: requisition.id } })
    await db.supplier.delete({ where: { id: supplier.id } })
    await db.material.delete({ where: { id: material.id } })
    await db.salesOrder.delete({ where: { id: salesOrder.id } })
    await db.quote.delete({ where: { id: quote.id } })
    await db.user.delete({ where: { id: user.id } })
  })

  it('6. getPayload combina pipeline + alerts + kpis num único objeto', async () => {
    const payload = await centroOperacoesService.getPayload()
    expect(payload.pipeline).toHaveLength(6)
    expect(Array.isArray(payload.alerts)).toBe(true)
    expect(payload.kpis).toHaveLength(4)
  })
})
