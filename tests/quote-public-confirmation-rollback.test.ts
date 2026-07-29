import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { db } from '@/lib/db'
import { registerDomainEventHandlers } from '@/lib/register-domain-event-handlers'
import { quoteService } from '@/app/services/quote.service'
import { productionOrderRepository } from '@/app/repositories/production-order.repository'
import { createTestUser, createTestProduct } from './helpers/fixtures'

/**
 * Auditoria de segurança (2ª rodada) — se a criação de Ordem de Produção falhar NO MEIO (ex.: erro
 * de banco, violação de FK, item inválido), a transição de status do orçamento não pode "sobrar"
 * como aprovada sem nenhuma OP correspondente. Como o compare-and-swap em `confirmByClient` roda
 * FORA de uma `db.$transaction` (ver comentário do método — motivo é um teto de concorrência do
 * motor Prisma descoberto nesta auditoria), a garantia de "nenhuma gravação parcial" não vem de um
 * rollback automático de transação — vem de uma compensação explícita no `catch`: se a criação de
 * OP falhar, o status volta pra "sent" manualmente antes do erro ser propagado.
 */
describe('confirmByClient — compensação quando a criação de OP falha no meio (auditoria de segurança, 2ª rodada)', () => {
  const createdUserIds: string[] = []
  const createdQuoteIds: string[] = []
  const createdProductIds: string[] = []

  beforeAll(() => {
    registerDomainEventHandlers()
  })

  afterAll(async () => {
    await db.productionOrder.deleteMany({ where: { userId: { in: createdUserIds } } })
    await db.quote.deleteMany({ where: { id: { in: createdQuoteIds } } })
    await db.statusHistory.deleteMany({ where: { userId: { in: createdUserIds } } })
    await db.product.deleteMany({ where: { id: { in: createdProductIds } } })
    await db.user.deleteMany({ where: { id: { in: createdUserIds } } })
  })

  it('reverte o status pra "sent" (e limpa clientRespondedAt/approvedBy/approvedAt) quando a criação de OP falha', async () => {
    const user = await createTestUser('rollback-confirm')
    createdUserIds.push(user.id)
    const product = await createTestProduct('rollback-confirm')
    createdProductIds.push(product.id)

    const quote = (await quoteService.create(
      {
        status: 'draft',
        discountType: 'value',
        discountValue: 0,
        validUntil: '',
        items: [{ productId: product.id, code: 'RB-1', description: 'Item', quantity: 1, unit: 'UN', unitPrice: 100, notes: '' }],
      } as never,
      user.id
    )) as unknown as { id: string; number: string }
    createdQuoteIds.push(quote.id)

    const sent = (await quoteService.changeStatus(quote.id, 'sent', user.id)) as unknown as { publicToken: string | null }
    const token = sent.publicToken as string

    const spy = vi.spyOn(productionOrderRepository, 'createWithTx').mockRejectedValueOnce(new Error('Falha simulada na criação da OP'))

    try {
      await expect(quoteService.confirmByClient(token, 'approved')).rejects.toThrow('Falha simulada na criação da OP')

      const afterFailure = await db.quote.findUnique({ where: { id: quote.id } })
      expect(afterFailure?.status).toBe('sent') // revertido, não ficou "approved" sem OP correspondente
      expect(afterFailure?.clientRespondedAt).toBeNull()
      expect(afterFailure?.approvedBy).toBeNull()
      expect(afterFailure?.approvedAt).toBeNull()

      const orders = await db.productionOrder.findMany({ where: { description: { contains: quote.number } } })
      expect(orders.length).toBe(0) // nenhuma OP parcial sobrou

      // Depois da compensação, o link volta a funcionar normalmente — não fica travado num limbo.
      spy.mockRestore()
      const retried = await quoteService.confirmByClient(token, 'approved')
      expect(retried.status).toBe('approved')
      expect(retried.generatedProductionOrders.length).toBe(1)
    } finally {
      spy.mockRestore()
    }
  })
})
