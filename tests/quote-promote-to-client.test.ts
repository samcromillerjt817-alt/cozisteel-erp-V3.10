import { describe, it, expect, afterAll } from 'vitest'
import { db } from '@/lib/db'
import { quoteService } from '@/app/services/quote.service'
import { catalogRequestService } from '@/app/services/catalog-request.service'
import { createTestUser } from './helpers/fixtures'
import { NotFoundException, BadRequestException } from '@/app/exceptions'

/**
 * `quoteService.promoteToClient()` — cria (ou vincula, se já existir) um Cliente formal a partir dos
 * dados desnormalizados de um Orçamento sem cliente cadastrado. Cobre tanto o caso geral (qualquer
 * Orçamento sem cliente) quanto o caso do Catálogo Digital (ADR-026), onde o CatalogRequest vinculado
 * também precisa ficar apontando pro mesmo Cliente novo.
 */
describe('quoteService.promoteToClient — converter lead em Cliente', () => {
  const userIds: string[] = []
  const quoteIds: string[] = []
  const clientIds: string[] = []
  const catalogRequestIds: string[] = []
  const productIds: string[] = []
  let categoryId: string

  afterAll(async () => {
    await db.quote.deleteMany({ where: { id: { in: quoteIds } } })
    await db.catalogRequest.deleteMany({ where: { id: { in: catalogRequestIds } } })
    await db.client.deleteMany({ where: { id: { in: clientIds } } })
    await db.product.deleteMany({ where: { id: { in: productIds } } })
    if (categoryId) await db.category.delete({ where: { id: categoryId } }).catch(() => {})
    await db.user.deleteMany({ where: { id: { in: userIds } } })
    await db.user.deleteMany({ where: { username: 'catalogo-digital' } })
  })

  async function createDraftQuote(overrides: Record<string, unknown> = {}) {
    const user = await createTestUser(`promote-${Date.now()}-${Math.random()}`)
    userIds.push(user.id)
    const quote = await db.quote.create({
      data: { number: `PROM-${Date.now()}`, status: 'draft', date: '01/01/2026', userId: user.id, ...overrides },
    })
    quoteIds.push(quote.id)
    return { user, quote }
  }

  it('1. cria um Cliente novo quando não há CPF/CNPJ correspondente, e vincula clientId no Orçamento', async () => {
    const { user, quote } = await createDraftQuote({ clientName: 'Lead Novo Ltda', clientCnpj: '', clientEmail: 'lead-novo@example.com' })

    const result = await quoteService.promoteToClient(quote.id, user.id)
    expect(result.created).toBe(true)
    clientIds.push(result.clientId)

    const updated = await db.quote.findUnique({ where: { id: quote.id } })
    expect(updated?.clientId).toBe(result.clientId)

    const client = await db.client.findUnique({ where: { id: result.clientId } })
    expect(client?.corporateName).toBe('Lead Novo Ltda')
    expect(client?.email).toBe('lead-novo@example.com')
  })

  it('2. vincula a um Cliente já existente (por CNPJ), sem criar duplicata', async () => {
    const existing = await db.client.create({ data: { corporateName: 'Cliente Já Cadastrado', cpfCnpj: '22.333.444/0001-55' } })
    clientIds.push(existing.id)

    const { user, quote } = await createDraftQuote({ clientName: 'Nome Digitado Diferente', clientCnpj: '22.333.444/0001-55' })
    const result = await quoteService.promoteToClient(quote.id, user.id)

    expect(result.created).toBe(false)
    expect(result.clientId).toBe(existing.id)

    const totalWithThisCnpj = await db.client.count({ where: { cpfCnpj: '22.333.444/0001-55' } })
    expect(totalWithThisCnpj).toBe(1)
  })

  it('3. rejeita quando o orçamento já tem um cliente vinculado', async () => {
    const existing = await db.client.create({ data: { corporateName: 'Já Vinculado' } })
    clientIds.push(existing.id)
    const { quote } = await createDraftQuote({ clientName: 'Nome Qualquer', clientId: existing.id })

    await expect(quoteService.promoteToClient(quote.id, 'system-test')).rejects.toThrow(BadRequestException)
  })

  it('4. rejeita quando o orçamento não tem nenhum dado de cliente', async () => {
    const { quote } = await createDraftQuote({ clientName: '' })
    await expect(quoteService.promoteToClient(quote.id, 'system-test')).rejects.toThrow(BadRequestException)
  })

  it('5. lança NotFoundException para orçamento inexistente', async () => {
    await expect(quoteService.promoteToClient('id-inexistente', 'system-test')).rejects.toThrow(NotFoundException)
  })

  it('6. quando o Orçamento veio do Catálogo Digital, o CatalogRequest de origem também fica vinculado ao Cliente novo', async () => {
    const category = await db.category.create({ data: { name: `Cat Promote ${Date.now()}`, slug: `cat-promote-${Date.now()}` } })
    categoryId = category.id
    const product = await db.product.create({ data: { name: `Produto Promote ${Date.now()}`, showInCatalog: true, active: true, categoryId } })
    productIds.push(product.id)

    const submission = await catalogRequestService.submit({
      idempotencyKey: crypto.randomUUID(),
      clientName: 'Lead do Catálogo',
      clientCpfCnpj: '',
      clientContact: '',
      clientEmail: 'lead-catalogo@example.com',
      clientPhone: '',
      clientCity: 'Curitiba',
      clientState: 'PR',
      clientCompany: '',
      generalNotes: '',
      items: [{ productId: product.id, quantity: 1, material: '', finish: '', voltage: '', operationSide: '', accessories: '', modifications: '', notes: '' }],
    })

    const catalogRequest = await db.catalogRequest.findUnique({ where: { protocol: submission.protocol } })
    catalogRequestIds.push(catalogRequest!.id)
    quoteIds.push(catalogRequest!.quoteId!)

    const actingUser = await createTestUser(`promote-acting-${Date.now()}`)
    userIds.push(actingUser.id)
    const result = await quoteService.promoteToClient(catalogRequest!.quoteId!, actingUser.id)
    clientIds.push(result.clientId)

    const updatedCatalogRequest = await db.catalogRequest.findUnique({ where: { id: catalogRequest!.id } })
    expect(updatedCatalogRequest?.clientId).toBe(result.clientId)

    const client = await db.client.findUnique({ where: { id: result.clientId } })
    expect(client?.city).toBe('Curitiba')
    expect(client?.state).toBe('PR')
  })
})
