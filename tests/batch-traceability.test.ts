import { describe, it, expect, afterAll } from 'vitest'
import { db } from '@/lib/db'
import { batchTraceabilityService } from '@/app/services/batch-traceability.service'
import { createTestUser, createTestProduct, createTestMaterial } from './helpers/fixtures'

/**
 * Fase 10, Subetapa 4 (ADR-013): consultas de rastreabilidade forward/backward, profundidade
 * arbitrária, com proteção contra ciclo (defesa em profundidade, mesmo espírito de
 * `bom-explosion.test.ts`) e ordenação determinística.
 */
describe('Rastreabilidade por Lote — Consultas (Fase 10, Subetapa 4)', () => {
  const createdUserIds: string[] = []
  const createdProductIds: string[] = []
  const createdMaterialIds: string[] = []
  const createdOrderIds: string[] = []
  const createdMaterialBatchIds: string[] = []
  const createdProductBatchIds: string[] = []

  afterAll(async () => {
    await db.batchConsumption.deleteMany({ where: { productBatchId: { in: createdProductBatchIds } } })
    await db.productBatch.deleteMany({ where: { id: { in: createdProductBatchIds } } })
    await db.materialBatch.deleteMany({ where: { id: { in: createdMaterialBatchIds } } })
    await db.productionOrder.deleteMany({ where: { id: { in: createdOrderIds } } })
    await db.material.deleteMany({ where: { id: { in: createdMaterialIds } } })
    await db.product.deleteMany({ where: { id: { in: createdProductIds } } })
    await db.statusHistory.deleteMany({ where: { userId: { in: createdUserIds } } })
    await db.user.deleteMany({ where: { id: { in: createdUserIds } } })
  })

  /** Mesa (ProductBatch) <- consome <- Estrutura (ProductBatch, subconjunto) <- consome <- Tubo (MaterialBatch). */
  async function setupTwoLevelChain(suffix: string) {
    const user = await createTestUser(suffix)
    createdUserIds.push(user.id)
    const tubo = await createTestMaterial(`${suffix}-tubo`)
    createdMaterialIds.push(tubo.id)
    const estrutura = await createTestProduct(`${suffix}-estrutura`)
    createdProductIds.push(estrutura.id)
    const mesa = await createTestProduct(`${suffix}-mesa`)
    createdProductIds.push(mesa.id)

    const estruturaOrder = (await db.productionOrder.create({
      data: { number: `OP-${suffix}-EST`, date: '01/01/2026', productId: estrutura.id, productName: estrutura.name, quantity: 10, unit: 'UN', userId: user.id },
    }))
    createdOrderIds.push(estruturaOrder.id)
    const mesaOrder = (await db.productionOrder.create({
      data: { number: `OP-${suffix}-MESA`, date: '01/02/2026', productId: mesa.id, productName: mesa.name, quantity: 5, unit: 'UN', userId: user.id },
    }))
    createdOrderIds.push(mesaOrder.id)

    const materialBatch = await db.materialBatch.create({
      data: { materialId: tubo.id, batchNumber: 'TUBO-LOTE-A', quantityReceived: 100, quantityAvailable: 100, receivedAt: new Date('2026-01-01') },
    })
    createdMaterialBatchIds.push(materialBatch.id)

    const estruturaBatch = await db.productBatch.create({
      data: { productId: estrutura.id, productionOrderId: estruturaOrder.id, batchNumber: `${estruturaOrder.number}-1`, quantityProduced: 10, producedAt: new Date('2026-01-02') },
    })
    createdProductBatchIds.push(estruturaBatch.id)
    await db.batchConsumption.create({
      data: { productBatchId: estruturaBatch.id, itemType: 'material', materialBatchId: materialBatch.id, quantityConsumed: 40 },
    })

    const mesaBatch = await db.productBatch.create({
      data: { productId: mesa.id, productionOrderId: mesaOrder.id, batchNumber: `${mesaOrder.number}-1`, quantityProduced: 5, producedAt: new Date('2026-01-03') },
    })
    createdProductBatchIds.push(mesaBatch.id)
    await db.batchConsumption.create({
      data: { productBatchId: mesaBatch.id, itemType: 'product', consumedProductBatchId: estruturaBatch.id, quantityConsumed: 5 },
    })

    return { user, tubo, estrutura, mesa, materialBatch, estruturaBatch, mesaBatch }
  }

  it('1. traceForward: MaterialBatch consumido diretamente por 1 ProductBatch (1 nível)', async () => {
    const user = await createTestUser('trace-fwd-simples')
    createdUserIds.push(user.id)
    const tubo = await createTestMaterial('trace-fwd-simples-tubo')
    createdMaterialIds.push(tubo.id)
    const mesa = await createTestProduct('trace-fwd-simples-mesa')
    createdProductIds.push(mesa.id)
    const order = await db.productionOrder.create({ data: { number: 'OP-TRACE-FWD-1', date: '01/01/2026', productId: mesa.id, productName: mesa.name, quantity: 5, unit: 'UN', userId: user.id } })
    createdOrderIds.push(order.id)

    const batch = await db.materialBatch.create({ data: { materialId: tubo.id, batchNumber: 'FWD-LOTE', quantityReceived: 50, quantityAvailable: 50 } })
    createdMaterialBatchIds.push(batch.id)
    const productBatch = await db.productBatch.create({ data: { productId: mesa.id, productionOrderId: order.id, batchNumber: `${order.number}-1`, quantityProduced: 5 } })
    createdProductBatchIds.push(productBatch.id)
    await db.batchConsumption.create({ data: { productBatchId: productBatch.id, itemType: 'material', materialBatchId: batch.id, quantityConsumed: 15 } })

    const result = await batchTraceabilityService.traceForward(batch.id)
    expect(result.origin.materialBatchId).toBe(batch.id)
    expect(result.origin.materialName).toBe(tubo.name)
    expect(result.consumedBy).toHaveLength(1)
    expect(result.consumedBy[0].productBatch.productBatchId).toBe(productBatch.id)
    expect(result.consumedBy[0].edge.depth).toBe(1)
    expect(result.consumedBy[0].edge.quantityConsumed).toBe(15)
  })

  it('2. traceForward: cadeia de 2 níveis (Tubo -> Estrutura -> Mesa) — Mesa aparece na profundidade 2', async () => {
    const { materialBatch, estruturaBatch, mesaBatch } = await setupTwoLevelChain('trace-fwd-2niv')

    const result = await batchTraceabilityService.traceForward(materialBatch.id)
    expect(result.consumedBy).toHaveLength(2)
    const byDepth1 = result.consumedBy.find((c) => c.edge.depth === 1)
    const byDepth2 = result.consumedBy.find((c) => c.edge.depth === 2)
    expect(byDepth1?.productBatch.productBatchId).toBe(estruturaBatch.id)
    expect(byDepth1?.edge.quantityConsumed).toBe(40)
    expect(byDepth2?.productBatch.productBatchId).toBe(mesaBatch.id)
    expect(byDepth2?.edge.quantityConsumed).toBe(5)
  })

  it('3. traceBackward: a partir de Mesa, encontra Estrutura como subconjunto intermediário E Tubo como origem de matéria-prima', async () => {
    const { tubo, estrutura, materialBatch, estruturaBatch, mesaBatch } = await setupTwoLevelChain('trace-bwd-2niv')

    const result = await batchTraceabilityService.traceBackward(mesaBatch.id)
    expect(result.origin.productBatchId).toBe(mesaBatch.id)

    expect(result.subassemblyBatches).toHaveLength(1)
    expect(result.subassemblyBatches[0].productBatch.productBatchId).toBe(estruturaBatch.id)
    expect(result.subassemblyBatches[0].productBatch.productId).toBe(estrutura.id)
    expect(result.subassemblyBatches[0].edge.depth).toBe(1)

    expect(result.materialOrigins).toHaveLength(1)
    expect(result.materialOrigins[0].materialBatch.materialBatchId).toBe(materialBatch.id)
    expect(result.materialOrigins[0].materialBatch.materialId).toBe(tubo.id)
    expect(result.materialOrigins[0].edge.depth).toBe(2) // Tubo só é alcançado através de Estrutura
  })

  it('4. Ordenação determinística: duas chamadas seguidas para os mesmos dados devolvem exatamente a mesma ordem', async () => {
    const { materialBatch } = await setupTwoLevelChain('trace-determinismo')

    const first = await batchTraceabilityService.traceForward(materialBatch.id)
    const second = await batchTraceabilityService.traceForward(materialBatch.id)

    expect(first.consumedBy.map((c) => c.productBatch.productBatchId)).toEqual(second.consumedBy.map((c) => c.productBatch.productBatchId))
  })

  it('5. Lote inexistente lança NotFoundException', async () => {
    await expect(batchTraceabilityService.traceForward('id-que-nao-existe')).rejects.toThrow(/não encontrado/)
    await expect(batchTraceabilityService.traceBackward('id-que-nao-existe')).rejects.toThrow(/não encontrado/)
  })

  it('6. Detecta ciclo (defesa em profundidade — dado inserido diretamente, cenário estruturalmente impossível pelo fluxo normal)', async () => {
    const user = await createTestUser('trace-ciclo')
    createdUserIds.push(user.id)
    const produtoX = await createTestProduct('trace-ciclo-x')
    createdProductIds.push(produtoX.id)
    const produtoY = await createTestProduct('trace-ciclo-y')
    createdProductIds.push(produtoY.id)

    const orderX = await db.productionOrder.create({ data: { number: 'OP-CICLO-X', date: '01/01/2026', productId: produtoX.id, productName: produtoX.name, quantity: 1, unit: 'UN', userId: user.id } })
    createdOrderIds.push(orderX.id)
    const orderY = await db.productionOrder.create({ data: { number: 'OP-CICLO-Y', date: '01/01/2026', productId: produtoY.id, productName: produtoY.name, quantity: 1, unit: 'UN', userId: user.id } })
    createdOrderIds.push(orderY.id)

    const batchX = await db.productBatch.create({ data: { productId: produtoX.id, productionOrderId: orderX.id, batchNumber: 'CICLO-X-1', quantityProduced: 1 } })
    createdProductBatchIds.push(batchX.id)
    const batchY = await db.productBatch.create({ data: { productId: produtoY.id, productionOrderId: orderY.id, batchNumber: 'CICLO-Y-1', quantityProduced: 1 } })
    createdProductBatchIds.push(batchY.id)

    // X consome Y, e Y consome X — ciclo direto, impossível de acontecer pelo fluxo real de produce()
    // (um ProductBatch só pode consumir lotes já existentes no momento em que é criado), construído
    // aqui só para testar a defesa da própria travessia.
    await db.batchConsumption.create({ data: { productBatchId: batchX.id, itemType: 'product', consumedProductBatchId: batchY.id, quantityConsumed: 1 } })
    await db.batchConsumption.create({ data: { productBatchId: batchY.id, itemType: 'product', consumedProductBatchId: batchX.id, quantityConsumed: 1 } })

    await expect(batchTraceabilityService.traceBackward(batchX.id)).rejects.toThrow(/Ciclo detectado/)
  })

  it('7. Cadeia profunda de 4 níveis (Produto Final -> Subconjunto A -> Subconjunto B -> Subconjunto C -> Matéria-prima): forward e backward corretos em toda a profundidade', async () => {
    const user = await createTestUser('trace-cadeia-profunda')
    createdUserIds.push(user.id)

    const materiaPrima = await createTestMaterial('trace-cadeia-profunda-mp')
    createdMaterialIds.push(materiaPrima.id)
    const subC = await createTestProduct('trace-cadeia-profunda-c')
    createdProductIds.push(subC.id)
    const subB = await createTestProduct('trace-cadeia-profunda-b')
    createdProductIds.push(subB.id)
    const subA = await createTestProduct('trace-cadeia-profunda-a')
    createdProductIds.push(subA.id)
    const produtoFinal = await createTestProduct('trace-cadeia-profunda-final')
    createdProductIds.push(produtoFinal.id)

    async function criarOrdem(product: { id: string; name: string }, numero: string) {
      const order = await db.productionOrder.create({
        data: { number: numero, date: '01/01/2026', productId: product.id, productName: product.name, quantity: 1, unit: 'UN', userId: user.id },
      })
      createdOrderIds.push(order.id)
      return order
    }

    const orderC = await criarOrdem(subC, 'OP-PROFUNDA-C')
    const orderB = await criarOrdem(subB, 'OP-PROFUNDA-B')
    const orderA = await criarOrdem(subA, 'OP-PROFUNDA-A')
    const orderFinal = await criarOrdem(produtoFinal, 'OP-PROFUNDA-FINAL')

    // Nível 4 (folha): lote de matéria-prima.
    const materialBatch = await db.materialBatch.create({
      data: { materialId: materiaPrima.id, batchNumber: 'MP-PROFUNDA-LOTE', quantityReceived: 1000, quantityAvailable: 1000, receivedAt: new Date('2026-01-01') },
    })
    createdMaterialBatchIds.push(materialBatch.id)

    // Subconjunto C consome a matéria-prima diretamente.
    const batchC = await db.productBatch.create({
      data: { productId: subC.id, productionOrderId: orderC.id, batchNumber: `${orderC.number}-1`, quantityProduced: 10, producedAt: new Date('2026-01-02') },
    })
    createdProductBatchIds.push(batchC.id)
    await db.batchConsumption.create({ data: { productBatchId: batchC.id, itemType: 'material', materialBatchId: materialBatch.id, quantityConsumed: 50 } })

    // Subconjunto B consome Subconjunto C.
    const batchB = await db.productBatch.create({
      data: { productId: subB.id, productionOrderId: orderB.id, batchNumber: `${orderB.number}-1`, quantityProduced: 10, producedAt: new Date('2026-01-03') },
    })
    createdProductBatchIds.push(batchB.id)
    await db.batchConsumption.create({ data: { productBatchId: batchB.id, itemType: 'product', consumedProductBatchId: batchC.id, quantityConsumed: 10 } })

    // Subconjunto A consome Subconjunto B.
    const batchA = await db.productBatch.create({
      data: { productId: subA.id, productionOrderId: orderA.id, batchNumber: `${orderA.number}-1`, quantityProduced: 10, producedAt: new Date('2026-01-04') },
    })
    createdProductBatchIds.push(batchA.id)
    await db.batchConsumption.create({ data: { productBatchId: batchA.id, itemType: 'product', consumedProductBatchId: batchB.id, quantityConsumed: 10 } })

    // Produto Final consome Subconjunto A.
    const batchFinal = await db.productBatch.create({
      data: { productId: produtoFinal.id, productionOrderId: orderFinal.id, batchNumber: `${orderFinal.number}-1`, quantityProduced: 10, producedAt: new Date('2026-01-05') },
    })
    createdProductBatchIds.push(batchFinal.id)
    await db.batchConsumption.create({ data: { productBatchId: batchFinal.id, itemType: 'product', consumedProductBatchId: batchA.id, quantityConsumed: 10 } })

    // ── Forward: a partir do lote de matéria-prima, os 4 ProductBatch aparecem nas profundidades 1-4. ──
    const forward = await batchTraceabilityService.traceForward(materialBatch.id)
    expect(forward.consumedBy).toHaveLength(4)
    const forwardByDepth = new Map(forward.consumedBy.map((c) => [c.edge.depth, c.productBatch.productBatchId]))
    expect(forwardByDepth.get(1)).toBe(batchC.id)
    expect(forwardByDepth.get(2)).toBe(batchB.id)
    expect(forwardByDepth.get(3)).toBe(batchA.id)
    expect(forwardByDepth.get(4)).toBe(batchFinal.id)

    // ── Backward: a partir do Produto Final, os 3 subconjuntos aparecem como intermediários (profundidades 1-3)
    // e a matéria-prima aparece como origem na profundidade 4 — só alcançável atravessando os 3 subconjuntos. ──
    const backward = await batchTraceabilityService.traceBackward(batchFinal.id)
    expect(backward.subassemblyBatches).toHaveLength(3)
    const backwardByDepth = new Map(backward.subassemblyBatches.map((s) => [s.edge.depth, s.productBatch.productBatchId]))
    expect(backwardByDepth.get(1)).toBe(batchA.id)
    expect(backwardByDepth.get(2)).toBe(batchB.id)
    expect(backwardByDepth.get(3)).toBe(batchC.id)

    expect(backward.materialOrigins).toHaveLength(1)
    expect(backward.materialOrigins[0].materialBatch.materialBatchId).toBe(materialBatch.id)
    expect(backward.materialOrigins[0].edge.depth).toBe(4)
    expect(backward.materialOrigins[0].edge.quantityConsumed).toBe(50)
  })
})
