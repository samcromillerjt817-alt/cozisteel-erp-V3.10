import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { db } from '@/lib/db'
import { registerDomainEventHandlers } from '@/lib/register-domain-event-handlers'
import { quoteService } from '@/app/services/quote.service'
import { createTestUser, createTestProduct } from './helpers/fixtures'

/**
 * Auditoria de segurança (2ª rodada) — reprodução isolada, contra o banco de teste (nunca
 * produção), da condição de corrida encontrada em `confirmByClient`: 2+ requisições concorrentes
 * no mesmo token de orçamento podiam ler "sent" antes de qualquer uma escrever, gerando Ordem de
 * Produção duplicada. A correção (transação real + `updateMany` condicional em
 * `src/app/services/quote.service.ts`) precisa segurar sob concorrência de verdade, não só "não
 * reproduzi num teste manual" — por isso 20 chamadas via `Promise.all`, não sequenciais.
 */
describe('confirmByClient — corrida de confirmação simultânea (auditoria de segurança, 2ª rodada)', () => {
  const createdUserIds: string[] = []
  const createdQuoteIds: string[] = []
  const createdProductIds: string[] = []
  const createdQuoteNumbers: string[] = []

  beforeAll(() => {
    registerDomainEventHandlers()
  })

  afterAll(async () => {
    for (const number of createdQuoteNumbers) {
      await db.productionOrder.deleteMany({ where: { description: { contains: number } } })
    }
    await db.quote.deleteMany({ where: { id: { in: createdQuoteIds } } })
    await db.statusHistory.deleteMany({ where: { userId: { in: createdUserIds } } })
    await db.product.deleteMany({ where: { id: { in: createdProductIds } } })
    await db.user.deleteMany({ where: { id: { in: createdUserIds } } })
  })

  it('20 confirmações simultâneas no mesmo token: só 1 transição efetiva, só 1 Ordem de Produção, nenhuma gravação parcial', async () => {
    const user = await createTestUser('race-confirm')
    createdUserIds.push(user.id)
    const product = await createTestProduct('race-confirm')
    createdProductIds.push(product.id)

    const quote = (await quoteService.create(
      {
        status: 'draft',
        discountType: 'value',
        discountValue: 0,
        validUntil: '',
        items: [
          {
            productId: product.id,
            code: 'RACE-1',
            description: 'RACE-TEST item',
            quantity: 2,
            unit: 'UN',
            unitPrice: 100,
            notes: '',
          },
        ],
      } as never,
      user.id
    )) as unknown as { id: string; number: string }
    createdQuoteIds.push(quote.id)
    createdQuoteNumbers.push(quote.number)

    const sent = (await quoteService.changeStatus(quote.id, 'sent', user.id)) as unknown as { publicToken: string | null }
    const token = sent.publicToken as string
    expect(token).toBeTruthy()

    const CONCURRENCY = 20
    const results = await Promise.allSettled(
      Array.from({ length: CONCURRENCY }, () => quoteService.confirmByClient(token, 'approved'))
    )

    // Contrato: nenhuma resposta pode ser um erro de LÓGICA inesperado — só sucesso (fresco ou
    // idempotente), um `ConflictException` controlado, ou (limitação de PLATAFORMA confirmada
    // nesta auditoria, não deste código) um "Socket timeout" do próprio motor Prisma (Node-API,
    // v6.19.3) sob 20 requisições genuinamente simultâneas tocando o mesmo banco SQLite. Reproduzi
    // isso isoladamente com uma transação TRIVIAL (`tx.user.count()`, zero lógica de negócio) e o
    // mesmo teto apareceu — não é este `confirmByClient`, é um limite do motor nesta versão/
    // ambiente que não é configurável via `$transaction({maxWait, timeout})` (documentado no
    // relatório da auditoria). A garantia real de atomicidade não é "toda resposta é rápida sob
    // carga sintética extrema" — é "nenhuma resposta, mesmo as que falham, reflete estado
    // corrompido", verificado abaixo contra o estado final do banco.
    const rejected = results.filter((r) => r.status === 'rejected')
    for (const r of rejected) {
      if (r.status === 'rejected') {
        expect(String(r.reason)).toMatch(/decisão diferente|Link inválido|Socket timeout/i)
      }
    }
    // Sob esse teto de plataforma, é a MINORIA que deveria ter sucesso limpo — mas pelo menos 1
    // (a vencedora real da corrida) precisa sempre se completar; se NENHUMA completar, isso já
    // seria uma falha de disponibilidade grave demais pra esse teste ignorar.
    expect(rejected.length).toBeLessThan(CONCURRENCY)

    const fulfilled = results.filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof quoteService.confirmByClient>>> => r.status === 'fulfilled')

    // Exatamente 1 transição "fresca" (a vencedora da corrida) — todas as outras respostas de
    // sucesso são idempotentes (mesma decisão, sem recriar nada).
    const freshTransitions = fulfilled.filter((r) => r.value.alreadyProcessed === false)
    const idempotentResponses = fulfilled.filter((r) => r.value.alreadyProcessed === true)
    expect(freshTransitions.length).toBe(1)
    expect(idempotentResponses.length).toBe(fulfilled.length - 1)

    // A vencedora gerou exatamente 1 Ordem de Produção (1 item no orçamento); nenhuma resposta
    // idempotente recriou nada.
    expect(freshTransitions[0].value.generatedProductionOrders.length).toBe(1)
    for (const r of idempotentResponses) {
      expect(r.value.generatedProductionOrders.length).toBe(0)
    }

    // Estado final do banco — a prova real de que não houve gravação parcial nem duplicidade.
    const finalQuote = await db.quote.findUnique({ where: { id: quote.id } })
    expect(finalQuote?.status).toBe('approved')

    const productionOrders = await db.productionOrder.findMany({ where: { description: { contains: quote.number } } })
    expect(productionOrders.length).toBe(1)

    const history = await db.statusHistory.findMany({ where: { entityType: 'quote', entityId: quote.id, toStatus: 'approved' } })
    expect(history.length).toBe(1)
  }, 30000)
})
