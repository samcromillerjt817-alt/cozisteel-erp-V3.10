import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { db } from '@/lib/db'
import { registerDomainEventHandlers } from '@/lib/register-domain-event-handlers'
import { quoteService } from '@/app/services/quote.service'
import { invoiceService } from '@/app/services/invoice.service'
import { financialAccountService } from '@/app/services/financial-account.service'
import { financialReportService } from '@/app/services/financial-report.service'
import { requisitionService } from '@/app/services/requisition.service'
import { purchaseOrderService } from '@/app/services/purchase-order.service'
import { bomService } from '@/app/services/bom.service'
import { productionOrderService } from '@/app/services/production-order.service'
import { createTestUser, createTestProduct, createTestMaterial, createTestSupplier } from './helpers/fixtures'

/**
 * Fase 12 (ADR-016, Subetapa 6) — `FinancialReportService`. Saldo/fluxo de caixa são precisos (dado
 * já existente em `AccountReceivable`/`AccountPayable`). Margem bruta é uma ESTIMATIVA agregada —
 * disclosed, sem vínculo `SalesOrderItem`→`ProductBatch` no schema hoje.
 */
describe('Financeiro — FinancialReportService (Fase 12, Subetapa 6)', () => {
  const createdUserIds: string[] = []
  const createdQuoteIds: string[] = []
  const createdSalesOrderIds: string[] = []
  const createdInvoiceIds: string[] = []
  const createdMaterialIds: string[] = []
  const createdSupplierIds: string[] = []
  const createdRequisitionIds: string[] = []
  const createdPurchaseOrderIds: string[] = []
  const createdProductIds: string[] = []
  const createdRevisionIds: string[] = []
  const createdOrderIds: string[] = []

  beforeAll(() => {
    registerDomainEventHandlers()
  })

  afterAll(async () => {
    await db.receipt.deleteMany({ where: { accountReceivable: { invoiceId: { in: createdInvoiceIds } } } })
    await db.accountReceivable.deleteMany({ where: { invoiceId: { in: createdInvoiceIds } } })
    await db.invoice.deleteMany({ where: { id: { in: createdInvoiceIds } } })
    await db.payment.deleteMany({ where: { accountPayable: { purchaseOrderId: { in: createdPurchaseOrderIds } } } })
    await db.accountPayable.deleteMany({ where: { purchaseOrderId: { in: createdPurchaseOrderIds } } })
    await db.stockMovement.deleteMany({ where: { referenceId: { in: [...createdPurchaseOrderIds, ...createdOrderIds] } } })
    await db.batchConsumption.deleteMany({ where: { productBatch: { productionOrderId: { in: createdOrderIds } } } })
    await db.productBatch.deleteMany({ where: { productionOrderId: { in: createdOrderIds } } })
    await db.materialBatch.deleteMany({ where: { materialId: { in: createdMaterialIds } } })
    await db.productionOrderExecution.deleteMany({ where: { productionOrderId: { in: createdOrderIds } } })
    await db.materialReservation.deleteMany({ where: { productionOrderId: { in: createdOrderIds } } })
    await db.productionOrder.deleteMany({ where: { id: { in: createdOrderIds } } })
    await db.bomRevision.deleteMany({ where: { id: { in: createdRevisionIds } } })
    await db.purchaseOrder.deleteMany({ where: { requisitionId: { in: createdRequisitionIds } } })
    await db.requisition.deleteMany({ where: { id: { in: createdRequisitionIds } } })
    await db.supplier.deleteMany({ where: { id: { in: createdSupplierIds } } })
    await db.salesOrder.deleteMany({ where: { id: { in: createdSalesOrderIds } } })
    await db.quote.deleteMany({ where: { id: { in: createdQuoteIds } } })
    await db.material.deleteMany({ where: { id: { in: createdMaterialIds } } })
    await db.product.deleteMany({ where: { id: { in: createdProductIds } } })
    await db.statusHistory.deleteMany({ where: { userId: { in: createdUserIds } } })
    await db.user.deleteMany({ where: { id: { in: createdUserIds } } })
  })

  async function createInvoicedSalesOrder(suffix: string, total: number, paymentTerms = '') {
    const user = await createTestUser(suffix)
    createdUserIds.push(user.id)
    const quote = (await quoteService.create(
      { status: 'draft', discountType: 'value', discountValue: 0, paymentTerms, items: [{ productId: null, code: 'FR-1', description: 'Item', quantity: 1, unit: 'UN', unitPrice: total, notes: '' }] } as never,
      user.id
    )) as { id: string }
    createdQuoteIds.push(quote.id)
    await quoteService.changeStatus(quote.id, 'sent', user.id)
    const approved = (await quoteService.changeStatus(quote.id, 'approved', user.id)) as {
      generatedProductionOrders: Array<{ id: string }>
    }
    createdOrderIds.push(...approved.generatedProductionOrders.map((o) => o.id))
    const salesOrder = (await quoteService.convertToSalesOrder(quote.id, user.id)) as { id: string }
    createdSalesOrderIds.push(salesOrder.id)
    const invoice = (await invoiceService.createFromSalesOrder(salesOrder.id, total, user.id)) as { id: string }
    createdInvoiceIds.push(invoice.id)
    const receivable = (await db.accountReceivable.findUnique({ where: { invoiceId: invoice.id } }))!
    return { user, salesOrder, invoice, receivable }
  }

  async function createReceivedPurchaseOrder(suffix: string, quantity: number, unitPrice: number) {
    const user = await createTestUser(suffix)
    createdUserIds.push(user.id)
    const material = await createTestMaterial(suffix)
    createdMaterialIds.push(material.id)
    const supplier = await createTestSupplier(suffix)
    createdSupplierIds.push(supplier.id)

    const requisition = (await requisitionService.create(
      { tipo: 'PRODUCAO', originModule: 'manual', productionOrderId: null, neededBy: '', notes: '', items: [{ materialId: material.id, description: '', supplierId: supplier.id, quantity, unit: 'KG', estimatedPrice: unitPrice, notes: '' }] },
      user.id
    )) as { id: string }
    createdRequisitionIds.push(requisition.id)
    await requisitionService.changeStatus(requisition.id, 'sent', user.id)
    await requisitionService.changeStatus(requisition.id, 'approved', user.id)
    const result = (await requisitionService.changeStatus(requisition.id, 'ordered', user.id)) as { generatedPurchaseOrders: Array<{ id: string }> }
    const purchaseOrderId = result.generatedPurchaseOrders[0].id
    createdPurchaseOrderIds.push(purchaseOrderId)

    await purchaseOrderService.changeStatus(purchaseOrderId, 'pending_approval', user.id)
    await purchaseOrderService.changeStatus(purchaseOrderId, 'approved', user.id)
    await purchaseOrderService.changeStatus(purchaseOrderId, 'sent', user.id)
    await purchaseOrderService.changeStatus(purchaseOrderId, 'confirmed', user.id)
    const purchaseOrder = await db.purchaseOrder.findUnique({ where: { id: purchaseOrderId }, include: { items: true } })
    await purchaseOrderService.receive(purchaseOrderId, { items: [{ purchaseOrderItemId: purchaseOrder!.items[0].id, quantityReceived: quantity }] }, user.id)
    const payable = (await db.accountPayable.findUnique({ where: { purchaseOrderId } }))!
    return { user, payable }
  }

  it('1. getAccountBalances: soma saldo em aberto e vencido, separando receber de pagar', async () => {
    const { receivable } = await createInvoicedSalesOrder('report-balance-ar', 1000)
    await financialAccountService.registerReceipt(receivable.id, 300, new Date(), '', createdUserIds[createdUserIds.length - 1])
    // título vencido de propósito: due date no passado
    await db.accountReceivable.update({ where: { id: receivable.id }, data: { dueDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) } })

    const { payable } = await createReceivedPurchaseOrder('report-balance-ap', 10, 20)

    const balances = await financialReportService.getAccountBalances()

    // 1000 - 300 pago = 700 em aberto, e como venceu, também está em "vencido"
    expect(balances.receivable.open).toBeGreaterThanOrEqual(700)
    expect(balances.receivable.overdue).toBeGreaterThanOrEqual(700)
    // 10 * 20 = 200 em aberto (nenhum pagamento registrado ainda)
    expect(balances.payable.open).toBeGreaterThanOrEqual(200)

    void payable
  })

  it('2. getProjectedCashFlow: bucket por data de vencimento, título já vencido cai no bucket de hoje', async () => {
    const { receivable } = await createInvoicedSalesOrder('report-cashflow', 500)
    await db.accountReceivable.update({ where: { id: receivable.id }, data: { dueDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000) } })

    const cashFlow = await financialReportService.getProjectedCashFlow(90)
    const todayKey = new Date().toISOString().slice(0, 10)
    const todayBucket = cashFlow.find((b) => b.date === todayKey)

    expect(todayBucket).toBeDefined()
    expect(todayBucket!.receivable).toBeGreaterThanOrEqual(500)
  })

  it('3. getStockValuation delega para StockValuationService (mesmo total)', async () => {
    const { stockValuationService } = await import('@/app/services/stock-valuation.service')
    const direct = await stockValuationService.getTotalValuation()
    const viaReport = await financialReportService.getStockValuation()
    expect(viaReport).toEqual(direct)
  })

  it('4. getGrossMarginEstimate: receita real menos custo estimado via ProductBatch.materialCost mais recente', async () => {
    const user = await createTestUser('report-margin')
    createdUserIds.push(user.id)
    const mesa = await createTestProduct('report-margin-mesa')
    createdProductIds.push(mesa.id)
    await db.product.update({ where: { id: mesa.id }, data: { lotControlled: true } })
    const tubo = await createTestMaterial('report-margin-tubo')
    createdMaterialIds.push(tubo.id)
    await db.material.update({ where: { id: tubo.id }, data: { lotControlled: true, stockQty: 1000 } })
    const batch = await db.materialBatch.create({ data: { materialId: tubo.id, batchNumber: 'REPORT-MARGIN', quantityReceived: 1000, quantityAvailable: 1000, unitCost: 5 } })

    const revision = (await bomService.createRevision(mesa.id, { revisionCode: 'A', notes: '' }, user.id)) as { id: string }
    createdRevisionIds.push(revision.id)
    await bomService.addLine(revision.id, { lineType: 'material', materialId: tubo.id, componentProductId: null, quantity: 2, unit: 'KG', scrapPct: 0, order: 0, notes: '' })
    await bomService.changeStatus(revision.id, 'released', user.id)
    const order = (await productionOrderService.create({ productId: mesa.id, quantity: 10, unit: 'UN' }, user.id)) as { id: string }
    createdOrderIds.push(order.id)
    await productionOrderService.produce(order.id, 10, user.id) // materialCost do lote = 10un * 2kg * R$5 = R$100 (R$10/un)

    // Vende 3 unidades desse produto por R$50 cada = R$150 de receita
    const quote = (await quoteService.create(
      { status: 'draft', discountType: 'value', discountValue: 0, items: [{ productId: mesa.id, code: 'M1', description: 'Mesa', quantity: 3, unit: 'UN', unitPrice: 50, notes: '' }] } as never,
      user.id
    )) as { id: string }
    createdQuoteIds.push(quote.id)
    await quoteService.changeStatus(quote.id, 'sent', user.id)
    const approved = (await quoteService.changeStatus(quote.id, 'approved', user.id)) as {
      generatedProductionOrders: Array<{ id: string }>
    }
    createdOrderIds.push(...approved.generatedProductionOrders.map((o) => o.id))
    const salesOrder = (await quoteService.convertToSalesOrder(quote.id, user.id)) as { id: string }
    createdSalesOrderIds.push(salesOrder.id)

    const from = new Date(Date.now() - 60 * 1000)
    const to = new Date(Date.now() + 60 * 1000)
    const margin = await financialReportService.getGrossMarginEstimate(from, to)

    expect(margin.revenue).toBeGreaterThanOrEqual(150)
    expect(margin.estimatedCost).toBeGreaterThanOrEqual(30) // 3un * R$10/un de custo de material
    expect(margin.costCoveragePercent).toBeGreaterThan(0)

    void batch
  })

  it('5. getMaterialCostHistory: série histórica ordenada por data de produção, só lotes com custo já calculado', async () => {
    const user = await createTestUser('report-cost-history')
    createdUserIds.push(user.id)
    const mesa = await createTestProduct('report-cost-history-mesa')
    createdProductIds.push(mesa.id)
    await db.product.update({ where: { id: mesa.id }, data: { lotControlled: true } })
    const tubo = await createTestMaterial('report-cost-history-tubo')
    createdMaterialIds.push(tubo.id)
    await db.material.update({ where: { id: tubo.id }, data: { lotControlled: true, stockQty: 1000 } })
    await db.materialBatch.create({ data: { materialId: tubo.id, batchNumber: 'REPORT-HIST', quantityReceived: 1000, quantityAvailable: 1000, unitCost: 2 } })

    const revision = (await bomService.createRevision(mesa.id, { revisionCode: 'A', notes: '' }, user.id)) as { id: string }
    createdRevisionIds.push(revision.id)
    await bomService.addLine(revision.id, { lineType: 'material', materialId: tubo.id, componentProductId: null, quantity: 1, unit: 'KG', scrapPct: 0, order: 0, notes: '' })
    await bomService.changeStatus(revision.id, 'released', user.id)
    const order = (await productionOrderService.create({ productId: mesa.id, quantity: 10, unit: 'UN' }, user.id)) as { id: string }
    createdOrderIds.push(order.id)
    await productionOrderService.produce(order.id, 4, user.id) // rodada 1: R$8
    await productionOrderService.produce(order.id, 6, user.id) // rodada 2: R$12

    const history = await financialReportService.getMaterialCostHistory(mesa.id)
    expect(history).toHaveLength(2)
    expect(history[0].materialCost).toBe(8)
    expect(history[1].materialCost).toBe(12)
    expect(history[0].producedAt.getTime()).toBeLessThanOrEqual(history[1].producedAt.getTime())
  })
})
