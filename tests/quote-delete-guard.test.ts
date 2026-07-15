import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { db } from '@/lib/db'
import { registerDomainEventHandlers } from '@/lib/register-domain-event-handlers'
import { quoteService } from '@/app/services/quote.service'
import { createTestUser } from './helpers/fixtures'

/**
 * Regressão encontrada revisando os logs de produção do PM2 (Fase 12, verificação de integridade
 * pós-deploy) — `quoteService.delete()` chamava `quoteRepository.delete()` sem checar se o orçamento
 * já tinha sido convertido em Pedido de Venda, deixando o `PrismaClientKnownRequestError` (FK
 * violation, `SalesOrder.quoteId` é `@unique` sem cascade) vazar cru até o usuário em vez de uma
 * mensagem de negócio clara — mesmo padrão já usado em `convertToSalesOrder()` para o mesmo caso.
 */
describe('Orçamentos — guarda de exclusão contra orçamento já convertido', () => {
  const createdUserIds: string[] = []
  const createdQuoteIds: string[] = []
  const createdSalesOrderIds: string[] = []

  beforeAll(() => {
    registerDomainEventHandlers()
  })

  afterAll(async () => {
    await db.salesOrder.deleteMany({ where: { id: { in: createdSalesOrderIds } } })
    await db.quote.deleteMany({ where: { id: { in: createdQuoteIds } } })
    await db.statusHistory.deleteMany({ where: { userId: { in: createdUserIds } } })
    await db.user.deleteMany({ where: { id: { in: createdUserIds } } })
  })

  async function createApprovedQuote(suffix: string) {
    const user = await createTestUser(suffix)
    createdUserIds.push(user.id)
    const quote = (await quoteService.create(
      { status: 'draft', discountType: 'value', discountValue: 0, items: [{ productId: null, code: 'QD-1', description: 'Item', quantity: 1, unit: 'UN', unitPrice: 100, notes: '' }] } as never,
      user.id
    )) as { id: string }
    createdQuoteIds.push(quote.id)
    await quoteService.changeStatus(quote.id, 'sent', user.id)
    await quoteService.changeStatus(quote.id, 'approved', user.id)
    return { user, quote }
  }

  it('1. rejeita a exclusão de um orçamento já convertido, com mensagem de negócio clara', async () => {
    const { user, quote } = await createApprovedQuote('delete-guard-converted')
    const salesOrder = (await quoteService.convertToSalesOrder(quote.id, user.id)) as { id: string; number: string }
    createdSalesOrderIds.push(salesOrder.id)

    await expect(quoteService.delete(quote.id, user.id)).rejects.toThrow(/já foi convertido no Pedido de Venda/)
  })

  it('2. permite excluir normalmente um orçamento aprovado que NUNCA foi convertido', async () => {
    const { user, quote } = await createApprovedQuote('delete-guard-not-converted')

    const result = await quoteService.delete(quote.id, user.id)
    expect(result).toEqual({ success: true })
    createdQuoteIds.splice(createdQuoteIds.indexOf(quote.id), 1) // já foi excluído, não precisa limpar de novo

    const stillExists = await db.quote.findUnique({ where: { id: quote.id } })
    expect(stillExists).toBeNull()
  })
})
