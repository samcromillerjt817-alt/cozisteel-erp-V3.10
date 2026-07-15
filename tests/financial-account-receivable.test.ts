import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { db } from '@/lib/db'
import { registerDomainEventHandlers } from '@/lib/register-domain-event-handlers'
import { quoteService } from '@/app/services/quote.service'
import { invoiceService } from '@/app/services/invoice.service'
import { financialAccountService } from '@/app/services/financial-account.service'
import { createTestUser } from './helpers/fixtures'

/**
 * Fase 12 (ADR-016, Subetapa 1/4) — Faturamento + Contas a Receber. Decisão pendente #1 resolvida:
 * `Invoice` é entidade própria (não campo em `SalesOrder`) — um Pedido de Venda pode gerar mais de 1
 * Invoice (faturamento parcial), cada uma com no máximo 1 título a receber (`invoiceId @unique`).
 * Vencimento do título é sempre lido de `SalesOrder.paymentTerms` (`resolveDueDate()`,
 * `src/lib/payment-terms.ts`) — nunca um prazo fixo próprio do Financeiro (achado do usuário,
 * 2026-07-14: reaproveitar a condição de pagamento já existente no Comercial, não duplicar).
 */
describe('Financeiro — Faturamento + Contas a Receber (Fase 12, Subetapa 1/4)', () => {
  const createdUserIds: string[] = []
  const createdQuoteIds: string[] = []
  const createdSalesOrderIds: string[] = []
  const createdInvoiceIds: string[] = []

  beforeAll(() => {
    registerDomainEventHandlers()
  })

  afterAll(async () => {
    await db.receipt.deleteMany({ where: { accountReceivable: { invoiceId: { in: createdInvoiceIds } } } })
    await db.accountReceivable.deleteMany({ where: { invoiceId: { in: createdInvoiceIds } } })
    await db.invoice.deleteMany({ where: { id: { in: createdInvoiceIds } } })
    await db.salesOrder.deleteMany({ where: { id: { in: createdSalesOrderIds } } })
    await db.quote.deleteMany({ where: { id: { in: createdQuoteIds } } })
    await db.statusHistory.deleteMany({ where: { userId: { in: createdUserIds } } })
    await db.user.deleteMany({ where: { id: { in: createdUserIds } } })
  })

  async function createSalesOrder(suffix: string, total = 500, paymentTerms = '') {
    const user = await createTestUser(suffix)
    createdUserIds.push(user.id)

    const quote = (await quoteService.create(
      {
        status: 'draft',
        discountType: 'value',
        discountValue: 0,
        paymentTerms,
        items: [{ productId: null, code: 'FIN-1', description: 'Item de teste', quantity: 1, unit: 'UN', unitPrice: total, notes: '' }],
      } as never,
      user.id
    )) as { id: string }
    createdQuoteIds.push(quote.id)

    await quoteService.changeStatus(quote.id, 'sent', user.id)
    await quoteService.changeStatus(quote.id, 'approved', user.id)
    const salesOrder = (await quoteService.convertToSalesOrder(quote.id, user.id)) as { id: string; number: string }
    createdSalesOrderIds.push(salesOrder.id)

    return { user, salesOrder }
  }

  it('1. Faturar um Pedido de Venda gera a Invoice e, via evento fatura.emitida, o título a receber correspondente', async () => {
    const { user, salesOrder } = await createSalesOrder('ar-invoice')

    const invoice = await invoiceService.createFromSalesOrder(salesOrder.id, 500, user.id)
    createdInvoiceIds.push((invoice as { id: string }).id)

    const receivable = await db.accountReceivable.findUnique({ where: { invoiceId: (invoice as { id: string }).id } })
    expect(receivable).not.toBeNull()
    expect(receivable?.amount).toBe(500)
    expect(receivable?.status).toBe('open')
  })

  it('2. Um mesmo Pedido de Venda pode gerar mais de 1 Invoice (faturamento parcial)', async () => {
    const { user, salesOrder } = await createSalesOrder('ar-partial-invoice', 1000)

    const invoice1 = (await invoiceService.createFromSalesOrder(salesOrder.id, 400, user.id)) as { id: string }
    createdInvoiceIds.push(invoice1.id)
    const invoice2 = (await invoiceService.createFromSalesOrder(salesOrder.id, 600, user.id)) as { id: string }
    createdInvoiceIds.push(invoice2.id)

    const invoices = await db.invoice.findMany({ where: { salesOrderId: salesOrder.id } })
    expect(invoices).toHaveLength(2)

    const receivables = await db.accountReceivable.findMany({ where: { invoiceId: { in: [invoice1.id, invoice2.id] } } })
    expect(receivables).toHaveLength(2)
    expect(receivables.map((r) => r.amount).sort()).toEqual([400, 600])
  })

  it('3. Faturar um pedido de venda cancelado é rejeitado', async () => {
    const { user, salesOrder } = await createSalesOrder('ar-cancelled-so')
    await db.salesOrder.update({ where: { id: salesOrder.id }, data: { status: 'cancelled' } })

    await expect(invoiceService.createFromSalesOrder(salesOrder.id, 100, user.id)).rejects.toThrow()
  })

  it('4. registerReceipt: recebimento parcial marca "partially_paid", total marca "paid"', async () => {
    const { user, salesOrder } = await createSalesOrder('ar-receipt', 500)
    const invoice = (await invoiceService.createFromSalesOrder(salesOrder.id, 500, user.id)) as { id: string }
    createdInvoiceIds.push(invoice.id)
    const receivable = (await db.accountReceivable.findUnique({ where: { invoiceId: invoice.id } }))!

    const afterPartial = await financialAccountService.registerReceipt(receivable.id, 200, new Date(), 'Recebimento 1', user.id)
    expect((afterPartial as { status: string }).status).toBe('partially_paid')

    const afterFull = await financialAccountService.registerReceipt(receivable.id, 300, new Date(), 'Recebimento 2', user.id)
    expect((afterFull as { status: string }).status).toBe('paid')

    const receipts = await db.receipt.findMany({ where: { accountReceivableId: receivable.id } })
    expect(receipts).toHaveLength(2)
  })

  it('5. registerReceipt rejeita valor que excede o saldo em aberto', async () => {
    const { user, salesOrder } = await createSalesOrder('ar-overpay', 500)
    const invoice = (await invoiceService.createFromSalesOrder(salesOrder.id, 500, user.id)) as { id: string }
    createdInvoiceIds.push(invoice.id)
    const receivable = (await db.accountReceivable.findUnique({ where: { invoiceId: invoice.id } }))!

    await expect(financialAccountService.registerReceipt(receivable.id, 501, new Date(), '', user.id)).rejects.toThrow()
  })

  it('6. cancelReceivable: permitido só em "open"; rejeitado depois de qualquer recebimento', async () => {
    const { user, salesOrder } = await createSalesOrder('ar-cancel', 500)
    const invoice = (await invoiceService.createFromSalesOrder(salesOrder.id, 500, user.id)) as { id: string }
    createdInvoiceIds.push(invoice.id)
    const receivable = (await db.accountReceivable.findUnique({ where: { invoiceId: invoice.id } }))!

    await financialAccountService.registerReceipt(receivable.id, 100, new Date(), '', user.id)
    await expect(financialAccountService.cancelReceivable(receivable.id, user.id)).rejects.toThrow()
  })

  it('7. createReceivableFromInvoice é idempotente: chamar de novo para a mesma Invoice não duplica', async () => {
    const { user, salesOrder } = await createSalesOrder('ar-idempotent', 500)
    const invoice = (await invoiceService.createFromSalesOrder(salesOrder.id, 500, user.id)) as { id: string; number: string }
    createdInvoiceIds.push(invoice.id)

    const again = await financialAccountService.createReceivableFromInvoice(invoice.id, invoice.number, 500, new Date(), user.id)
    const all = await db.accountReceivable.findMany({ where: { invoiceId: invoice.id } })
    expect(all).toHaveLength(1)
    expect((again as { id: string }).id).toBe(all[0].id)
  })

  it('8. AuditLog registra a emissão da fatura e a geração do título', async () => {
    const { user, salesOrder } = await createSalesOrder('ar-audit', 500)
    const invoice = (await invoiceService.createFromSalesOrder(salesOrder.id, 500, user.id)) as { id: string }
    createdInvoiceIds.push(invoice.id)

    const invoiceLogs = await db.auditLog.findMany({ where: { entityId: invoice.id, module: 'financeiro', action: 'CREATE' } })
    expect(invoiceLogs).toHaveLength(1)

    const receivable = (await db.accountReceivable.findUnique({ where: { invoiceId: invoice.id } }))!
    const receivableLogs = await db.auditLog.findMany({ where: { entityId: receivable.id, module: 'financeiro', action: 'CREATE' } })
    expect(receivableLogs).toHaveLength(1)
  })

  it('9. Vencimento do título reflete a condição de pagamento do Pedido de Venda (não um prazo fixo do Financeiro)', async () => {
    const { user, salesOrder } = await createSalesOrder('ar-payment-terms', 500, '45 dias')
    const before = Date.now()

    const invoice = (await invoiceService.createFromSalesOrder(salesOrder.id, 500, user.id)) as { id: string }
    createdInvoiceIds.push(invoice.id)
    const receivable = (await db.accountReceivable.findUnique({ where: { invoiceId: invoice.id } }))!

    const expectedMs = before + 45 * 24 * 60 * 60 * 1000
    // Tolerância de alguns segundos (tempo real de execução do teste), não um cálculo exato de ms.
    expect(Math.abs(receivable.dueDate.getTime() - expectedMs)).toBeLessThan(5000)
  })

  it('10. "À vista" vence imediatamente (0 dias)', async () => {
    const { user, salesOrder } = await createSalesOrder('ar-avista', 500, 'À vista')
    const before = Date.now()

    const invoice = (await invoiceService.createFromSalesOrder(salesOrder.id, 500, user.id)) as { id: string }
    createdInvoiceIds.push(invoice.id)
    const receivable = (await db.accountReceivable.findUnique({ where: { invoiceId: invoice.id } }))!

    expect(Math.abs(receivable.dueDate.getTime() - before)).toBeLessThan(5000)
  })
})
