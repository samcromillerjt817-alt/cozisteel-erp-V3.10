import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { db } from '@/lib/db'
import { catalogRequestService } from '@/app/services/catalog-request.service'
import { quoteService } from '@/app/services/quote.service'
import { createTestUser } from './helpers/fixtures'
import { BadRequestException } from '@/app/exceptions'

/**
 * ADR-026, Fase 3 — submissão do Catálogo Digital Público. Cobre a criação automática de
 * CatalogRequest + Orçamento, dedupe de cliente (sem revelar match/no-match ao público — aqui
 * testamos o efeito interno, não a resposta pública), idempotência, e o mapeamento correto de
 * personalização por item mesmo com o mesmo produto repetido no carrinho.
 */
describe('Catálogo Digital Público — submissão (ADR-026, Fase 3)', () => {
  const productIds: string[] = []
  const catalogRequestIds: string[] = []
  const quoteIds: string[] = []
  const clientIds: string[] = []
  const extraUserIds: string[] = []
  let categoryId: string
  let visibleProductId: string
  let hiddenProductId: string
  let configuredProductId: string

  beforeAll(async () => {
    const category = await db.category.create({ data: { name: `Cat Submissão ${Date.now()}`, slug: `cat-submissao-${Date.now()}` } })
    categoryId = category.id

    const visible = await db.product.create({
      data: { name: `Produto Submissão ${Date.now()}`, showInCatalog: true, active: true, categoryId, unit: 'UN', width: 100, height: 50, length: 30, internalCode: 'PS-1' },
    })
    visibleProductId = visible.id
    const hidden = await db.product.create({ data: { name: `Produto Oculto ${Date.now()}`, showInCatalog: false, active: true, categoryId } })
    hiddenProductId = hidden.id

    // Produto com personalização por campo (ADR-026, achado do usuário: sem isso o cliente podia
    // pedir qualquer largura/material) — width bloqueado (usa sempre o padrão do produto) e
    // material em modo seleção (só aceita as opções cadastradas).
    const configured = await db.product.create({
      data: {
        name: `Produto Config Personalização ${Date.now()}`,
        showInCatalog: true,
        active: true,
        categoryId,
        unit: 'UN',
        width: 100,
        height: 50,
        length: 30,
        internalCode: 'PS-2',
        catalogCustomizationConfig: {
          width: { mode: 'bloqueado', options: [] },
          material: { mode: 'selecao', options: ['Inox 304', 'Inox 316'] },
        },
      },
    })
    configuredProductId = configured.id
    productIds.push(visibleProductId, hiddenProductId, configuredProductId)
  })

  afterAll(async () => {
    await db.quote.deleteMany({ where: { id: { in: quoteIds } } })
    await db.catalogRequest.deleteMany({ where: { id: { in: catalogRequestIds } } })
    await db.product.deleteMany({ where: { id: { in: productIds } } })
    await db.category.delete({ where: { id: categoryId } })
    await db.client.deleteMany({ where: { id: { in: clientIds } } })
    await db.user.deleteMany({ where: { username: 'catalogo-digital' } })
    await db.user.deleteMany({ where: { id: { in: extraUserIds } } })
  })

  function baseInput(overrides: Partial<Parameters<typeof catalogRequestService.submit>[0]> = {}) {
    return {
      idempotencyKey: crypto.randomUUID(),
      clientName: 'Cliente Teste Catálogo',
      clientCpfCnpj: '',
      clientContact: '',
      clientEmail: '',
      clientPhone: '',
      clientCity: '',
      clientState: '',
      clientCompany: '',
      generalNotes: 'Entrega em até 30 dias',
      items: [{ productId: visibleProductId, quantity: 2, material: '', finish: '', voltage: '', operationSide: '', accessories: '', modifications: '', notes: '' }],
      ...overrides,
    }
  }

  it('1. cria CatalogRequest + Orçamento vinculados, com origin/internalStage corretos', async () => {
    const result = await catalogRequestService.submit(baseInput())
    expect(result.protocol).toBeTruthy()

    const catalogRequest = await db.catalogRequest.findUnique({ where: { protocol: result.protocol } })
    expect(catalogRequest).not.toBeNull()
    expect(catalogRequest?.status).toBe('convertida')
    expect(catalogRequest?.quoteId).toBeTruthy()
    catalogRequestIds.push(catalogRequest!.id)

    const quote = await db.quote.findUnique({ where: { id: catalogRequest!.quoteId! } })
    expect(quote?.origin).toBe('catalogo_digital')
    expect(quote?.internalStage).toBe('aguardando_triagem')
    expect(quote?.status).toBe('draft')
    quoteIds.push(quote!.id)
  })

  it('2. rejeita produto oculto/inexistente com BadRequestException, sem criar nada', async () => {
    await expect(
      catalogRequestService.submit(baseInput({ items: [{ productId: hiddenProductId, quantity: 1, material: '', finish: '', voltage: '', operationSide: '', accessories: '', modifications: '', notes: '' }] }))
    ).rejects.toThrow(BadRequestException)

    await expect(
      catalogRequestService.submit(baseInput({ items: [{ productId: 'id-inexistente', quantity: 1, material: '', finish: '', voltage: '', operationSide: '', accessories: '', modifications: '', notes: '' }] }))
    ).rejects.toThrow(BadRequestException)
  })

  it('3. vincula clientId quando CPF/CNPJ bate com Cliente existente', async () => {
    const client = await db.client.create({ data: { corporateName: 'Cliente Existente CNPJ', cpfCnpj: '11.222.333/0001-44' } })
    clientIds.push(client.id)

    const result = await catalogRequestService.submit(baseInput({ clientCpfCnpj: '11.222.333/0001-44' }))
    const catalogRequest = await db.catalogRequest.findUnique({ where: { protocol: result.protocol } })
    catalogRequestIds.push(catalogRequest!.id)
    quoteIds.push(catalogRequest!.quoteId!)

    expect(catalogRequest?.clientId).toBe(client.id)
    const quote = await db.quote.findUnique({ where: { id: catalogRequest!.quoteId! } })
    expect(quote?.clientId).toBe(client.id)
  })

  it('4. vincula clientId quando e-mail bate com Cliente existente (sem CPF/CNPJ)', async () => {
    const client = await db.client.create({ data: { corporateName: 'Cliente Existente Email', email: 'cliente-catalogo-teste@example.com' } })
    clientIds.push(client.id)

    const result = await catalogRequestService.submit(baseInput({ clientEmail: 'cliente-catalogo-teste@example.com' }))
    const catalogRequest = await db.catalogRequest.findUnique({ where: { protocol: result.protocol } })
    catalogRequestIds.push(catalogRequest!.id)
    quoteIds.push(catalogRequest!.quoteId!)

    expect(catalogRequest?.clientId).toBe(client.id)
  })

  it('5. sem match nenhum, clientId fica null mas os dados desnormalizados ficam gravados', async () => {
    const result = await catalogRequestService.submit(baseInput({ clientName: 'Lead Sem Cadastro', clientEmail: 'lead-sem-match@example.com' }))
    const catalogRequest = await db.catalogRequest.findUnique({ where: { protocol: result.protocol } })
    catalogRequestIds.push(catalogRequest!.id)
    quoteIds.push(catalogRequest!.quoteId!)

    expect(catalogRequest?.clientId).toBeNull()
    expect(catalogRequest?.clientName).toBe('Lead Sem Cadastro')
    const quote = await db.quote.findUnique({ where: { id: catalogRequest!.quoteId! } })
    expect(quote?.clientId).toBeNull()
    expect(quote?.clientName).toBe('Lead Sem Cadastro')
  })

  it('6. idempotência — reenvio da mesma chave devolve o mesmo protocolo, sem duplicar', async () => {
    const key = crypto.randomUUID()
    const first = await catalogRequestService.submit(baseInput({ idempotencyKey: key }))
    const second = await catalogRequestService.submit(baseInput({ idempotencyKey: key }))
    expect(second.protocol).toBe(first.protocol)

    const catalogRequest = await db.catalogRequest.findUnique({ where: { protocol: first.protocol } })
    catalogRequestIds.push(catalogRequest!.id)
    quoteIds.push(catalogRequest!.quoteId!)

    const count = await db.catalogRequest.count({ where: { idempotencyKey: key } })
    expect(count).toBe(1)
  })

  it('7. mesmo produto 2x no carrinho com personalizações diferentes gera 2 QuoteItems com notes distintas', async () => {
    const result = await catalogRequestService.submit(
      baseInput({
        items: [
          { productId: visibleProductId, quantity: 1, material: 'Inox 304', finish: '', voltage: '', operationSide: '', accessories: '', modifications: '', notes: '' },
          { productId: visibleProductId, quantity: 1, material: 'Inox 430', finish: '', voltage: '', operationSide: '', accessories: '', modifications: '', notes: '' },
        ],
      })
    )
    const catalogRequest = await db.catalogRequest.findUnique({ where: { protocol: result.protocol } })
    catalogRequestIds.push(catalogRequest!.id)
    quoteIds.push(catalogRequest!.quoteId!)

    const items = await db.quoteItem.findMany({ where: { quoteId: catalogRequest!.quoteId! }, orderBy: { order: 'asc' } })
    expect(items).toHaveLength(2)
    expect(items[0].notes).toContain('Inox 304')
    expect(items[1].notes).toContain('Inox 430')
  })

  it('8. Quote.userId aponta pro usuário de sistema "catalogo-digital", com active:false', async () => {
    const result = await catalogRequestService.submit(baseInput())
    const catalogRequest = await db.catalogRequest.findUnique({ where: { protocol: result.protocol } })
    catalogRequestIds.push(catalogRequest!.id)
    quoteIds.push(catalogRequest!.quoteId!)

    const quote = await db.quote.findUnique({ where: { id: catalogRequest!.quoteId! } })
    const systemUser = await db.user.findUnique({ where: { id: quote!.userId } })
    expect(systemUser?.username).toBe('catalogo-digital')
    expect(systemUser?.active).toBe(false)
  })

  it('9. list() filtra por status e devolve o Orçamento vinculado (fila de triagem, ADR-026 Fase 4)', async () => {
    const result = await catalogRequestService.submit(baseInput())
    const catalogRequest = await db.catalogRequest.findUnique({ where: { protocol: result.protocol } })
    catalogRequestIds.push(catalogRequest!.id)
    quoteIds.push(catalogRequest!.quoteId!)

    const convertidas = await catalogRequestService.list({ status: 'convertida', page: 1, limit: 50 })
    const found = convertidas.data.find((r) => r.id === catalogRequest!.id) as unknown as { quote: { id: string } | null }
    expect(found).toBeTruthy()
    expect(found.quote?.id).toBe(catalogRequest!.quoteId)

    const arquivadas = await catalogRequestService.list({ status: 'arquivada', page: 1, limit: 50 })
    expect(arquivadas.data.find((r) => r.id === catalogRequest!.id)).toBeUndefined()
  })

  it('10. getById devolve os itens completos; lança NotFoundException pra id inexistente', async () => {
    const result = await catalogRequestService.submit(baseInput())
    const catalogRequest = await db.catalogRequest.findUnique({ where: { protocol: result.protocol } })
    catalogRequestIds.push(catalogRequest!.id)
    quoteIds.push(catalogRequest!.quoteId!)

    const detail = await catalogRequestService.getById(catalogRequest!.id)
    expect(detail.items).toHaveLength(1)

    await expect(catalogRequestService.getById('id-inexistente')).rejects.toThrow(/não encontrada/)
  })

  it('11. archive() marca a solicitação como arquivada com o motivo, sem alterar o Orçamento vinculado', async () => {
    const result = await catalogRequestService.submit(baseInput())
    const catalogRequest = await db.catalogRequest.findUnique({ where: { protocol: result.protocol } })
    catalogRequestIds.push(catalogRequest!.id)
    quoteIds.push(catalogRequest!.quoteId!)
    const quoteBefore = await db.quote.findUnique({ where: { id: catalogRequest!.quoteId! } })

    await catalogRequestService.archive(catalogRequest!.id, 'Cliente desistiu')

    const updated = await db.catalogRequest.findUnique({ where: { id: catalogRequest!.id } })
    expect(updated?.status).toBe('arquivada')
    expect(updated?.archivedReason).toBe('Cliente desistiu')

    const quoteAfter = await db.quote.findUnique({ where: { id: catalogRequest!.quoteId! } })
    expect(quoteAfter?.status).toBe(quoteBefore?.status)
    expect(quoteAfter?.internalStage).toBe(quoteBefore?.internalStage)
  })

  it('12. reassignAndStage() reatribui responsável e sub-status de triagem, sem apagar os itens do Orçamento', async () => {
    const result = await catalogRequestService.submit(baseInput())
    const catalogRequest = await db.catalogRequest.findUnique({ where: { protocol: result.protocol } })
    catalogRequestIds.push(catalogRequest!.id)
    quoteIds.push(catalogRequest!.quoteId!)

    const vendedor = await createTestUser(`triagem-${Date.now()}`)
    extraUserIds.push(vendedor.id)
    const itemsBefore = await db.quoteItem.count({ where: { quoteId: catalogRequest!.quoteId! } })

    await quoteService.reassignAndStage(catalogRequest!.quoteId!, { userId: vendedor.id, internalStage: 'analise_tecnica' }, vendedor.id)

    const updated = await db.quote.findUnique({ where: { id: catalogRequest!.quoteId! } })
    expect(updated?.userId).toBe(vendedor.id)
    expect(updated?.internalStage).toBe('analise_tecnica')

    const itemsAfter = await db.quoteItem.count({ where: { quoteId: catalogRequest!.quoteId! } })
    expect(itemsAfter).toBe(itemsBefore) // reassignAndStage NUNCA deve tocar em itens
  })

  it('13. campo "bloqueado" ignora o valor enviado pelo cliente e usa o padrão do produto', async () => {
    const result = await catalogRequestService.submit(
      baseInput({
        items: [{ productId: configuredProductId, quantity: 1, width: 999, material: 'Inox 304', finish: '', voltage: '', operationSide: '', accessories: '', modifications: '', notes: '' }],
      })
    )
    const catalogRequest = await db.catalogRequest.findUnique({ where: { protocol: result.protocol } })
    catalogRequestIds.push(catalogRequest!.id)
    quoteIds.push(catalogRequest!.quoteId!)

    const item = await db.catalogRequestItem.findFirst({ where: { catalogRequestId: catalogRequest!.id } })
    expect(item?.width).toBeNull() // bloqueado -> nunca grava o valor enviado (999), fica null (usa o padrão a jusante)

    const quoteItem = await db.quoteItem.findFirst({ where: { quoteId: catalogRequest!.quoteId! } })
    expect(quoteItem?.width).toBe(100) // padrão do produto, nunca os 999 enviados
  })

  it('14. campo "selecao" aceita valor dentro da lista cadastrada', async () => {
    const result = await catalogRequestService.submit(
      baseInput({
        items: [{ productId: configuredProductId, quantity: 1, material: 'Inox 316', finish: '', voltage: '', operationSide: '', accessories: '', modifications: '', notes: '' }],
      })
    )
    const catalogRequest = await db.catalogRequest.findUnique({ where: { protocol: result.protocol } })
    catalogRequestIds.push(catalogRequest!.id)
    quoteIds.push(catalogRequest!.quoteId!)

    const item = await db.catalogRequestItem.findFirst({ where: { catalogRequestId: catalogRequest!.id } })
    expect(item?.material).toBe('Inox 316')
  })

  it('15. campo "selecao" rejeita valor fora da lista cadastrada, sem criar nada', async () => {
    const before = await db.catalogRequest.count()
    await expect(
      catalogRequestService.submit(
        baseInput({
          items: [{ productId: configuredProductId, quantity: 1, material: 'Alumínio Anodizado', finish: '', voltage: '', operationSide: '', accessories: '', modifications: '', notes: '' }],
        })
      )
    ).rejects.toThrow(BadRequestException)
    const after = await db.catalogRequest.count()
    expect(after).toBe(before) // rejeição acontece antes da transação — nada é criado
  })
})
