import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { db } from '@/lib/db'
import { createTestUser } from './helpers/fixtures'
import { searchService } from '@/app/services/search.service'
import type { SessionUser } from '@/lib/api-utils'

/**
 * Fase 11.5 (Plataforma Frontend), Subetapa 11.5.5 — busca global. `checkPermission` só precisa de
 * `user.role`, então os "usuários" de teste de RBAC são objetos simples, sem gravar no banco — só o
 * usuário dono dos registros de negócio (Quote/ProductionOrder exigem `userId` real) vem de
 * `createTestUser`.
 */
describe('Busca global (search.service) — Subetapa 11.5.5', () => {
  const suffix = `search-${Date.now()}`
  let userId: string
  const clientIds: string[] = []
  const productIds: string[] = []
  const materialIds: string[] = []
  const supplierIds: string[] = []
  const quoteIds: string[] = []
  const salesOrderIds: string[] = []
  const productionOrderIds: string[] = []

  const admin: SessionUser = { id: 'admin-test', name: 'Admin Teste', role: 'admin' }
  // `estoque` não tem permissão de leitura em `orcamentos` (rbac.ts) — usado para confirmar que a
  // busca nunca vaza um tipo de entidade que o perfil não enxergaria navegando pelo menu.
  const estoqueUser: SessionUser = { id: 'estoque-test', name: 'Estoque Teste', role: 'estoque' }

  beforeAll(async () => {
    const user = await createTestUser(suffix)
    userId = user.id

    const client = await db.client.create({ data: { corporateName: `Cliente Busca ${suffix}`, tradeName: `Busca ${suffix}`, city: 'Curitiba' } })
    clientIds.push(client.id)

    const product = await db.product.create({ data: { name: `Produto Busca ${suffix}`, unit: 'UN' } })
    productIds.push(product.id)

    const material = await db.material.create({ data: { name: `Material Busca ${suffix}`, unit: 'KG' } })
    materialIds.push(material.id)

    const supplier = await db.supplier.create({ data: { corporateName: `Fornecedor Busca ${suffix}`, city: 'Joinville' } })
    supplierIds.push(supplier.id)

    const quote = await db.quote.create({ data: { number: `BUSCA-${suffix}`, status: 'draft', date: '01/01/2026', userId, clientName: 'Cliente Orçamento X' } })
    quoteIds.push(quote.id)

    const salesOrder = await db.salesOrder.create({ data: { number: `BUSCA-PV-${suffix}`, status: 'open', date: '01/01/2026', quoteId: quote.id, userId, clientName: 'Cliente Pedido X' } })
    salesOrderIds.push(salesOrder.id)

    const productionOrder = await db.productionOrder.create({ data: { number: `BUSCA-OP-${suffix}`, date: '01/01/2026', userId, productName: `Produto Produzido ${suffix}` } })
    productionOrderIds.push(productionOrder.id)
  })

  afterAll(async () => {
    await db.productionOrder.deleteMany({ where: { id: { in: productionOrderIds } } })
    await db.salesOrder.deleteMany({ where: { id: { in: salesOrderIds } } })
    await db.quote.deleteMany({ where: { id: { in: quoteIds } } })
    await db.supplier.deleteMany({ where: { id: { in: supplierIds } } })
    await db.material.deleteMany({ where: { id: { in: materialIds } } })
    await db.product.deleteMany({ where: { id: { in: productIds } } })
    await db.client.deleteMany({ where: { id: { in: clientIds } } })
    await db.user.delete({ where: { id: userId } })
  })

  it('devolve vazio para consulta com menos de 2 caracteres', async () => {
    expect(await searchService.search(admin, 'a')).toEqual([])
    expect(await searchService.search(admin, '')).toEqual([])
  })

  it('admin encontra as 7 entidades pelo termo distintivo comum (suffix)', async () => {
    const results = await searchService.search(admin, suffix)
    const types = new Set(results.map((r) => r.type))
    expect(types).toEqual(new Set(['client', 'product', 'material', 'supplier', 'quote', 'salesOrder', 'productionOrder']))
  })

  it('Cliente usa tradeName como label quando preenchido, city como sublabel', async () => {
    const results = await searchService.search(admin, suffix)
    const clientResult = results.find((r) => r.type === 'client')!
    expect(clientResult.label).toBe(`Busca ${suffix}`)
    expect(clientResult.sublabel).toBe('Curitiba')
    expect(clientResult.moduleKey).toBe('clientes')
  })

  it('Orçamento e Pedido de Venda usam number como label, moduleKey correto (pedidos != orcamentos)', async () => {
    const results = await searchService.search(admin, suffix)
    const quoteResult = results.find((r) => r.type === 'quote')!
    const salesOrderResult = results.find((r) => r.type === 'salesOrder')!
    expect(quoteResult.label).toBe(`BUSCA-${suffix}`)
    expect(quoteResult.moduleKey).toBe('orcamentos')
    expect(salesOrderResult.label).toBe(`BUSCA-PV-${suffix}`)
    expect(salesOrderResult.moduleKey).toBe('pedidos')
  })

  it('RBAC: perfil Estoque nunca recebe resultados de Orçamento/Pedido de Venda (sem permissão de leitura em orcamentos)', async () => {
    const results = await searchService.search(estoqueUser, suffix)
    const types = new Set(results.map((r) => r.type))
    expect(types.has('quote')).toBe(false)
    expect(types.has('salesOrder')).toBe(false)
    // Estoque tem permissão de leitura em materiais/produtos — esses continuam aparecendo.
    expect(types.has('material')).toBe(true)
  })
})
