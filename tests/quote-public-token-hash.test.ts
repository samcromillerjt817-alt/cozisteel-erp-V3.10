import crypto from 'crypto'
import { describe, it, expect, afterAll } from 'vitest'
import { db } from '@/lib/db'
import { quoteService } from '@/app/services/quote.service'
import { createTestUser } from './helpers/fixtures'

/**
 * Migração de token pra hash (auditoria de segurança, 2ª rodada, plano aprovado pelo usuário
 * depois da consulta ao /codex) — `Quote.publicToken` nunca mais guarda o token bruto; só o hash
 * SHA-256 (`publicTokenHash`). O valor bruto só existe na resposta do envio, uma única vez. Links
 * já enviados antes da migração (texto puro em `publicToken`) continuam funcionando via fallback —
 * nenhum token ativo é invalidado.
 */
describe('Migração de publicToken para hash (auditoria de segurança, 2ª rodada)', () => {
  const createdUserIds: string[] = []
  const createdQuoteIds: string[] = []

  afterAll(async () => {
    await db.quote.deleteMany({ where: { id: { in: createdQuoteIds } } })
    await db.statusHistory.deleteMany({ where: { userId: { in: createdUserIds } } })
    await db.user.deleteMany({ where: { id: { in: createdUserIds } } })
  })

  async function createSentQuote(suffix: string) {
    const user = await createTestUser(suffix)
    createdUserIds.push(user.id)
    const quote = (await quoteService.create(
      { status: 'draft', discountType: 'value', discountValue: 0, validUntil: '', items: [{ productId: null, code: 'TH-1', description: 'Item', quantity: 1, unit: 'UN', unitPrice: 100, notes: '' }] } as never,
      user.id
    )) as unknown as { id: string }
    createdQuoteIds.push(quote.id)
    return { user, quoteId: quote.id }
  }

  it('1. changeStatus("sent") nunca grava o token bruto em publicToken — só o hash em publicTokenHash', async () => {
    const { user, quoteId } = await createSentQuote('hash-nunca-texto-puro')
    const sent = (await quoteService.changeStatus(quoteId, 'sent', user.id)) as unknown as { publicToken: string }
    expect(sent.publicToken).toBeTruthy()
    expect(sent.publicToken.length).toBeGreaterThan(20)

    const row = await db.quote.findUnique({ where: { id: quoteId } })
    expect(row?.publicToken).toBeNull() // nunca escreve texto puro
    expect(row?.publicTokenHash).toBe(crypto.createHash('sha256').update(sent.publicToken).digest('hex'))
  })

  it('2. getByPublicToken e confirmByClient encontram o orçamento pelo token bruto (via lookup por hash)', async () => {
    const { user, quoteId } = await createSentQuote('hash-lookup-funciona')
    const sent = (await quoteService.changeStatus(quoteId, 'sent', user.id)) as unknown as { publicToken: string }

    const viaGet = await quoteService.getByPublicToken(sent.publicToken)
    expect(viaGet.status).toBe('sent')

    const confirmed = await quoteService.confirmByClient(sent.publicToken, 'approved')
    expect(confirmed.status).toBe('approved')
  })

  it('3. token errado (mesmo formato, hash diferente) nunca encontra o orçamento', async () => {
    const { user, quoteId } = await createSentQuote('hash-token-errado')
    await quoteService.changeStatus(quoteId, 'sent', user.id)

    const fakeToken = crypto.randomBytes(32).toString('hex')
    await expect(quoteService.getByPublicToken(fakeToken)).rejects.toThrow(/inválido ou expirado/)
  })

  it('4. link legado (publicToken em texto puro, de antes da migração) continua funcionando via fallback', async () => {
    const { quoteId } = await createSentQuote('hash-fallback-legado')
    // Simula um registro migrado de antes da mudança: só publicToken em texto puro, sem hash —
    // exatamente o estado em que uma linha real e já enviada ficaria depois do `prisma db push`
    // (coluna nova sempre null pra linhas existentes).
    const legacyToken = crypto.randomBytes(32).toString('hex')
    await db.quote.update({ where: { id: quoteId }, data: { status: 'sent', publicToken: legacyToken, publicTokenHash: null } })

    const viaGet = await quoteService.getByPublicToken(legacyToken)
    expect(viaGet.status).toBe('sent')

    const confirmed = await quoteService.confirmByClient(legacyToken, 'approved')
    expect(confirmed.status).toBe('approved')
  })
})
