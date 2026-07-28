import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { db } from '@/lib/db'
import { registerDomainEventHandlers } from '@/lib/register-domain-event-handlers'
import { periodClosingService } from '@/app/services/period-closing.service'
import { financialAccountService } from '@/app/services/financial-account.service'
import { requisitionService } from '@/app/services/requisition.service'
import { purchaseOrderService } from '@/app/services/purchase-order.service'
import { quoteService } from '@/app/services/quote.service'
import { invoiceService } from '@/app/services/invoice.service'
import { createTestUser, createTestMaterial, createTestSupplier } from './helpers/fixtures'

function currentPeriod(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

/**
 * ADR-023 (item 6, Decisão #5) — Fechamento Mensal por COMPETÊNCIA. Estes testes fecham o período
 * ATUAL de propósito (é o único jeito de exercitar o bloqueio contra títulos recém-criados, que
 * sempre nascem com `competenceDate = hoje`) — por isso o `afterAll` SEMPRE apaga a `PeriodClosing`
 * criada aqui, nunca deixando o mês corrente fechado para outros arquivos de teste que rodam contra
 * o mesmo `test.db`.
 */
describe('Fechamento Mensal — Competência (ADR-023, item 6)', () => {
  const createdUserIds: string[] = []
  const createdMaterialIds: string[] = []
  const createdSupplierIds: string[] = []
  const createdRequisitionIds: string[] = []
  const createdPurchaseOrderIds: string[] = []
  const createdQuoteIds: string[] = []
  const createdSalesOrderIds: string[] = []
  const createdInvoiceIds: string[] = []
  const createdPeriodClosingIds: string[] = []

  beforeAll(() => {
    registerDomainEventHandlers()
  })

  afterAll(async () => {
    // SEMPRE primeiro — garante que o mês corrente nunca fica fechado para outros testes, mesmo se
    // uma asserção falhar no meio do arquivo.
    await db.periodClosing.deleteMany({ where: { id: { in: createdPeriodClosingIds } } })

    await db.payment.deleteMany({ where: { accountPayable: { purchaseOrderId: { in: createdPurchaseOrderIds } } } })
    await db.accountPayable.deleteMany({ where: { purchaseOrderId: { in: createdPurchaseOrderIds } } })
    await db.stockMovement.deleteMany({ where: { referenceId: { in: createdPurchaseOrderIds } } })
    await db.purchaseOrder.deleteMany({ where: { requisitionId: { in: createdRequisitionIds } } })
    await db.requisition.deleteMany({ where: { id: { in: createdRequisitionIds } } })
    await db.supplier.deleteMany({ where: { id: { in: createdSupplierIds } } })
    await db.material.deleteMany({ where: { id: { in: createdMaterialIds } } })

    await db.receipt.deleteMany({ where: { accountReceivable: { invoiceId: { in: createdInvoiceIds } } } })
    await db.accountReceivable.deleteMany({ where: { invoiceId: { in: createdInvoiceIds } } })
    await db.invoice.deleteMany({ where: { id: { in: createdInvoiceIds } } })
    await db.salesOrder.deleteMany({ where: { id: { in: createdSalesOrderIds } } })
    await db.quote.deleteMany({ where: { id: { in: createdQuoteIds } } })

    await db.statusHistory.deleteMany({ where: { userId: { in: createdUserIds } } })
    await db.auditLog.deleteMany({ where: { userId: { in: createdUserIds } } })
    await db.user.deleteMany({ where: { id: { in: createdUserIds } } })
  })

  async function createReceivedPurchaseOrder(suffix: string, quantity = 10) {
    const user = await createTestUser(suffix)
    createdUserIds.push(user.id)
    const material = await createTestMaterial(suffix)
    createdMaterialIds.push(material.id)
    const supplier = await createTestSupplier(suffix)
    createdSupplierIds.push(supplier.id)

    const requisition = (await requisitionService.create(
      { tipo: 'PRODUCAO', originModule: 'manual', productionOrderId: null, neededBy: '', notes: '', items: [{ materialId: material.id, description: '', supplierId: supplier.id, quantity, unit: 'KG', estimatedPrice: 10, notes: '' }] },
      user.id
    )) as { id: string }
    createdRequisitionIds.push(requisition.id)
    await requisitionService.changeStatus(requisition.id, 'sent', user.id)
    await requisitionService.changeStatus(requisition.id, 'approved', user.id)
    const result = (await requisitionService.changeStatus(requisition.id, 'ordered', user.id)) as {
      generatedPurchaseOrders: Array<{ id: string; number: string }>
    }
    const purchaseOrder = result.generatedPurchaseOrders[0]
    createdPurchaseOrderIds.push(purchaseOrder.id)

    await purchaseOrderService.changeStatus(purchaseOrder.id, 'pending_approval', user.id)
    await purchaseOrderService.changeStatus(purchaseOrder.id, 'approved', user.id)
    await purchaseOrderService.changeStatus(purchaseOrder.id, 'sent', user.id)
    await purchaseOrderService.changeStatus(purchaseOrder.id, 'confirmed', user.id)

    const poWithItems = await db.purchaseOrder.findUnique({ where: { id: purchaseOrder.id }, include: { items: true } })
    const item = poWithItems!.items[0]
    await purchaseOrderService.receive(purchaseOrder.id, { items: [{ purchaseOrderItemId: item.id, quantityReceived: item.quantity }] }, user.id)

    const accountPayable = await db.accountPayable.findUniqueOrThrow({ where: { purchaseOrderId: purchaseOrder.id } })
    return { user, accountPayable }
  }

  async function createIssuedInvoice(suffix: string, total = 500) {
    const user = await createTestUser(suffix)
    createdUserIds.push(user.id)
    const quote = (await quoteService.create(
      { status: 'draft', discountType: 'value', discountValue: 0, paymentTerms: '', items: [{ productId: null, code: 'FEC-1', description: 'Item de teste', quantity: 1, unit: 'UN', unitPrice: total, notes: '' }] } as never,
      user.id
    )) as { id: string }
    createdQuoteIds.push(quote.id)
    await quoteService.changeStatus(quote.id, 'sent', user.id)
    await quoteService.changeStatus(quote.id, 'approved', user.id)
    const salesOrder = (await quoteService.convertToSalesOrder(quote.id, user.id)) as { id: string }
    createdSalesOrderIds.push(salesOrder.id)
    const item = await db.salesOrderItem.findFirstOrThrow({ where: { salesOrderId: salesOrder.id } })

    const invoice = (await invoiceService.createFromSalesOrder(salesOrder.id, [{ salesOrderItemId: item.id, quantity: 1 }], '', user.id)) as { id: string }
    createdInvoiceIds.push(invoice.id)

    const accountReceivable = await db.accountReceivable.findUniqueOrThrow({ where: { invoiceId: invoice.id } })
    return { user, accountReceivable }
  }

  it('1. Recusa fechar período em formato inválido', async () => {
    await expect(periodClosingService.close('2026/07', 'x', '')).rejects.toThrow(/Período inválido/)
  })

  it('2. Fecha e reabre um período passado sem afetar nada (mês sem nenhum título)', async () => {
    const user = await createTestUser('period-closing-basic')
    createdUserIds.push(user.id)

    const closing = await periodClosingService.close('2020-01', user.id, 'teste')
    createdPeriodClosingIds.push(closing.id)
    expect(closing.status).toBe('closed')
    expect(await periodClosingService.isPeriodClosed('2020-01')).toBe(true)

    await expect(periodClosingService.close('2020-01', user.id, '')).rejects.toThrow(/já está fechada/)

    await periodClosingService.reopen('2020-01', user.id, 'reabrindo para teste')
    expect(await periodClosingService.isPeriodClosed('2020-01')).toBe(false)
  })

  it('3. Recusa reabrir período nunca fechado', async () => {
    await expect(periodClosingService.reopen('2019-05', 'x', 'motivo')).rejects.toThrow(/nunca foi fechada/)
  })

  it('4. Fechar a competência atual bloqueia registrar pagamento num título a pagar gerado nela', async () => {
    const { user, accountPayable } = await createReceivedPurchaseOrder('period-closing-payable-block')

    const closing = await periodClosingService.close(currentPeriod(), user.id, 'fechamento de teste')
    createdPeriodClosingIds.push(closing.id)

    await expect(
      financialAccountService.registerPayment(accountPayable.id, 10, new Date(), '', user.id)
    ).rejects.toThrow(/competência .* está fechada/)

    await periodClosingService.reopen(currentPeriod(), user.id, 'reabrindo para permitir o resto dos testes')

    const paid = await financialAccountService.registerPayment(accountPayable.id, 10, new Date(), '', user.id)
    expect((paid as { status: string }).status).toBeDefined()
  })

  it('5. Fechar a competência atual bloqueia registrar recebimento e cancelar um título a receber gerado nela', async () => {
    const { user, accountReceivable } = await createIssuedInvoice('period-closing-receivable-block')

    const closing = await periodClosingService.close(currentPeriod(), user.id, 'fechamento de teste')
    createdPeriodClosingIds.push(closing.id)

    await expect(
      financialAccountService.registerReceipt(accountReceivable.id, 10, new Date(), '', user.id)
    ).rejects.toThrow(/competência .* está fechada/)
    await expect(financialAccountService.cancelReceivable(accountReceivable.id, user.id)).rejects.toThrow(/competência .* está fechada/)

    await periodClosingService.reopen(currentPeriod(), user.id, 'reabrindo para permitir o resto dos testes')

    const cancelled = await financialAccountService.cancelReceivable(accountReceivable.id, user.id)
    expect((cancelled as { status: string }).status).toBe('cancelled')
  })

  it('6. updateCompetenceDate recusa mover um título para dentro de um período já fechado', async () => {
    const { user, accountReceivable } = await createIssuedInvoice('period-closing-move-block')

    const closing = await periodClosingService.close('2021-03', user.id, 'competência de destino fechada')
    createdPeriodClosingIds.push(closing.id)

    await expect(
      financialAccountService.updateCompetenceDate('receivable', accountReceivable.id, new Date(2021, 2, 15), 'tentando mover para período fechado', user.id)
    ).rejects.toThrow(/competência .* está fechada/)
  })

  it('7. updateCompetenceDate funciona normalmente quando origem e destino estão abertos', async () => {
    const { user, accountReceivable } = await createIssuedInvoice('period-closing-move-ok')

    const updated = await financialAccountService.updateCompetenceDate(
      'receivable', accountReceivable.id, new Date(2022, 5, 10), 'ajuste de competência de teste', user.id
    )
    expect((updated as { competenceDate: Date }).competenceDate.getFullYear()).toBe(2022)
  })
})
