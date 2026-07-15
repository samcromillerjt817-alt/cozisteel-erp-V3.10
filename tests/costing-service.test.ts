import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { db } from '@/lib/db'
import { registerDomainEventHandlers } from '@/lib/register-domain-event-handlers'
import { bomService } from '@/app/services/bom.service'
import { productionOrderService } from '@/app/services/production-order.service'
import { costingService } from '@/app/services/costing.service'
import { createTestUser, createTestProduct, createTestMaterial } from './helpers/fixtures'

/**
 * Fase 12 (ADR-016, Subetapa 1/2) — `CostingService`, decisão pendente #3 resolvida (custo real por
 * lote). Reaproveita a árvore de `traceBackward()` (Fase 10, ADR-013) — soma `unitCost ×
 * quantityConsumed` de TODA a árvore, incluindo através de subconjuntos com lote próprio.
 */
describe('Financeiro — CostingService (Fase 12, Subetapa 1/2)', () => {
  const createdUserIds: string[] = []
  const createdProductIds: string[] = []
  const createdMaterialIds: string[] = []
  const createdRevisionIds: string[] = []
  const createdOrderIds: string[] = []

  beforeAll(() => {
    registerDomainEventHandlers()
  })

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

  it('1. produce() de um produto lotControlled já dispara o cálculo automaticamente via evento (sem chamada manual à CostingService)', async () => {
    const user = await createTestUser('costing-auto')
    createdUserIds.push(user.id)
    const mesa = await createTestProduct('costing-auto-mesa')
    createdProductIds.push(mesa.id)
    await db.product.update({ where: { id: mesa.id }, data: { lotControlled: true } })
    const tubo = await createTestMaterial('costing-auto-tubo')
    createdMaterialIds.push(tubo.id)
    await db.material.update({ where: { id: tubo.id }, data: { lotControlled: true, stockQty: 1000 } })

    // unitCost = 5 (simula um lote já recebido a R$5/kg — em produção viria de PurchaseOrderItem.unitPrice)
    const batch = await db.materialBatch.create({
      data: { materialId: tubo.id, batchNumber: 'LOTE-COSTING-1', quantityReceived: 1000, quantityAvailable: 1000, unitCost: 5 },
    })

    const revision = await releasedRevision(mesa.id, user.id, 'A')
    await bomService.addLine(revision.id, { lineType: 'material', materialId: tubo.id, componentProductId: null, quantity: 2, unit: 'KG', scrapPct: 0, order: 0, notes: '' })
    await bomService.changeStatus(revision.id, 'released', user.id)

    const order = (await productionOrderService.create({ productId: mesa.id, quantity: 10, unit: 'UN' }, user.id)) as { id: string }
    createdOrderIds.push(order.id)

    // Produção parcial (não completa a OP) — evento producao.parcial_realizada, não o de finalização.
    await productionOrderService.produce(order.id, 4, user.id)

    const productBatch = await db.productBatch.findFirst({ where: { productionOrderId: order.id } })
    expect(productBatch).not.toBeNull()
    // 4 un * 2kg/un = 8kg consumidos * R$5/kg = R$40
    expect(productBatch?.materialCost).toBe(40)

    void batch // referenciado só para o setup ficar explícito sobre a origem do unitCost
  })

  it('2. Rodada final (completa a OP): também dispara o cálculo, via producao.finalizada', async () => {
    const user = await createTestUser('costing-final')
    createdUserIds.push(user.id)
    const mesa = await createTestProduct('costing-final-mesa')
    createdProductIds.push(mesa.id)
    await db.product.update({ where: { id: mesa.id }, data: { lotControlled: true } })
    const tubo = await createTestMaterial('costing-final-tubo')
    createdMaterialIds.push(tubo.id)
    await db.material.update({ where: { id: tubo.id }, data: { lotControlled: true, stockQty: 1000 } })

    await db.materialBatch.create({
      data: { materialId: tubo.id, batchNumber: 'LOTE-COSTING-2', quantityReceived: 1000, quantityAvailable: 1000, unitCost: 3 },
    })

    const revision = await releasedRevision(mesa.id, user.id, 'A')
    await bomService.addLine(revision.id, { lineType: 'material', materialId: tubo.id, componentProductId: null, quantity: 1, unit: 'KG', scrapPct: 0, order: 0, notes: '' })
    await bomService.changeStatus(revision.id, 'released', user.id)

    const order = (await productionOrderService.create({ productId: mesa.id, quantity: 10, unit: 'UN' }, user.id)) as { id: string }
    createdOrderIds.push(order.id)

    // Produz o total de uma vez — completa a OP, dispara ordem_producao.finalizada.
    await productionOrderService.produce(order.id, 10, user.id)

    const productBatch = await db.productBatch.findFirst({ where: { productionOrderId: order.id } })
    expect(productBatch?.materialCost).toBe(30) // 10kg * R$3/kg
  })

  it('3. Produto sem lotControlled: nenhum ProductBatch existe, nada quebra (productBatchId null no evento)', async () => {
    const user = await createTestUser('costing-nolot')
    createdUserIds.push(user.id)
    const mesa = await createTestProduct('costing-nolot-mesa') // lotControlled default false
    createdProductIds.push(mesa.id)
    const tubo = await createTestMaterial('costing-nolot-tubo')
    createdMaterialIds.push(tubo.id)
    await db.material.update({ where: { id: tubo.id }, data: { stockQty: 1000 } })

    const revision = await releasedRevision(mesa.id, user.id, 'A')
    await bomService.addLine(revision.id, { lineType: 'material', materialId: tubo.id, componentProductId: null, quantity: 1, unit: 'KG', scrapPct: 0, order: 0, notes: '' })
    await bomService.changeStatus(revision.id, 'released', user.id)

    const order = (await productionOrderService.create({ productId: mesa.id, quantity: 5, unit: 'UN' }, user.id)) as { id: string }
    createdOrderIds.push(order.id)

    // Não deve lançar — o handler ignora productBatchId nulo.
    await expect(productionOrderService.produce(order.id, 5, user.id)).resolves.toBeDefined()
    expect(await db.productBatch.findFirst({ where: { productionOrderId: order.id } })).toBeNull()
  })

  it('4. Árvore com subconjunto: soma o custo de material através de 2 níveis (subconjunto + montagem final)', async () => {
    const user = await createTestUser('costing-subassembly')
    createdUserIds.push(user.id)
    const estrutura = await createTestProduct('costing-subassembly-estrutura')
    createdProductIds.push(estrutura.id)
    await db.product.update({ where: { id: estrutura.id }, data: { lotControlled: true } })
    const tuboEstrutura = await createTestMaterial('costing-subassembly-tubo')
    createdMaterialIds.push(tuboEstrutura.id)
    await db.material.update({ where: { id: tuboEstrutura.id }, data: { lotControlled: true, stockQty: 1000 } })
    await db.materialBatch.create({
      data: { materialId: tuboEstrutura.id, batchNumber: 'LOTE-SUB', quantityReceived: 1000, quantityAvailable: 1000, unitCost: 4 },
    })

    const mesa = await createTestProduct('costing-subassembly-mesa')
    createdProductIds.push(mesa.id)
    await db.product.update({ where: { id: mesa.id }, data: { lotControlled: true } })

    // Produz a Estrutura (subconjunto) de verdade, pelo fluxo real — gera seu próprio ProductBatch com materialCost.
    const estruturaRevision = await releasedRevision(estrutura.id, user.id, 'A')
    await bomService.addLine(estruturaRevision.id, { lineType: 'material', materialId: tuboEstrutura.id, componentProductId: null, quantity: 2, unit: 'KG', scrapPct: 0, order: 0, notes: '' })
    await bomService.changeStatus(estruturaRevision.id, 'released', user.id)
    const estruturaOrder = (await productionOrderService.create({ productId: estrutura.id, quantity: 1, unit: 'UN' }, user.id)) as { id: string }
    createdOrderIds.push(estruturaOrder.id)
    await productionOrderService.produce(estruturaOrder.id, 1, user.id) // 2kg * R$4 = R$8 de custo de material na Estrutura

    const estruturaBatch = await db.productBatch.findFirst({ where: { productionOrderId: estruturaOrder.id } })
    expect(estruturaBatch?.materialCost).toBe(8)

    // Mesa consome 1 Estrutura pronta (subconjunto) como componente — nenhum material direto.
    const mesaRevision = await releasedRevision(mesa.id, user.id, 'A')
    await bomService.addLine(mesaRevision.id, { lineType: 'component', materialId: null, componentProductId: estrutura.id, quantity: 1, unit: 'UN', scrapPct: 0, order: 0, notes: '' })
    await bomService.changeStatus(mesaRevision.id, 'released', user.id)
    const mesaOrder = (await productionOrderService.create({ productId: mesa.id, quantity: 1, unit: 'UN' }, user.id)) as { id: string }
    createdOrderIds.push(mesaOrder.id)
    await productionOrderService.produce(mesaOrder.id, 1, user.id)

    const mesaBatch = await db.productBatch.findFirst({ where: { productionOrderId: mesaOrder.id } })
    // O custo de material da Mesa deve enxergar através do subconjunto até a matéria-prima real —
    // mesmos R$8 que a Estrutura já custou, não zero (a Mesa não tem BomLine de material direto).
    expect(mesaBatch?.materialCost).toBe(8)
  })

  it('5. Chamada direta ao Service é idempotente (recalcular o mesmo lote produz o mesmo resultado)', async () => {
    const user = await createTestUser('costing-idempotent')
    createdUserIds.push(user.id)
    const mesa = await createTestProduct('costing-idempotent-mesa')
    createdProductIds.push(mesa.id)
    await db.product.update({ where: { id: mesa.id }, data: { lotControlled: true } })
    const tubo = await createTestMaterial('costing-idempotent-tubo')
    createdMaterialIds.push(tubo.id)
    await db.material.update({ where: { id: tubo.id }, data: { lotControlled: true, stockQty: 1000 } })
    await db.materialBatch.create({
      data: { materialId: tubo.id, batchNumber: 'LOTE-IDEMP', quantityReceived: 1000, quantityAvailable: 1000, unitCost: 2 },
    })

    const revision = await releasedRevision(mesa.id, user.id, 'A')
    await bomService.addLine(revision.id, { lineType: 'material', materialId: tubo.id, componentProductId: null, quantity: 1, unit: 'KG', scrapPct: 0, order: 0, notes: '' })
    await bomService.changeStatus(revision.id, 'released', user.id)

    const order = (await productionOrderService.create({ productId: mesa.id, quantity: 5, unit: 'UN' }, user.id)) as { id: string }
    createdOrderIds.push(order.id)
    await productionOrderService.produce(order.id, 5, user.id)

    const productBatch = await db.productBatch.findFirst({ where: { productionOrderId: order.id } })
    const recalculated = await costingService.calculateAndPersistMaterialCost(productBatch!.id)
    expect(recalculated).toBe(10) // 5kg * R$2
    expect(recalculated).toBe(productBatch!.materialCost)
  })
})
