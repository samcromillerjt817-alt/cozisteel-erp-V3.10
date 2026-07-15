import { describe, it, expect, afterAll } from 'vitest'
import { db } from '@/lib/db'
import { createTestUser, createTestProduct, createTestMaterial, createTestSupplier } from './helpers/fixtures'

/**
 * Fase 6, Subetapa 1 (ADR-007): MrpRun/MrpSuggestion/MrpSuggestionSource — puramente estrutural,
 * sem nenhum motor de cálculo ainda (isso é a Subetapa 2). Confirma só que o schema aceita os dados
 * que o motor vai precisar gravar: resumo denormalizado da execução, quantidades needed/available/
 * reserved/shortfall, snapshot histórico e rastreabilidade até as OPs de origem.
 */
describe('MRP — Schema (Subetapa 1)', () => {
  const createdUserIds: string[] = []
  const createdProductIds: string[] = []
  const createdMaterialIds: string[] = []
  const createdSupplierIds: string[] = []
  const createdOrderIds: string[] = []
  const createdRunIds: string[] = []

  afterAll(async () => {
    await db.mrpRun.deleteMany({ where: { id: { in: createdRunIds } } })
    await db.productionOrder.deleteMany({ where: { id: { in: createdOrderIds } } })
    await db.supplier.deleteMany({ where: { id: { in: createdSupplierIds } } })
    await db.material.deleteMany({ where: { id: { in: createdMaterialIds } } })
    await db.product.deleteMany({ where: { id: { in: createdProductIds } } })
    await db.statusHistory.deleteMany({ where: { userId: { in: createdUserIds } } })
    await db.user.deleteMany({ where: { id: { in: createdUserIds } } })
  })

  it('MrpRun grava resumo denormalizado da execução', async () => {
    const user = await createTestUser('mrp-run')
    createdUserIds.push(user.id)

    const run = await db.mrpRun.create({
      data: {
        number: 'MRP-TESTE-1',
        userId: user.id,
        openOrdersConsidered: 3,
        totalSuggestions: 2,
        totalPurchaseSuggestions: 1,
        totalProductionSuggestions: 1,
      },
    })
    createdRunIds.push(run.id)

    expect(run.openOrdersConsidered).toBe(3)
    expect(run.totalSuggestions).toBe(2)
    expect(run.totalPurchaseSuggestions).toBe(1)
    expect(run.totalProductionSuggestions).toBe(1)
    expect(run.horizonDate).toBeNull()
  })

  it('MrpSuggestion tipo compra grava needed/available/reserved/shortfall e fornecedor sugerido', async () => {
    const user = await createTestUser('mrp-suggestion-purchase')
    createdUserIds.push(user.id)
    const material = await createTestMaterial('mrp-suggestion-purchase')
    createdMaterialIds.push(material.id)
    const supplier = await createTestSupplier('mrp-suggestion-purchase')
    createdSupplierIds.push(supplier.id)

    const run = await db.mrpRun.create({ data: { number: 'MRP-TESTE-2', userId: user.id } })
    createdRunIds.push(run.id)

    const suggestion = await db.mrpSuggestion.create({
      data: {
        mrpRunId: run.id,
        suggestionType: 'purchase',
        itemType: 'material',
        materialId: material.id,
        quantityNeeded: 100,
        quantityAvailable: 30,
        quantityReserved: 20,
        quantityShortfall: 70,
        supplierId: supplier.id,
        supplierNameSnapshot: supplier.corporateName,
      },
    })

    expect(suggestion.suggestionType).toBe('purchase')
    expect(suggestion.quantityShortfall).toBe(70)
    expect(suggestion.supplierId).toBe(supplier.id)
    expect(suggestion.supplierNameSnapshot).toBe(supplier.corporateName)
    expect(suggestion.productTypeSnapshot).toBeNull()
    expect(suggestion.status).toBe('pending')
  })

  it('MrpSuggestion tipo produção grava productTypeSnapshot e permite fornecedor nulo (sem sinalizar erro)', async () => {
    const user = await createTestUser('mrp-suggestion-production')
    createdUserIds.push(user.id)
    const product = await createTestProduct('mrp-suggestion-production')
    createdProductIds.push(product.id)

    const run = await db.mrpRun.create({ data: { number: 'MRP-TESTE-3', userId: user.id } })
    createdRunIds.push(run.id)

    const suggestion = await db.mrpSuggestion.create({
      data: {
        mrpRunId: run.id,
        suggestionType: 'production',
        itemType: 'product',
        productId: product.id,
        quantityNeeded: 50,
        quantityAvailable: 10,
        quantityReserved: 0,
        quantityShortfall: 40,
        productTypeSnapshot: 'subassembly',
      },
    })

    expect(suggestion.suggestionType).toBe('production')
    expect(suggestion.productTypeSnapshot).toBe('subassembly')
    expect(suggestion.supplierId).toBeNull()
    expect(suggestion.supplierNameSnapshot).toBeNull()
  })

  it('MrpSuggestionSource rastreia quais OPs contribuíram para a necessidade; apagar a sugestão remove as fontes em cascata, nunca as OPs de origem', async () => {
    const user = await createTestUser('mrp-suggestion-source')
    createdUserIds.push(user.id)
    const product = await createTestProduct('mrp-suggestion-source')
    createdProductIds.push(product.id)
    const material = await createTestMaterial('mrp-suggestion-source')
    createdMaterialIds.push(material.id)

    const orderA = await db.productionOrder.create({
      data: { number: 'OP-MRP-TESTE-1', date: '01/01/2026', productId: product.id, quantity: 5, userId: user.id },
    })
    createdOrderIds.push(orderA.id)
    const orderB = await db.productionOrder.create({
      data: { number: 'OP-MRP-TESTE-2', date: '01/01/2026', productId: product.id, quantity: 3, userId: user.id },
    })
    createdOrderIds.push(orderB.id)

    const run = await db.mrpRun.create({ data: { number: 'MRP-TESTE-4', userId: user.id } })
    createdRunIds.push(run.id)

    const suggestion = await db.mrpSuggestion.create({
      data: {
        mrpRunId: run.id,
        suggestionType: 'purchase',
        itemType: 'material',
        materialId: material.id,
        quantityNeeded: 80,
        quantityAvailable: 0,
        quantityReserved: 0,
        quantityShortfall: 80,
      },
    })

    await db.mrpSuggestionSource.create({
      data: { mrpSuggestionId: suggestion.id, productionOrderId: orderA.id, contributedQuantity: 50 },
    })
    await db.mrpSuggestionSource.create({
      data: { mrpSuggestionId: suggestion.id, productionOrderId: orderB.id, contributedQuantity: 30 },
    })

    const sources = await db.mrpSuggestionSource.findMany({ where: { mrpSuggestionId: suggestion.id } })
    expect(sources).toHaveLength(2)
    const total = sources.reduce((sum, s) => sum + s.contributedQuantity, 0)
    expect(total).toBe(80)

    // Apagar a sugestão (cascade) remove as fontes, mas nunca as OPs de origem
    await db.mrpSuggestion.delete({ where: { id: suggestion.id } })
    const sourcesAfterDelete = await db.mrpSuggestionSource.findMany({ where: { mrpSuggestionId: suggestion.id } })
    expect(sourcesAfterDelete).toHaveLength(0)
    const orderAStillExists = await db.productionOrder.findUnique({ where: { id: orderA.id } })
    expect(orderAStillExists).not.toBeNull()
  })
})
