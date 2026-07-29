import { describe, it, expect, afterAll } from 'vitest'
import { db } from '@/lib/db'
import { bomService } from '@/app/services/bom.service'
import { productionOrderService } from '@/app/services/production-order.service'
import { createTestUser, createTestProduct, createTestMaterial } from './helpers/fixtures'

/**
 * ADR-023 (Decisão #1, Estorno) — segundo caso concreto, o mais arriscado dos 4 mapeados no
 * levantamento: reverter uma rodada de produção (`ProductBatch`). Só suportado para produto
 * lotControlled (única situação em que existe um `ProductBatch` pra ancorar a reversão com
 * segurança). Recusa sem cascata quando o lote já virou componente de outra OP.
 */
describe('Produção — Estorno de rodada de produção (ADR-023, Decisão #1)', () => {
  const createdUserIds: string[] = []
  const createdProductIds: string[] = []
  const createdMaterialIds: string[] = []
  const createdRevisionIds: string[] = []
  const createdOrderIds: string[] = []

  afterAll(async () => {
    await db.batchConsumption.deleteMany({ where: { productBatch: { productionOrderId: { in: createdOrderIds } } } })
    await db.productBatch.deleteMany({ where: { productionOrderId: { in: createdOrderIds } } })
    await db.productionOrderExecution.deleteMany({ where: { productionOrderId: { in: createdOrderIds } } })
    await db.materialReservation.deleteMany({ where: { productionOrderId: { in: createdOrderIds } } })
    await db.stockMovement.deleteMany({ where: { referenceId: { in: createdOrderIds } } })
    await db.productionOrder.deleteMany({ where: { id: { in: createdOrderIds } } })
    await db.bomRevision.deleteMany({ where: { id: { in: createdRevisionIds } } })
    await db.materialBatch.deleteMany({ where: { materialId: { in: createdMaterialIds } } })
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

  it('1. Reverte uma rodada simples: estoque do produto e do material voltam, OP recua status/quantidade', async () => {
    const user = await createTestUser('reverse-prod-simples')
    createdUserIds.push(user.id)
    const mesa = await createTestProduct('reverse-prod-simples-mesa')
    createdProductIds.push(mesa.id)
    await db.product.update({ where: { id: mesa.id }, data: { lotControlled: true } })
    const tubo = await createTestMaterial('reverse-prod-simples-tubo')
    createdMaterialIds.push(tubo.id)
    await db.material.update({ where: { id: tubo.id }, data: { lotControlled: true, stockQty: 1000 } })
    await db.materialBatch.create({
      data: { materialId: tubo.id, batchNumber: 'REV-PROD-LOTE', quantityReceived: 1000, quantityAvailable: 1000 },
    })

    const revision = await releasedRevision(mesa.id, user.id, 'A')
    await bomService.addLine(revision.id, { lineType: 'material', materialId: tubo.id, componentProductId: null, quantity: 2, unit: 'KG', scrapPct: 0, order: 0, notes: '' })
    await bomService.changeStatus(revision.id, 'released', user.id)

    const order = (await productionOrderService.create({ productId: mesa.id, quantity: 10, unit: 'UN' }, user.id)) as { id: string; number: string }
    createdOrderIds.push(order.id)
    await productionOrderService.produce(order.id, 10, user.id)

    const productBatch = (await db.productBatch.findFirst({ where: { productionOrderId: order.id } }))!
    const materialBefore = (await db.material.findUnique({ where: { id: tubo.id } }))!
    expect(materialBefore.stockQty).toBe(1000 - 20) // 10un * 2kg

    await productionOrderService.reverseProduction(productBatch.id, 'Produção lançada por engano', user.id)

    const mesaAfter = (await db.product.findUnique({ where: { id: mesa.id } }))!
    expect(mesaAfter.stockQty).toBe(0)

    const materialAfter = (await db.material.findUnique({ where: { id: tubo.id } }))!
    expect(materialAfter.stockQty).toBe(1000)

    const batchAfter = (await db.materialBatch.findFirst({ where: { materialId: tubo.id } }))!
    expect(batchAfter.quantityAvailable).toBe(1000)

    const orderAfter = (await db.productionOrder.findUnique({ where: { id: order.id } }))!
    expect(orderAfter.quantityCompleted).toBe(0)
    expect(orderAfter.status).toBe('in_progress')

    const productBatchAfter = (await db.productBatch.findUnique({ where: { id: productBatch.id } }))!
    expect(productBatchAfter.reversedAt).not.toBeNull()

    const consumptions = await db.batchConsumption.findMany({ where: { productBatchId: productBatch.id } })
    expect(consumptions).toHaveLength(0)
  })

  it('2. Reverte uma rodada com subconjunto: estoque do subconjunto (produto componente) também volta', async () => {
    const user = await createTestUser('reverse-prod-subconjunto')
    createdUserIds.push(user.id)
    const estrutura = await createTestProduct('reverse-prod-subconjunto-estrutura')
    createdProductIds.push(estrutura.id)
    await db.product.update({ where: { id: estrutura.id }, data: { lotControlled: true, stockQty: 100 } })
    const mesa = await createTestProduct('reverse-prod-subconjunto-mesa')
    createdProductIds.push(mesa.id)
    await db.product.update({ where: { id: mesa.id }, data: { lotControlled: true } })

    const estruturaOrder = (await productionOrderService.create({ productId: estrutura.id, quantity: 5, unit: 'UN' }, user.id)) as { id: string }
    createdOrderIds.push(estruturaOrder.id)
    await db.productBatch.create({
      data: { productId: estrutura.id, productionOrderId: estruturaOrder.id, batchNumber: 'REV-ESTRUTURA-LOTE', quantityProduced: 5, producedAt: new Date('2026-01-01') },
    })

    const mesaRevision = await releasedRevision(mesa.id, user.id, 'A')
    await bomService.addLine(mesaRevision.id, { lineType: 'component', materialId: null, componentProductId: estrutura.id, quantity: 1, unit: 'UN', scrapPct: 0, order: 0, notes: '' })
    await bomService.changeStatus(mesaRevision.id, 'released', user.id)

    const mesaOrder = (await productionOrderService.create({ productId: mesa.id, quantity: 5, unit: 'UN' }, user.id)) as { id: string; number: string }
    createdOrderIds.push(mesaOrder.id)
    await productionOrderService.produce(mesaOrder.id, 5, user.id)

    const estruturaBefore = (await db.product.findUnique({ where: { id: estrutura.id } }))!
    expect(estruturaBefore.stockQty).toBe(95)

    const mesaBatch = (await db.productBatch.findFirst({ where: { productionOrderId: mesaOrder.id } }))!
    await productionOrderService.reverseProduction(mesaBatch.id, 'Teste de reversão com subconjunto', user.id)

    const estruturaAfter = (await db.product.findUnique({ where: { id: estrutura.id } }))!
    expect(estruturaAfter.stockQty).toBe(100)

    const mesaAfter = (await db.product.findUnique({ where: { id: mesa.id } }))!
    expect(mesaAfter.stockQty).toBe(0)
  })

  it('3. Recusa estornar quando o lote já foi consumido como componente de outra OP', async () => {
    const user = await createTestUser('reverse-prod-consumido')
    createdUserIds.push(user.id)
    const estrutura = await createTestProduct('reverse-prod-consumido-estrutura')
    createdProductIds.push(estrutura.id)
    await db.product.update({ where: { id: estrutura.id }, data: { lotControlled: true } })
    const mesa = await createTestProduct('reverse-prod-consumido-mesa')
    createdProductIds.push(mesa.id)
    await db.product.update({ where: { id: mesa.id }, data: { lotControlled: true } })

    const estruturaRevision = await releasedRevision(estrutura.id, user.id, 'A')
    await bomService.changeStatus(estruturaRevision.id, 'released', user.id)
    const estruturaOrder = (await productionOrderService.create({ productId: estrutura.id, quantity: 5, unit: 'UN' }, user.id)) as { id: string }
    createdOrderIds.push(estruturaOrder.id)
    await productionOrderService.produce(estruturaOrder.id, 5, user.id)
    const estruturaBatch = (await db.productBatch.findFirst({ where: { productionOrderId: estruturaOrder.id } }))!

    const mesaRevision = await releasedRevision(mesa.id, user.id, 'A')
    await bomService.addLine(mesaRevision.id, { lineType: 'component', materialId: null, componentProductId: estrutura.id, quantity: 1, unit: 'UN', scrapPct: 0, order: 0, notes: '' })
    await bomService.changeStatus(mesaRevision.id, 'released', user.id)
    const mesaOrder = (await productionOrderService.create({ productId: mesa.id, quantity: 5, unit: 'UN' }, user.id)) as { id: string; number: string }
    createdOrderIds.push(mesaOrder.id)
    await productionOrderService.produce(mesaOrder.id, 5, user.id)

    await expect(productionOrderService.reverseProduction(estruturaBatch.id, 'Tentando estornar mesmo assim', user.id)).rejects.toThrow(
      new RegExp(mesaOrder.number)
    )
  })

  it('4. Recusa estornar um lote já estornado', async () => {
    const user = await createTestUser('reverse-prod-duplo')
    createdUserIds.push(user.id)
    const mesa = await createTestProduct('reverse-prod-duplo-mesa')
    createdProductIds.push(mesa.id)
    await db.product.update({ where: { id: mesa.id }, data: { lotControlled: true } })
    const revision = await releasedRevision(mesa.id, user.id, 'A')
    await bomService.changeStatus(revision.id, 'released', user.id)
    const order = (await productionOrderService.create({ productId: mesa.id, quantity: 3, unit: 'UN' }, user.id)) as { id: string }
    createdOrderIds.push(order.id)
    await productionOrderService.produce(order.id, 3, user.id)
    const productBatch = (await db.productBatch.findFirst({ where: { productionOrderId: order.id } }))!

    await productionOrderService.reverseProduction(productBatch.id, 'Primeiro estorno', user.id)
    await expect(productionOrderService.reverseProduction(productBatch.id, 'Segundo estorno', user.id)).rejects.toThrow()
  })

  it('5. Recusa estornar quando o saldo do produto já é menor que a quantidade da rodada (saiu por outro caminho)', async () => {
    const user = await createTestUser('reverse-prod-saldo-insuficiente')
    createdUserIds.push(user.id)
    const mesa = await createTestProduct('reverse-prod-saldo-mesa')
    createdProductIds.push(mesa.id)
    await db.product.update({ where: { id: mesa.id }, data: { lotControlled: true } })
    const revision = await releasedRevision(mesa.id, user.id, 'A')
    await bomService.changeStatus(revision.id, 'released', user.id)
    const order = (await productionOrderService.create({ productId: mesa.id, quantity: 4, unit: 'UN' }, user.id)) as { id: string }
    createdOrderIds.push(order.id)
    await productionOrderService.produce(order.id, 4, user.id)
    const productBatch = (await db.productBatch.findFirst({ where: { productionOrderId: order.id } }))!

    // Simula que parte do saldo já saiu por outro caminho (ex.: ajuste manual de estoque).
    await db.product.update({ where: { id: mesa.id }, data: { stockQty: 1 } })

    await expect(productionOrderService.reverseProduction(productBatch.id, 'Tentando mesmo assim', user.id)).rejects.toThrow()
  })
})
