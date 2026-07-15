import { describe, it, expect, afterAll } from 'vitest'
import { db } from '@/lib/db'
import { registerDomainEventHandlers } from '@/lib/register-domain-event-handlers'
import { bomService } from '@/app/services/bom.service'
import { productionOrderService } from '@/app/services/production-order.service'
import { stockValuationService } from '@/app/services/stock-valuation.service'
import { createTestUser, createTestProduct, createTestMaterial } from './helpers/fixtures'

/**
 * Fase 12 (ADR-016, Subetapa 5) — `StockValuationService`. Matéria-prima: valorização precisa por
 * lote (`Σ quantityAvailable × unitCost`). Produto acabado: aproximação disclosed
 * (`Product.stockQty × custo do ProductBatch mais recente`) — `ProductBatch` não tem
 * `quantityAvailable` próprio, então não há como valorizar por lote como a matéria-prima.
 */
describe('Financeiro — StockValuationService (Fase 12, Subetapa 5)', () => {
  const createdUserIds: string[] = []
  const createdProductIds: string[] = []
  const createdMaterialIds: string[] = []
  const createdRevisionIds: string[] = []
  const createdOrderIds: string[] = []
  const createdMaterialBatchIds: string[] = []

  registerDomainEventHandlers()

  afterAll(async () => {
    await db.batchConsumption.deleteMany({ where: { productBatch: { productionOrderId: { in: createdOrderIds } } } })
    await db.productBatch.deleteMany({ where: { productionOrderId: { in: createdOrderIds } } })
    await db.materialBatch.deleteMany({ where: { OR: [{ id: { in: createdMaterialBatchIds } }, { materialId: { in: createdMaterialIds } }] } })
    await db.productionOrderExecution.deleteMany({ where: { productionOrderId: { in: createdOrderIds } } })
    await db.materialReservation.deleteMany({ where: { productionOrderId: { in: createdOrderIds } } })
    await db.stockMovement.deleteMany({ where: { referenceId: { in: createdOrderIds } } })
    await db.productionOrder.deleteMany({ where: { id: { in: createdOrderIds } } })
    await db.bomRevision.deleteMany({ where: { id: { in: createdRevisionIds } } })
    await db.material.deleteMany({ where: { id: { in: createdMaterialIds } } })
    await db.product.deleteMany({ where: { id: { in: createdProductIds } } })
    await db.statusHistory.deleteMany({ where: { userId: { in: createdUserIds } } })
    await db.user.deleteMany({ where: { id: { in: createdUserIds } } })
  })

  it('1. Matéria-prima: soma valor de todos os lotes abertos do mesmo material, com custo médio ponderado', async () => {
    const tubo = await createTestMaterial('valuation-mp-basico')
    createdMaterialIds.push(tubo.id)

    const batchA = await db.materialBatch.create({
      data: { materialId: tubo.id, batchNumber: 'VAL-A', quantityReceived: 100, quantityAvailable: 100, unitCost: 10 },
    })
    const batchB = await db.materialBatch.create({
      data: { materialId: tubo.id, batchNumber: 'VAL-B', quantityReceived: 50, quantityAvailable: 50, unitCost: 20 },
    })
    createdMaterialBatchIds.push(batchA.id, batchB.id)

    const result = await stockValuationService.getRawMaterialValuation()
    const line = result.lines.find((l) => l.materialId === tubo.id)

    expect(line).toBeDefined()
    expect(line?.quantityAvailable).toBe(150) // 100 + 50
    expect(line?.value).toBe(100 * 10 + 50 * 20) // 1000 + 1000 = 2000
    expect(line?.averageUnitCost).toBeCloseTo(2000 / 150, 5)
    expect(result.total).toBeGreaterThanOrEqual(2000) // outros testes podem coexistir no mesmo banco
  })

  it('2. Matéria-prima: lote com quantityAvailable=0 (totalmente consumido) não entra na valorização', async () => {
    const tubo = await createTestMaterial('valuation-mp-esgotado')
    createdMaterialIds.push(tubo.id)

    const batch = await db.materialBatch.create({
      data: { materialId: tubo.id, batchNumber: 'VAL-ESGOTADO', quantityReceived: 100, quantityAvailable: 0, unitCost: 15 },
    })
    createdMaterialBatchIds.push(batch.id)

    const result = await stockValuationService.getRawMaterialValuation()
    expect(result.lines.find((l) => l.materialId === tubo.id)).toBeUndefined()
  })

  it('3. Produto acabado: stockQty × custo de material do ProductBatch mais recente', async () => {
    const user = await createTestUser('valuation-pa')
    createdUserIds.push(user.id)
    const mesa = await createTestProduct('valuation-pa-mesa')
    createdProductIds.push(mesa.id)
    await db.product.update({ where: { id: mesa.id }, data: { lotControlled: true } })
    const tubo = await createTestMaterial('valuation-pa-tubo')
    createdMaterialIds.push(tubo.id)
    await db.material.update({ where: { id: tubo.id }, data: { lotControlled: true, stockQty: 1000 } })
    const batch = await db.materialBatch.create({
      data: { materialId: tubo.id, batchNumber: 'VAL-PA', quantityReceived: 1000, quantityAvailable: 1000, unitCost: 4 },
    })
    createdMaterialBatchIds.push(batch.id)

    const revision = (await bomService.createRevision(mesa.id, { revisionCode: 'A', notes: '' }, user.id)) as { id: string }
    createdRevisionIds.push(revision.id)
    await bomService.addLine(revision.id, { lineType: 'material', materialId: tubo.id, componentProductId: null, quantity: 2, unit: 'KG', scrapPct: 0, order: 0, notes: '' })
    await bomService.changeStatus(revision.id, 'released', user.id)

    const order = (await productionOrderService.create({ productId: mesa.id, quantity: 5, unit: 'UN' }, user.id)) as { id: string }
    createdOrderIds.push(order.id)
    await productionOrderService.produce(order.id, 5, user.id) // 2kg * 5un * R$4 = R$40 de custo de material no lote

    const result = await stockValuationService.getFinishedGoodsValuation()
    const line = result.lines.find((l) => l.productId === mesa.id)

    expect(line).toBeDefined()
    expect(line?.stockQty).toBe(5) // produce() incrementa Product.stockQty (saldo agregado)
    expect(line?.unitCost).toBe(40) // custo de material do lote mais recente
    expect(line?.value).toBe(5 * 40) // 200 — aproximação: stockQty agregado × custo do lote mais recente
  })

  it('4. Produto acabado sem nenhum ProductBatch: unitCost e value ficam null (não 0)', async () => {
    const mesa = await createTestProduct('valuation-pa-sem-lote')
    createdProductIds.push(mesa.id)
    await db.product.update({ where: { id: mesa.id }, data: { stockQty: 3 } }) // nunca produzido via fluxo lotControlled

    const result = await stockValuationService.getFinishedGoodsValuation()
    const line = result.lines.find((l) => l.productId === mesa.id)

    expect(line).toBeDefined()
    expect(line?.unitCost).toBeNull()
    expect(line?.value).toBeNull()
  })

  it('5. getTotalValuation combina matéria-prima e produto acabado', async () => {
    const totals = await stockValuationService.getTotalValuation()
    expect(totals.total).toBeCloseTo(totals.rawMaterial + totals.finishedGoods, 5)
  })
})
