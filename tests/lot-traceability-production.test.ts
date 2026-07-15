import { describe, it, expect, afterAll } from 'vitest'
import { db } from '@/lib/db'
import { bomService } from '@/app/services/bom.service'
import { productionOrderService } from '@/app/services/production-order.service'
import { createTestUser, createTestProduct, createTestMaterial } from './helpers/fixtures'

/**
 * Fase 10, Subetapa 3 (ADR-013): `produce()`/`produceWithTx()` seleciona lote(s) de origem via
 * FIFO (mesma granularidade do consumo físico de um nível, não de `releaseTargets`) e grava
 * `BatchConsumption`, criando um `ProductBatch` por rodada quando o produto acabado é lotControlled.
 * Opt-in por item — Material/Product sem o flag continuam exatamente como na Fase 9/ADR-011/012,
 * sem nenhum MaterialBatch/ProductBatch/BatchConsumption envolvido.
 */
describe('Rastreabilidade por Lote — Produção (Fase 10, Subetapa 3)', () => {
  const createdUserIds: string[] = []
  const createdProductIds: string[] = []
  const createdMaterialIds: string[] = []
  const createdRevisionIds: string[] = []
  const createdOrderIds: string[] = []

  afterAll(async () => {
    await db.batchConsumption.deleteMany({ where: { productBatch: { productionOrderId: { in: createdOrderIds } } } })
    await db.productBatch.deleteMany({ where: { productionOrderId: { in: createdOrderIds } } })
    await db.materialBatch.deleteMany({ where: { materialId: { in: createdMaterialIds } } })
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

  async function releasedRevision(productId: string, userId: string, code: string) {
    const revision = (await bomService.createRevision(productId, { revisionCode: code, notes: '' }, userId)) as { id: string }
    createdRevisionIds.push(revision.id)
    return revision
  }

  it('1. Produto e material lotControlled, um único lote de matéria-prima: ProductBatch e BatchConsumption criados corretamente', async () => {
    const user = await createTestUser('lote-prod-simples')
    createdUserIds.push(user.id)
    const mesa = await createTestProduct('lote-prod-simples-mesa')
    createdProductIds.push(mesa.id)
    await db.product.update({ where: { id: mesa.id }, data: { lotControlled: true } })
    const tubo = await createTestMaterial('lote-prod-simples-tubo')
    createdMaterialIds.push(tubo.id)
    await db.material.update({ where: { id: tubo.id }, data: { lotControlled: true, stockQty: 1000 } })

    const batch = await db.materialBatch.create({
      data: { materialId: tubo.id, batchNumber: 'LOTE-UNICO', quantityReceived: 1000, quantityAvailable: 1000, receivedAt: new Date('2026-01-01') },
    })

    const revision = await releasedRevision(mesa.id, user.id, 'A')
    await bomService.addLine(revision.id, { lineType: 'material', materialId: tubo.id, componentProductId: null, quantity: 2, unit: 'KG', scrapPct: 0, order: 0, notes: '' })
    await bomService.changeStatus(revision.id, 'released', user.id)

    const order = (await productionOrderService.create({ productId: mesa.id, quantity: 10, unit: 'UN' }, user.id)) as { id: string; number: string }
    createdOrderIds.push(order.id)

    await productionOrderService.produce(order.id, 10, user.id)

    const productBatch = await db.productBatch.findFirst({ where: { productionOrderId: order.id } })
    expect(productBatch).not.toBeNull()
    expect(productBatch?.quantityProduced).toBe(10)
    expect(productBatch?.batchNumber).toBe(`${order.number}-1`)

    const consumptions = await db.batchConsumption.findMany({ where: { productBatchId: productBatch!.id } })
    expect(consumptions).toHaveLength(1)
    expect(consumptions[0].itemType).toBe('material')
    expect(consumptions[0].materialBatchId).toBe(batch.id)
    expect(consumptions[0].quantityConsumed).toBe(20) // 2 kg/un * 10 un

    const batchAfter = await db.materialBatch.findUnique({ where: { id: batch.id } })
    expect(batchAfter?.quantityAvailable).toBe(980) // 1000 - 20
  })

  it('2. FIFO atravessa dois lotes de matéria-prima quando o mais antigo não é suficiente sozinho', async () => {
    const user = await createTestUser('lote-prod-fifo')
    createdUserIds.push(user.id)
    const mesa = await createTestProduct('lote-prod-fifo-mesa')
    createdProductIds.push(mesa.id)
    await db.product.update({ where: { id: mesa.id }, data: { lotControlled: true } })
    const tubo = await createTestMaterial('lote-prod-fifo-tubo')
    createdMaterialIds.push(tubo.id)
    await db.material.update({ where: { id: tubo.id }, data: { lotControlled: true, stockQty: 1000 } })

    const batchAntigo = await db.materialBatch.create({
      data: { materialId: tubo.id, batchNumber: 'LOTE-ANTIGO', quantityReceived: 15, quantityAvailable: 15, receivedAt: new Date('2026-01-01') },
    })
    const batchNovo = await db.materialBatch.create({
      data: { materialId: tubo.id, batchNumber: 'LOTE-NOVO', quantityReceived: 100, quantityAvailable: 100, receivedAt: new Date('2026-02-01') },
    })

    const revision = await releasedRevision(mesa.id, user.id, 'A')
    await bomService.addLine(revision.id, { lineType: 'material', materialId: tubo.id, componentProductId: null, quantity: 1, unit: 'KG', scrapPct: 0, order: 0, notes: '' })
    await bomService.changeStatus(revision.id, 'released', user.id)

    const order = (await productionOrderService.create({ productId: mesa.id, quantity: 20, unit: 'UN' }, user.id)) as { id: string }
    createdOrderIds.push(order.id)

    await productionOrderService.produce(order.id, 20, user.id) // consome 20kg de Tubo

    const productBatch = await db.productBatch.findFirst({ where: { productionOrderId: order.id } })
    const consumptions = await db.batchConsumption.findMany({ where: { productBatchId: productBatch!.id }, orderBy: { createdAt: 'asc' } })
    expect(consumptions).toHaveLength(2)
    expect(consumptions[0].materialBatchId).toBe(batchAntigo.id) // mais antigo primeiro
    expect(consumptions[0].quantityConsumed).toBe(15) // esgota o lote antigo
    expect(consumptions[1].materialBatchId).toBe(batchNovo.id)
    expect(consumptions[1].quantityConsumed).toBe(5) // completa do lote novo

    const antigoAfter = await db.materialBatch.findUnique({ where: { id: batchAntigo.id } })
    expect(antigoAfter?.quantityAvailable).toBe(0)
    const novoAfter = await db.materialBatch.findUnique({ where: { id: batchNovo.id } })
    expect(novoAfter?.quantityAvailable).toBe(95)
  })

  it('3. Subconjunto lotControlled consumido como componente: BatchConsumption aponta para o ProductBatch do subconjunto (itemType="product")', async () => {
    const user = await createTestUser('lote-prod-subconjunto')
    createdUserIds.push(user.id)
    const estrutura = await createTestProduct('lote-prod-subconjunto-estrutura')
    createdProductIds.push(estrutura.id)
    await db.product.update({ where: { id: estrutura.id }, data: { lotControlled: true, stockQty: 100000 } })
    const mesa = await createTestProduct('lote-prod-subconjunto-mesa')
    createdProductIds.push(mesa.id)
    await db.product.update({ where: { id: mesa.id }, data: { lotControlled: true } })

    // Simula que Estrutura já foi produzida (lote próprio existente), sem passar pelo fluxo de
    // produção real dela — mesmo padrão de setup já usado em production-order-reconciliation.test.ts.
    const estruturaOrder = (await productionOrderService.create({ productId: estrutura.id, quantity: 5, unit: 'UN' }, user.id)) as { id: string }
    createdOrderIds.push(estruturaOrder.id)
    const estruturaBatch = await db.productBatch.create({
      data: { productId: estrutura.id, productionOrderId: estruturaOrder.id, batchNumber: 'ESTRUTURA-LOTE-A', quantityProduced: 5, producedAt: new Date('2026-01-01') },
    })

    const mesaRevision = await releasedRevision(mesa.id, user.id, 'A')
    await bomService.addLine(mesaRevision.id, { lineType: 'component', materialId: null, componentProductId: estrutura.id, quantity: 1, unit: 'UN', scrapPct: 0, order: 0, notes: '' })
    await bomService.changeStatus(mesaRevision.id, 'released', user.id)

    const mesaOrder = (await productionOrderService.create({ productId: mesa.id, quantity: 5, unit: 'UN' }, user.id)) as { id: string }
    createdOrderIds.push(mesaOrder.id)

    await productionOrderService.produce(mesaOrder.id, 5, user.id)

    const mesaBatch = await db.productBatch.findFirst({ where: { productionOrderId: mesaOrder.id } })
    const consumptions = await db.batchConsumption.findMany({ where: { productBatchId: mesaBatch!.id } })
    expect(consumptions).toHaveLength(1)
    expect(consumptions[0].itemType).toBe('product')
    expect(consumptions[0].consumedProductBatchId).toBe(estruturaBatch.id)
    expect(consumptions[0].quantityConsumed).toBe(5)
  })

  it('4. Produção parcial em rodadas separadas: cada rodada cria seu próprio ProductBatch com sequência incremental', async () => {
    const user = await createTestUser('lote-prod-parcial')
    createdUserIds.push(user.id)
    const mesa = await createTestProduct('lote-prod-parcial-mesa')
    createdProductIds.push(mesa.id)
    await db.product.update({ where: { id: mesa.id }, data: { lotControlled: true } })
    const tubo = await createTestMaterial('lote-prod-parcial-tubo')
    createdMaterialIds.push(tubo.id)
    await db.material.update({ where: { id: tubo.id }, data: { stockQty: 100000 } }) // material NÃO lotControlled

    const revision = await releasedRevision(mesa.id, user.id, 'A')
    await bomService.addLine(revision.id, { lineType: 'material', materialId: tubo.id, componentProductId: null, quantity: 1, unit: 'KG', scrapPct: 0, order: 0, notes: '' })
    await bomService.changeStatus(revision.id, 'released', user.id)

    const order = (await productionOrderService.create({ productId: mesa.id, quantity: 30, unit: 'UN' }, user.id)) as { id: string; number: string }
    createdOrderIds.push(order.id)

    await productionOrderService.produce(order.id, 10, user.id)
    await productionOrderService.produce(order.id, 20, user.id)

    const batches = await db.productBatch.findMany({ where: { productionOrderId: order.id }, orderBy: { batchNumber: 'asc' } })
    expect(batches).toHaveLength(2)
    expect(batches[0].batchNumber).toBe(`${order.number}-1`)
    expect(batches[0].quantityProduced).toBe(10)
    expect(batches[1].batchNumber).toBe(`${order.number}-2`)
    expect(batches[1].quantityProduced).toBe(20)

    // Material sem lotControlled: nenhum BatchConsumption gerado para ele (nada a apontar).
    const allConsumptions = await db.batchConsumption.findMany({ where: { productBatchId: { in: batches.map((b) => b.id) } } })
    expect(allConsumptions).toHaveLength(0)
  })

  it('5. Produto acabado SEM lotControlled: nenhum ProductBatch/BatchConsumption criado, mesmo com material lotControlled', async () => {
    const user = await createTestUser('lote-prod-sem-controle-produto')
    createdUserIds.push(user.id)
    const mesa = await createTestProduct('lote-prod-sem-controle-produto-mesa')
    createdProductIds.push(mesa.id) // lotControlled default false
    const tubo = await createTestMaterial('lote-prod-sem-controle-produto-tubo')
    createdMaterialIds.push(tubo.id)
    await db.material.update({ where: { id: tubo.id }, data: { lotControlled: true, stockQty: 1000 } })

    const batch = await db.materialBatch.create({
      data: { materialId: tubo.id, batchNumber: 'LOTE-X', quantityReceived: 1000, quantityAvailable: 1000 },
    })

    const revision = await releasedRevision(mesa.id, user.id, 'A')
    await bomService.addLine(revision.id, { lineType: 'material', materialId: tubo.id, componentProductId: null, quantity: 1, unit: 'KG', scrapPct: 0, order: 0, notes: '' })
    await bomService.changeStatus(revision.id, 'released', user.id)

    const order = (await productionOrderService.create({ productId: mesa.id, quantity: 5, unit: 'UN' }, user.id)) as { id: string }
    createdOrderIds.push(order.id)

    await productionOrderService.produce(order.id, 5, user.id)

    const productBatches = await db.productBatch.findMany({ where: { productionOrderId: order.id } })
    expect(productBatches).toHaveLength(0) // produto não lotControlled — nenhum lote de saída

    // O material ainda decrementa seu próprio lote corretamente (flag independente do produto).
    const batchAfter = await db.materialBatch.findUnique({ where: { id: batch.id } })
    expect(batchAfter?.quantityAvailable).toBe(995)

    // Sem ProductBatch, não há onde ancorar BatchConsumption — nenhum é criado.
    const consumptions = await db.batchConsumption.findMany({})
    const relatedToThisBatch = consumptions.filter((c) => c.materialBatchId === batch.id)
    expect(relatedToThisBatch).toHaveLength(0)
  })

  it('6. Compatibilidade total: nem material nem produto lotControlled — comportamento idêntico à Fase 9, sem nenhuma tabela de lote tocada', async () => {
    const user = await createTestUser('lote-prod-compat')
    createdUserIds.push(user.id)
    const mesa = await createTestProduct('lote-prod-compat-mesa')
    createdProductIds.push(mesa.id)
    const tubo = await createTestMaterial('lote-prod-compat-tubo')
    createdMaterialIds.push(tubo.id)
    await db.material.update({ where: { id: tubo.id }, data: { stockQty: 1000 } })

    const revision = await releasedRevision(mesa.id, user.id, 'A')
    await bomService.addLine(revision.id, { lineType: 'material', materialId: tubo.id, componentProductId: null, quantity: 3, unit: 'KG', scrapPct: 0, order: 0, notes: '' })
    await bomService.changeStatus(revision.id, 'released', user.id)

    const order = (await productionOrderService.create({ productId: mesa.id, quantity: 4, unit: 'UN' }, user.id)) as { id: string }
    createdOrderIds.push(order.id)

    await productionOrderService.produce(order.id, 4, user.id)

    const updatedOrder = await db.productionOrder.findUnique({ where: { id: order.id } })
    expect(updatedOrder?.status).toBe('completed')
    expect(updatedOrder?.quantityCompleted).toBe(4)

    const tuboAfter = await db.material.findUnique({ where: { id: tubo.id } })
    expect(tuboAfter?.stockQty).toBe(1000 - 12) // 3kg/un * 4un, consumo físico normal

    expect(await db.productBatch.findFirst({ where: { productionOrderId: order.id } })).toBeNull()
    expect(await db.materialBatch.findFirst({ where: { materialId: tubo.id } })).toBeNull()
  })
})
