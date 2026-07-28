import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { db } from '@/lib/db'
import { registerDomainEventHandlers } from '@/lib/register-domain-event-handlers'
import { quoteService } from '@/app/services/quote.service'
import { createTestUser } from './helpers/fixtures'

/**
 * ADR-024 addendum — link público de confirmação do orçamento pelo cliente (token na URL, sem
 * autenticação). Decisões do usuário: o cliente É o aprovador direto nesse fluxo (não passa pelo
 * motor de alçada do ADR-023), e o link expira junto com `Quote.validUntil`.
 */
describe('Orçamentos — confirmação do cliente via link público', () => {
  const createdUserIds: string[] = []
  const createdQuoteIds: string[] = []
  const createdProductionOrderIds: string[] = []

  beforeAll(() => {
    registerDomainEventHandlers()
  })

  afterAll(async () => {
    await db.productionOrder.deleteMany({ where: { id: { in: createdProductionOrderIds } } })
    await db.quote.deleteMany({ where: { id: { in: createdQuoteIds } } })
    await db.statusHistory.deleteMany({ where: { userId: { in: createdUserIds } } })
    await db.user.deleteMany({ where: { id: { in: createdUserIds } } })
  })

  async function createSentQuote(suffix: string, validUntil = '') {
    const user = await createTestUser(suffix)
    createdUserIds.push(user.id)
    const quote = (await quoteService.create(
      {
        status: 'draft', discountType: 'value', discountValue: 0, validUntil,
        items: [{ productId: null, code: 'QP-1', description: 'Item', quantity: 1, unit: 'UN', unitPrice: 100, notes: '' }],
      } as never,
      user.id
    )) as unknown as { id: string; publicToken: string | null }
    createdQuoteIds.push(quote.id)
    const sent = (await quoteService.changeStatus(quote.id, 'sent', user.id)) as unknown as { publicToken: string | null }
    return { user, quoteId: quote.id, token: sent.publicToken as string }
  }

  it('1. changeStatus para "sent" gera um publicToken', async () => {
    const { token } = await createSentQuote('public-token-gerado')
    expect(token).toBeTruthy()
    expect(token.length).toBeGreaterThan(20)
  })

  it('2. getByPublicToken devolve os dados do orçamento quando está "sent" e dentro da validade', async () => {
    const { token } = await createSentQuote('public-get-ok', '01/01/2099')
    const quote = await quoteService.getByPublicToken(token)
    expect(quote.status).toBe('sent')
    expect(quote.items).toHaveLength(1)
  })

  it('3. getByPublicToken rejeita token inexistente', async () => {
    await expect(quoteService.getByPublicToken('token-que-nao-existe')).rejects.toThrow(/inválido ou expirado/)
  })

  it('4. getByPublicToken rejeita quando a validade (validUntil) já passou', async () => {
    const { token } = await createSentQuote('public-get-expirado', '01/01/2020')
    await expect(quoteService.getByPublicToken(token)).rejects.toThrow(/inválido ou expirado/)
  })

  it('5. getByPublicToken rejeita quando o orçamento não está mais "sent" (ex.: já aprovado internamente)', async () => {
    const { user, quoteId, token } = await createSentQuote('public-get-ja-aprovado')
    await quoteService.changeStatus(quoteId, 'approved', user.id)
    await expect(quoteService.getByPublicToken(token)).rejects.toThrow(/inválido ou expirado/)
  })

  it('6. confirmByClient("approved") aprova direto (sem motor de alçada), registra clientRespondedAt e gera OP', async () => {
    const { quoteId, token } = await createSentQuote('public-confirm-aprova')
    const result = await quoteService.confirmByClient(token, 'approved')
    expect(result.status).toBe('approved')
    expect(result.generatedProductionOrders.length).toBe(0) // item sem productId — nenhuma OP gerada

    const updated = await db.quote.findUnique({ where: { id: quoteId } })
    expect(updated?.status).toBe('approved')
    expect(updated?.approvedBy).toBe('Cliente (link público)')
    expect(updated?.clientRespondedAt).not.toBeNull()
  })

  it('7. confirmByClient("rejected") recusa direto e registra clientRespondedAt, sem mexer em approvedBy', async () => {
    const { quoteId, token } = await createSentQuote('public-confirm-recusa')
    const result = await quoteService.confirmByClient(token, 'rejected')
    expect(result.status).toBe('rejected')

    const updated = await db.quote.findUnique({ where: { id: quoteId } })
    expect(updated?.status).toBe('rejected')
    expect(updated?.approvedBy).toBeNull()
    expect(updated?.clientRespondedAt).not.toBeNull()
  })

  it('8. depois de confirmado, o mesmo link não funciona mais (nem GET nem POST de novo)', async () => {
    const { token } = await createSentQuote('public-confirm-usado-uma-vez')
    await quoteService.confirmByClient(token, 'approved')

    await expect(quoteService.getByPublicToken(token)).rejects.toThrow(/inválido ou expirado/)
    await expect(quoteService.confirmByClient(token, 'approved')).rejects.toThrow(/inválido ou expirado/)
  })

  it('9. reenviar o orçamento (sent -> draft -> sent) gera um token novo; o token antigo para de funcionar', async () => {
    const { user, quoteId, token: firstToken } = await createSentQuote('public-token-regenerado')
    await quoteService.changeStatus(quoteId, 'draft', user.id)
    const resent = (await quoteService.changeStatus(quoteId, 'sent', user.id)) as unknown as { publicToken: string | null }

    expect(resent.publicToken).toBeTruthy()
    expect(resent.publicToken).not.toBe(firstToken)
    await expect(quoteService.getByPublicToken(firstToken)).rejects.toThrow(/inválido ou expirado/)
    const viaNewToken = await quoteService.getByPublicToken(resent.publicToken as string)
    expect(viaNewToken.status).toBe('sent')
  })
})
