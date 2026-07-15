import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { db } from '@/lib/db'
import { registerDomainEventHandlers } from '@/lib/register-domain-event-handlers'
import { quoteService } from '@/app/services/quote.service'
import { invoiceService } from '@/app/services/invoice.service'
import { requisitionService } from '@/app/services/requisition.service'
import { purchaseOrderService } from '@/app/services/purchase-order.service'
import { financialAccountService } from '@/app/services/financial-account.service'
import { createTestUser, createTestMaterial, createTestSupplier } from './helpers/fixtures'

/**
 * Fase 12 (ADR-016, Subetapa 7) — `listPayables`/`getPayableById`/`listReceivables`/
 * `getReceivableById`, os únicos métodos de Service genuinamente novos desta subetapa (o resto é
 * RBAC + rotas finas que só delegam ao que já existia, sem lógica própria a testar).
 */
describe('Financeiro — listagem/detalhe de Contas a Pagar/Receber (Fase 12, Subetapa 7)', () => {
  const createdUserIds: string[] = []
  const createdQuoteIds: string[] = []
  const createdSalesOrderIds: string[] = []
  const createdInvoiceIds: string[] = []
  const createdMaterialIds: string[] = []
  const createdSupplierIds: string[] = []
  const createdRequisitionIds: string[] = []
  const createdPurchaseOrderIds: string[] = []
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
    await db.materialBatch.deleteMany({ where: { materialId: { in: createdMaterialIds } } })
    await db.productionOrder.deleteMany({ where: { id: { in: createdOrderIds } } })
    await db.purchaseOrder.deleteMany({ where: { requisitionId: { in: createdRequisitionIds } } })
    await db.requisition.deleteMany({ where: { id: { in: createdRequisitionIds } } })
    await db.supplier.deleteMany({ where: { id: { in: createdSupplierIds } } })
    await db.salesOrder.deleteMany({ where: { id: { in: createdSalesOrderIds } } })
    await db.quote.deleteMany({ where: { id: { in: createdQuoteIds } } })
    await db.material.deleteMany({ where: { id: { in: createdMaterialIds } } })
    await db.statusHistory.deleteMany({ where: { userId: { in: createdUserIds } } })
    await db.user.deleteMany({ where: { id: { in: createdUserIds } } })
  })

  async function createInvoicedSalesOrder(suffix: string, total: number) {
    const user = await createTestUser(suffix)
    createdUserIds.push(user.id)
    const quote = (await quoteService.create(
      { status: 'draft', discountType: 'value', discountValue: 0, items: [{ productId: null, code: 'FL-1', description: 'Item', quantity: 1, unit: 'UN', unitPrice: total, notes: '' }] } as never,
      user.id
    )) as { id: string }
    createdQuoteIds.push(quote.id)
    await quoteService.changeStatus(quote.id, 'sent', user.id)
    await quoteService.changeStatus(quote.id, 'approved', user.id)
    const salesOrder = (await quoteService.convertToSalesOrder(quote.id, user.id)) as { id: string }
    createdSalesOrderIds.push(salesOrder.id)
    const invoice = (await invoiceService.createFromSalesOrder(salesOrder.id, total, user.id)) as { id: string }
    createdInvoiceIds.push(invoice.id)
    const receivable = (await db.accountReceivable.findUnique({ where: { invoiceId: invoice.id } }))!
    return { user, receivable }
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

  it('1. listPayables: filtra por status e devolve paginação', async () => {
    const { payable } = await createReceivedPurchaseOrder('list-ap', 5, 10)

    const page1 = await financialAccountService.listPayables({ status: 'open', search: '', page: 1, limit: 20 })
    expect(page1.data.some((p) => p.id === payable.id)).toBe(true)
    expect(page1.total).toBeGreaterThanOrEqual(1)

    const paidOnly = await financialAccountService.listPayables({ status: 'paid', search: '', page: 1, limit: 20 })
    expect(paidOnly.data.some((p) => p.id === payable.id)).toBe(false)
  })

  it('2. getPayableById: devolve o título com relacionamentos (pedido de compra, pagamentos)', async () => {
    const { payable } = await createReceivedPurchaseOrder('detail-ap', 3, 10)

    const detailed = (await financialAccountService.getPayableById(payable.id)) as { id: string; purchaseOrder: { id: string } }
    expect(detailed.id).toBe(payable.id)
    expect(detailed.purchaseOrder).toBeDefined()
  })

  it('3. getPayableById: lança NotFoundException para id inexistente', async () => {
    await expect(financialAccountService.getPayableById('id-que-nao-existe')).rejects.toThrow()
  })

  it('4. listReceivables: filtra por status e devolve paginação', async () => {
    const { receivable } = await createInvoicedSalesOrder('list-ar', 500)

    const page1 = await financialAccountService.listReceivables({ status: 'open', search: '', page: 1, limit: 20 })
    expect(page1.data.some((r) => r.id === receivable.id)).toBe(true)
  })

  it('5. getReceivableById: devolve o título com relacionamentos (fatura, recebimentos)', async () => {
    const { receivable } = await createInvoicedSalesOrder('detail-ar', 300)

    const detailed = (await financialAccountService.getReceivableById(receivable.id)) as { id: string; invoice: { id: string } }
    expect(detailed.id).toBe(receivable.id)
    expect(detailed.invoice).toBeDefined()
  })

  it('6. getReceivableById: lança NotFoundException para id inexistente', async () => {
    await expect(financialAccountService.getReceivableById('id-que-nao-existe')).rejects.toThrow()
  })
})
