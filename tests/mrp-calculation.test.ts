import { describe, it, expect, afterAll } from 'vitest'
import { db } from '@/lib/db'
import { bomService } from '@/app/services/bom.service'
import { mrpCalculationService } from '@/app/services/mrp-calculation.service'
import { createTestUser, createTestProduct, createTestMaterial, createTestSupplier } from './helpers/fixtures'

/**
 * Fase 6, Subetapa 2 (ADR-007): motor de cálculo do MRP — função pura, nada é persistido aqui
 * (só leitura). Cobre os 10 cenários obrigatórios da especificação aprovada.
 */
describe('MRP — Motor de Cálculo (Subetapa 2)', () => {
  const createdUserIds: string[] = []
  const createdProductIds: string[] = []
  const createdMaterialIds: string[] = []
  const createdSupplierIds: string[] = []
  const createdRevisionIds: string[] = []
  const createdOrderIds: string[] = []
  let orderCounter = 0

  afterAll(async () => {
    await db.productionOrder.deleteMany({ where: { id: { in: createdOrderIds } } })
    await db.bomRevision.deleteMany({ where: { id: { in: createdRevisionIds } } })
    await db.supplier.deleteMany({ where: { id: { in: createdSupplierIds } } })
    await db.material.deleteMany({ where: { id: { in: createdMaterialIds } } })
    await db.product.deleteMany({ where: { id: { in: createdProductIds } } })
    await db.statusHistory.deleteMany({ where: { userId: { in: createdUserIds } } })
    await db.user.deleteMany({ where: { id: { in: createdUserIds } } })
  })

  async function releasedRevision(productId: string, userId: string, code: string) {
    const revision = (await bomService.createRevision(productId, { revisionCode: code, notes: '' }, userId)) as { id: string }
    createdRevisionIds.push(revision.id)
    return revision
  }

  async function openOrder(userId: string, productId: string, quantity: number, bomRevisionId: string | null) {
    orderCounter += 1
    const order = await db.productionOrder.create({
      data: {
        number: `OP-MRP-CALC-${orderCounter}`,
        date: '01/01/2026',
        status: 'planned',
        productId,
        quantity,
        userId,
        bomRevisionId,
      },
    })
    createdOrderIds.push(order.id)
    return order
  }

  it('1. Produto simples com uma matéria-prima, sem estoque nenhum', async () => {
    const user = await createTestUser('mrp-simple')
    createdUserIds.push(user.id)
    const product = await createTestProduct('mrp-simple')
    createdProductIds.push(product.id)
    const material = await createTestMaterial('mrp-simple')
    createdMaterialIds.push(material.id)

    const revision = await releasedRevision(product.id, user.id, 'A')
    await bomService.addLine(revision.id, {
      lineType: 'material', materialId: material.id, componentProductId: null,
      quantity: 2, unit: 'KG', scrapPct: 0, order: 0, notes: '',
    })
    await bomService.changeStatus(revision.id, 'released', user.id)

    await openOrder(user.id, product.id, 5, revision.id)

    const result = await mrpCalculationService.calculate()
    const suggestion = result.suggestions.find((s) => s.materialId === material.id)

    expect(suggestion).toBeDefined()
    expect(suggestion?.suggestionType).toBe('purchase')
    expect(suggestion?.quantityNeeded).toBe(10)
    expect(suggestion?.quantityAvailable).toBe(0)
    expect(suggestion?.quantityShortfall).toBe(10)
  })

  it('2. Produto multinível: Mesa → Estrutura (estoque parcial) → Tubo de aço', async () => {
    const user = await createTestUser('mrp-multilevel')
    createdUserIds.push(user.id)
    const mesa = await createTestProduct('mrp-multilevel-mesa')
    createdProductIds.push(mesa.id)
    const estrutura = await createTestProduct('mrp-multilevel-estrutura')
    createdProductIds.push(estrutura.id)
    const tubo = await createTestMaterial('mrp-multilevel-tubo')
    createdMaterialIds.push(tubo.id)

    await db.product.update({ where: { id: estrutura.id }, data: { stockQty: 6 } })

    const estruturaRevision = await releasedRevision(estrutura.id, user.id, 'A')
    await bomService.addLine(estruturaRevision.id, {
      lineType: 'material', materialId: tubo.id, componentProductId: null,
      quantity: 4, unit: 'KG', scrapPct: 0, order: 0, notes: '',
    })
    await bomService.changeStatus(estruturaRevision.id, 'released', user.id)

    const mesaRevision = await releasedRevision(mesa.id, user.id, 'A')
    await bomService.addLine(mesaRevision.id, {
      lineType: 'component', materialId: null, componentProductId: estrutura.id,
      quantity: 1, unit: 'UN', scrapPct: 0, order: 0, notes: '',
    })
    await bomService.changeStatus(mesaRevision.id, 'released', user.id)

    await openOrder(user.id, mesa.id, 10, mesaRevision.id)

    const result = await mrpCalculationService.calculate()
    const estruturaSuggestion = result.suggestions.find((s) => s.productId === estrutura.id)
    const tuboSuggestion = result.suggestions.find((s) => s.materialId === tubo.id)

    expect(estruturaSuggestion?.suggestionType).toBe('production')
    expect(estruturaSuggestion?.quantityNeeded).toBe(10)
    expect(estruturaSuggestion?.quantityAvailable).toBe(6)
    expect(estruturaSuggestion?.quantityShortfall).toBe(4)

    // Tubo só recebe a demanda do SHORTFALL da Estrutura (4), nunca da bruta (10): 4 * 4 = 16, não 4 * 10 = 40
    expect(tuboSuggestion?.suggestionType).toBe('purchase')
    expect(tuboSuggestion?.quantityNeeded).toBe(16)
    expect(tuboSuggestion?.quantityShortfall).toBe(16)
  })

  it('3. Estoque suficiente do subconjunto: nenhuma sugestão gerada, nada propaga para baixo', async () => {
    const user = await createTestUser('mrp-enough-stock')
    createdUserIds.push(user.id)
    const mesa = await createTestProduct('mrp-enough-stock-mesa')
    createdProductIds.push(mesa.id)
    const estrutura = await createTestProduct('mrp-enough-stock-estrutura')
    createdProductIds.push(estrutura.id)
    const tubo = await createTestMaterial('mrp-enough-stock-tubo')
    createdMaterialIds.push(tubo.id)

    await db.product.update({ where: { id: estrutura.id }, data: { stockQty: 10 } })

    const estruturaRevision = await releasedRevision(estrutura.id, user.id, 'A')
    await bomService.addLine(estruturaRevision.id, {
      lineType: 'material', materialId: tubo.id, componentProductId: null,
      quantity: 4, unit: 'KG', scrapPct: 0, order: 0, notes: '',
    })
    await bomService.changeStatus(estruturaRevision.id, 'released', user.id)

    const mesaRevision = await releasedRevision(mesa.id, user.id, 'A')
    await bomService.addLine(mesaRevision.id, {
      lineType: 'component', materialId: null, componentProductId: estrutura.id,
      quantity: 1, unit: 'UN', scrapPct: 0, order: 0, notes: '',
    })
    await bomService.changeStatus(mesaRevision.id, 'released', user.id)

    await openOrder(user.id, mesa.id, 10, mesaRevision.id)

    const result = await mrpCalculationService.calculate()

    expect(result.suggestions.find((s) => s.productId === estrutura.id)).toBeUndefined()
    expect(result.suggestions.find((s) => s.materialId === tubo.id)).toBeUndefined()
  })

  it('4. Estoque parcial: sugestão reflete só a diferença', async () => {
    const user = await createTestUser('mrp-partial-stock')
    createdUserIds.push(user.id)
    const product = await createTestProduct('mrp-partial-stock')
    createdProductIds.push(product.id)
    const material = await createTestMaterial('mrp-partial-stock')
    createdMaterialIds.push(material.id)
    await db.material.update({ where: { id: material.id }, data: { stockQty: 8 } })

    const revision = await releasedRevision(product.id, user.id, 'A')
    await bomService.addLine(revision.id, {
      lineType: 'material', materialId: material.id, componentProductId: null,
      quantity: 1, unit: 'KG', scrapPct: 0, order: 0, notes: '',
    })
    await bomService.changeStatus(revision.id, 'released', user.id)

    await openOrder(user.id, product.id, 20, revision.id)

    const result = await mrpCalculationService.calculate()
    const suggestion = result.suggestions.find((s) => s.materialId === material.id)

    expect(suggestion?.quantityNeeded).toBe(20)
    expect(suggestion?.quantityAvailable).toBe(8)
    expect(suggestion?.quantityShortfall).toBe(12)
  })

  it('5. Sem estoque nenhum: shortfall = necessidade inteira', async () => {
    const user = await createTestUser('mrp-no-stock')
    createdUserIds.push(user.id)
    const product = await createTestProduct('mrp-no-stock')
    createdProductIds.push(product.id)
    const material = await createTestMaterial('mrp-no-stock')
    createdMaterialIds.push(material.id)

    const revision = await releasedRevision(product.id, user.id, 'A')
    await bomService.addLine(revision.id, {
      lineType: 'material', materialId: material.id, componentProductId: null,
      quantity: 3, unit: 'KG', scrapPct: 0, order: 0, notes: '',
    })
    await bomService.changeStatus(revision.id, 'released', user.id)

    await openOrder(user.id, product.id, 7, revision.id)

    const result = await mrpCalculationService.calculate()
    const suggestion = result.suggestions.find((s) => s.materialId === material.id)

    expect(suggestion?.quantityNeeded).toBe(21)
    expect(suggestion?.quantityShortfall).toBe(21)
  })

  it('6. Material reservado: necessidade líquida desconta reservedQty, sem dupla contagem', async () => {
    const user = await createTestUser('mrp-reserved')
    createdUserIds.push(user.id)
    const product = await createTestProduct('mrp-reserved')
    createdProductIds.push(product.id)
    const material = await createTestMaterial('mrp-reserved')
    createdMaterialIds.push(material.id)
    await db.material.update({ where: { id: material.id }, data: { stockQty: 30, reservedQty: 30 } })

    const revision = await releasedRevision(product.id, user.id, 'A')
    await bomService.addLine(revision.id, {
      lineType: 'material', materialId: material.id, componentProductId: null,
      quantity: 1, unit: 'KG', scrapPct: 0, order: 0, notes: '',
    })
    await bomService.changeStatus(revision.id, 'released', user.id)

    await openOrder(user.id, product.id, 100, revision.id)

    const result = await mrpCalculationService.calculate()
    const suggestion = result.suggestions.find((s) => s.materialId === material.id)

    // needed=100, reservedQty=30, freeStock=max(0,30-30)=0, available=0 → shortfall = 100-30-0 = 70 (nunca 100+30)
    expect(suggestion?.quantityNeeded).toBe(100)
    expect(suggestion?.quantityReserved).toBe(30)
    expect(suggestion?.quantityAvailable).toBe(0)
    expect(suggestion?.quantityShortfall).toBe(70)
  })

  it('7. Duas OPs usando o mesmo material: demanda agregada corretamente', async () => {
    const user = await createTestUser('mrp-two-orders')
    createdUserIds.push(user.id)
    const productA = await createTestProduct('mrp-two-orders-a')
    createdProductIds.push(productA.id)
    const productB = await createTestProduct('mrp-two-orders-b')
    createdProductIds.push(productB.id)
    const material = await createTestMaterial('mrp-two-orders')
    createdMaterialIds.push(material.id)

    const revisionA = await releasedRevision(productA.id, user.id, 'A')
    await bomService.addLine(revisionA.id, {
      lineType: 'material', materialId: material.id, componentProductId: null,
      quantity: 2, unit: 'KG', scrapPct: 0, order: 0, notes: '',
    })
    await bomService.changeStatus(revisionA.id, 'released', user.id)

    const revisionB = await releasedRevision(productB.id, user.id, 'A')
    await bomService.addLine(revisionB.id, {
      lineType: 'material', materialId: material.id, componentProductId: null,
      quantity: 3, unit: 'KG', scrapPct: 0, order: 0, notes: '',
    })
    await bomService.changeStatus(revisionB.id, 'released', user.id)

    await openOrder(user.id, productA.id, 5, revisionA.id) // 10
    await openOrder(user.id, productB.id, 4, revisionB.id) // 12

    const result = await mrpCalculationService.calculate()
    const suggestion = result.suggestions.find((s) => s.materialId === material.id)

    expect(suggestion?.quantityNeeded).toBe(22)
    expect(suggestion?.sources.reduce((sum, s) => sum + s.quantity, 0)).toBeCloseTo(22)
  })

  it('8. Material sem fornecedor vinculado: sugestão gerada mesmo assim, sinalizando a lacuna', async () => {
    const user = await createTestUser('mrp-no-supplier')
    createdUserIds.push(user.id)
    const product = await createTestProduct('mrp-no-supplier')
    createdProductIds.push(product.id)
    const material = await createTestMaterial('mrp-no-supplier')
    createdMaterialIds.push(material.id)

    const revision = await releasedRevision(product.id, user.id, 'A')
    await bomService.addLine(revision.id, {
      lineType: 'material', materialId: material.id, componentProductId: null,
      quantity: 1, unit: 'KG', scrapPct: 0, order: 0, notes: '',
    })
    await bomService.changeStatus(revision.id, 'released', user.id)

    await openOrder(user.id, product.id, 5, revision.id)

    const result = await mrpCalculationService.calculate()
    const suggestion = result.suggestions.find((s) => s.materialId === material.id)

    expect(suggestion?.quantityShortfall).toBe(5)
    expect(suggestion?.supplierId).toBeNull()
    expect(suggestion?.supplierNameSnapshot).toBeNull()
  })

  it('8b. Material com fornecedor preferencial: sugestão enriquecida com supplierId/nome', async () => {
    const user = await createTestUser('mrp-with-supplier')
    createdUserIds.push(user.id)
    const product = await createTestProduct('mrp-with-supplier')
    createdProductIds.push(product.id)
    const material = await createTestMaterial('mrp-with-supplier')
    createdMaterialIds.push(material.id)
    const supplier = await createTestSupplier('mrp-with-supplier')
    createdSupplierIds.push(supplier.id)
    await db.supplierMaterial.create({
      data: { supplierId: supplier.id, materialId: material.id, isPreferred: true },
    })

    const revision = await releasedRevision(product.id, user.id, 'A')
    await bomService.addLine(revision.id, {
      lineType: 'material', materialId: material.id, componentProductId: null,
      quantity: 1, unit: 'KG', scrapPct: 0, order: 0, notes: '',
    })
    await bomService.changeStatus(revision.id, 'released', user.id)

    await openOrder(user.id, product.id, 5, revision.id)

    const result = await mrpCalculationService.calculate()
    const suggestion = result.suggestions.find((s) => s.materialId === material.id)

    expect(suggestion?.supplierId).toBe(supplier.id)
    expect(suggestion?.supplierNameSnapshot).toBe(supplier.corporateName)
  })

  it('9. Subconjunto com estoque próprio e com outra OP aberta produzindo mais dele (inProduction reduz o shortfall)', async () => {
    const user = await createTestUser('mrp-in-production')
    createdUserIds.push(user.id)
    const mesa = await createTestProduct('mrp-in-production-mesa')
    createdProductIds.push(mesa.id)
    const estrutura = await createTestProduct('mrp-in-production-estrutura')
    createdProductIds.push(estrutura.id)
    const parafuso = await createTestMaterial('mrp-in-production-parafuso')
    createdMaterialIds.push(parafuso.id)

    const estruturaRevision = await releasedRevision(estrutura.id, user.id, 'A')
    await bomService.addLine(estruturaRevision.id, {
      lineType: 'material', materialId: parafuso.id, componentProductId: null,
      quantity: 1, unit: 'UN', scrapPct: 0, order: 0, notes: '',
    })
    await bomService.changeStatus(estruturaRevision.id, 'released', user.id)

    const mesaRevision = await releasedRevision(mesa.id, user.id, 'A')
    await bomService.addLine(mesaRevision.id, {
      lineType: 'component', materialId: null, componentProductId: estrutura.id,
      quantity: 1, unit: 'UN', scrapPct: 0, order: 0, notes: '',
    })
    await bomService.changeStatus(mesaRevision.id, 'released', user.id)

    // OP-A produz a Estrutura diretamente (demanda própria, nível 0) — vira "em produção" pra quem mais precisar dela
    await openOrder(user.id, estrutura.id, 5, estruturaRevision.id)
    // OP-B precisa de 8 Estruturas como componente da Mesa
    await openOrder(user.id, mesa.id, 8, mesaRevision.id)

    const result = await mrpCalculationService.calculate()
    const estruturaSuggestion = result.suggestions.find((s) => s.productId === estrutura.id)

    // needed (só da Mesa, dependente) = 8 ; available = inProduction (5, da OP-A) ; shortfall = 8 - 0 - 5 = 3
    expect(estruturaSuggestion?.quantityNeeded).toBe(8)
    expect(estruturaSuggestion?.quantityAvailable).toBe(5)
    expect(estruturaSuggestion?.quantityShortfall).toBe(3)
  })

  it('10. Alteração de BOM após a OP ser criada: usa a revisão CONGELADA, nunca a nova ativa', async () => {
    const user = await createTestUser('mrp-frozen-revision')
    createdUserIds.push(user.id)
    const product = await createTestProduct('mrp-frozen-revision')
    createdProductIds.push(product.id)
    const materialOriginal = await createTestMaterial('mrp-frozen-revision-original')
    createdMaterialIds.push(materialOriginal.id)
    const materialNovo = await createTestMaterial('mrp-frozen-revision-novo')
    createdMaterialIds.push(materialNovo.id)

    const revisionA = await releasedRevision(product.id, user.id, 'A')
    await bomService.addLine(revisionA.id, {
      lineType: 'material', materialId: materialOriginal.id, componentProductId: null,
      quantity: 2, unit: 'KG', scrapPct: 0, order: 0, notes: '',
    })
    await bomService.changeStatus(revisionA.id, 'released', user.id)

    // OP congela a revisão A
    await openOrder(user.id, product.id, 5, revisionA.id)

    // Depois da OP criada, uma revisão B nova é liberada com estrutura DIFERENTE — A vira obsoleta
    const revisionB = await releasedRevision(product.id, user.id, 'B')
    await bomService.addLine(revisionB.id, {
      lineType: 'material', materialId: materialNovo.id, componentProductId: null,
      quantity: 999, unit: 'KG', scrapPct: 0, order: 0, notes: '',
    })
    await bomService.changeStatus(revisionB.id, 'released', user.id)

    const result = await mrpCalculationService.calculate()

    const originalSuggestion = result.suggestions.find((s) => s.materialId === materialOriginal.id)
    const novoSuggestion = result.suggestions.find((s) => s.materialId === materialNovo.id)

    expect(originalSuggestion?.quantityNeeded).toBe(10) // 2 * 5, da revisão A congelada
    expect(novoSuggestion).toBeUndefined() // a revisão B nunca deveria ter sido usada para esta OP
  })
})
