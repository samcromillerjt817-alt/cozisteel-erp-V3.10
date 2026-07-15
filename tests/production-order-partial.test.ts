import { describe, it, expect, afterAll } from 'vitest'
import { db } from '@/lib/db'
import { bomService } from '@/app/services/bom.service'
import { productionOrderService } from '@/app/services/production-order.service'
import { createTestUser, createTestProduct, createTestMaterial } from './helpers/fixtures'

/**
 * Fase 9 (ADR-011): produção parcial. `produce()` é o único ponto de entrada — `update()` (conclusão
 * direta) delega para ele internamente, nunca há duas implementações. Consumo proporcional via
 * `BomLine` da revisão congelada (nunca `ProductMaterial` quando `bomRevisionId` existe), liberação
 * proporcional de `reservedQty`, `StockMovement` `IN`/`OUT`/`RELEASE` por rodada.
 */
describe('Ordem de Produção — Produção Parcial (Fase 9, Subetapa 1)', () => {
  const createdUserIds: string[] = []
  const createdProductIds: string[] = []
  const createdMaterialIds: string[] = []
  const createdRevisionIds: string[] = []
  const createdOrderIds: string[] = []

  afterAll(async () => {
    await db.productionOrderExecution.deleteMany({ where: { productionOrderId: { in: createdOrderIds } } })
    await db.materialReservation.deleteMany({ where: { productionOrderId: { in: createdOrderIds } } })
    await db.stockMovement.deleteMany({ where: { referenceId: { in: createdOrderIds } } })
    await db.productionOrder.deleteMany({ where: { id: { in: createdOrderIds } } })
    await db.bomRevision.deleteMany({ where: { id: { in: createdRevisionIds } } })
    await db.productMaterial.deleteMany({ where: { materialId: { in: createdMaterialIds } } })
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

  /** Produto com 1 linha de material (quantidade 1, sem perda) numa revisão liberada + OP de quantity=100, estoque farto. */
  async function setupSimpleOrder(suffix: string, quantity: number, materialStock = 100000) {
    const user = await createTestUser(suffix)
    createdUserIds.push(user.id)
    const product = await createTestProduct(suffix)
    createdProductIds.push(product.id)
    const material = await createTestMaterial(suffix)
    createdMaterialIds.push(material.id)
    await db.material.update({ where: { id: material.id }, data: { stockQty: materialStock } })

    const revision = await releasedRevision(product.id, user.id, 'A')
    await bomService.addLine(revision.id, {
      lineType: 'material', materialId: material.id, componentProductId: null,
      quantity: 1, unit: 'KG', scrapPct: 0, order: 0, notes: '',
    })
    await bomService.changeStatus(revision.id, 'released', user.id)

    const order = (await productionOrderService.create({ productId: product.id, quantity, unit: 'UN' }, user.id)) as { id: string; number: string }
    createdOrderIds.push(order.id)

    return { user, product, material, revision, order }
  }

  it('1. 10 produções de 10% chegam exatamente a 100%, completando a OP automaticamente', async () => {
    const { user, material, order } = await setupSimpleOrder('partial-10x10', 100)

    let last
    for (let i = 0; i < 10; i++) {
      last = (await productionOrderService.produce(order.id, 10, user.id)) as { status: string; quantityCompleted: number }
    }

    expect(last?.quantityCompleted).toBe(100)
    expect(last?.status).toBe('completed')

    const material2 = await db.material.findUnique({ where: { id: material.id } })
    // 100000 inicial - 100 consumido = 99900
    expect(material2?.stockQty).toBe(99900)

    const outMovements = await db.stockMovement.findMany({ where: { referenceId: order.id, type: 'OUT' } })
    expect(outMovements).toHaveLength(10)
  })

  it('2. Consumo proporcional correto por material a cada rodada (2 materiais, quantidades diferentes)', async () => {
    const user = await createTestUser('partial-proportional')
    createdUserIds.push(user.id)
    const product = await createTestProduct('partial-proportional')
    createdProductIds.push(product.id)
    const materialA = await createTestMaterial('partial-proportional-a')
    createdMaterialIds.push(materialA.id)
    const materialB = await createTestMaterial('partial-proportional-b')
    createdMaterialIds.push(materialB.id)
    await db.material.update({ where: { id: materialA.id }, data: { stockQty: 100000 } })
    await db.material.update({ where: { id: materialB.id }, data: { stockQty: 100000 } })

    const revision = await releasedRevision(product.id, user.id, 'A')
    await bomService.addLine(revision.id, { lineType: 'material', materialId: materialA.id, componentProductId: null, quantity: 2, unit: 'KG', scrapPct: 0, order: 0, notes: '' })
    await bomService.addLine(revision.id, { lineType: 'material', materialId: materialB.id, componentProductId: null, quantity: 5, unit: 'KG', scrapPct: 0, order: 1, notes: '' })
    await bomService.changeStatus(revision.id, 'released', user.id)

    const order = (await productionOrderService.create({ productId: product.id, quantity: 100, unit: 'UN' }, user.id)) as { id: string }
    createdOrderIds.push(order.id)

    await productionOrderService.produce(order.id, 30, user.id) // 30% desta OP de 100

    const movementsA = await db.stockMovement.findMany({ where: { referenceId: order.id, type: 'OUT', materialId: materialA.id } })
    const movementsB = await db.stockMovement.findMany({ where: { referenceId: order.id, type: 'OUT', materialId: materialB.id } })

    expect(movementsA).toHaveLength(1)
    expect(movementsA[0].quantity).toBeCloseTo(2 * 30) // quantity da receita(2) * quantidade desta rodada(30) = 60
    expect(movementsB).toHaveLength(1)
    expect(movementsB[0].quantity).toBeCloseTo(5 * 30) // = 150
  })

  it('3. Conclusão final bate exatamente com a quantidade original (33+33+34=100)', async () => {
    const { user, order } = await setupSimpleOrder('partial-uneven', 100)

    await productionOrderService.produce(order.id, 33, user.id)
    await productionOrderService.produce(order.id, 33, user.id)
    const last = (await productionOrderService.produce(order.id, 34, user.id)) as { status: string; quantityCompleted: number }

    expect(last.quantityCompleted).toBe(100)
    expect(last.status).toBe('completed')
  })

  it('4. Tentativa de produzir acima do saldo restante é rejeitada', async () => {
    const { user, order } = await setupSimpleOrder('partial-exceed', 100)
    await productionOrderService.produce(order.id, 90, user.id)
    await expect(productionOrderService.produce(order.id, 20, user.id)).rejects.toThrow(/excede o saldo restante/)
  })

  it('5. Produção após cancelamento é rejeitada', async () => {
    const { user, order } = await setupSimpleOrder('partial-after-cancel', 100)
    await productionOrderService.update(order.id, { status: 'cancelled' }, user.id)
    await expect(productionOrderService.produce(order.id, 10, user.id)).rejects.toThrow(/Não é possível registrar produção/)
  })

  it('6. Produção após conclusão é rejeitada', async () => {
    const { user, order } = await setupSimpleOrder('partial-after-complete', 100)
    await productionOrderService.produce(order.id, 100, user.id)
    await expect(productionOrderService.produce(order.id, 10, user.id)).rejects.toThrow(/Não é possível registrar produção/)
  })

  it('7. Cancelamento após produção parcial: produzido não é revertido, só a reserva do restante é liberada', async () => {
    const { user, material, order } = await setupSimpleOrder('partial-cancel-mid', 100, 50)
    // estoque = 50, precisa de 100 -> reserva parcial (50 reservados, 50 em falta)

    await productionOrderService.produce(order.id, 20, user.id) // consome 20, libera 20 de reservedQty

    const materialAfterProduce = await db.material.findUnique({ where: { id: material.id } })
    expect(materialAfterProduce?.reservedQty).toBe(30) // 50 reservado - 20 consumido/liberado
    expect(materialAfterProduce?.stockQty).toBe(30) // 50 - 20 consumido

    await productionOrderService.update(order.id, { status: 'cancelled' }, user.id)

    const materialAfterCancel = await db.material.findUnique({ where: { id: material.id } })
    expect(materialAfterCancel?.reservedQty).toBe(0) // resto da reserva liberada no cancelamento
    expect(materialAfterCancel?.stockQty).toBe(30) // produção já feita não é revertida

    const order2 = await db.productionOrder.findUnique({ where: { id: order.id } })
    expect(order2?.quantityCompleted).toBe(20) // preservado, não é revertido
    expect(order2?.status).toBe('cancelled')
  })

  it('8. Reserva chega a exatamente zero quando a última rodada fecha a OP', async () => {
    const { user, material, order } = await setupSimpleOrder('partial-reservation-zero', 100)

    await productionOrderService.produce(order.id, 60, user.id)
    await productionOrderService.produce(order.id, 40, user.id)

    const materialFinal = await db.material.findUnique({ where: { id: material.id } })
    expect(materialFinal?.reservedQty).toBe(0)

    const reservation = await db.materialReservation.findFirst({ where: { productionOrderId: order.id } })
    expect(reservation?.status).toBe('consumed')
    expect(reservation?.quantityNeeded).toBe(0)
    expect(reservation?.quantityReserved).toBe(0)
    expect(reservation?.quantityShortfall).toBe(0)
  })

  it('10. BOM multinível: produzir o produto pai consome só o subconjunto direto, nunca a matéria-prima dele', async () => {
    const user = await createTestUser('partial-multilevel')
    createdUserIds.push(user.id)
    const mesa = await createTestProduct('partial-multilevel-mesa')
    createdProductIds.push(mesa.id)
    const estrutura = await createTestProduct('partial-multilevel-estrutura')
    createdProductIds.push(estrutura.id)
    const tubo = await createTestMaterial('partial-multilevel-tubo')
    createdMaterialIds.push(tubo.id)
    await db.product.update({ where: { id: estrutura.id }, data: { stockQty: 1000 } })

    const estruturaRevision = await releasedRevision(estrutura.id, user.id, 'A')
    await bomService.addLine(estruturaRevision.id, { lineType: 'material', materialId: tubo.id, componentProductId: null, quantity: 4, unit: 'KG', scrapPct: 0, order: 0, notes: '' })
    await bomService.changeStatus(estruturaRevision.id, 'released', user.id)

    const mesaRevision = await releasedRevision(mesa.id, user.id, 'A')
    await bomService.addLine(mesaRevision.id, { lineType: 'component', materialId: null, componentProductId: estrutura.id, quantity: 1, unit: 'UN', scrapPct: 0, order: 0, notes: '' })
    await bomService.changeStatus(mesaRevision.id, 'released', user.id)

    const order = (await productionOrderService.create({ productId: mesa.id, quantity: 10, unit: 'UN' }, user.id)) as { id: string }
    createdOrderIds.push(order.id)

    await productionOrderService.produce(order.id, 10, user.id)

    const estruturaConsumption = await db.stockMovement.findMany({ where: { referenceId: order.id, type: 'OUT', productId: estrutura.id } })
    expect(estruturaConsumption).toHaveLength(1)
    expect(estruturaConsumption[0].quantity).toBe(10) // 1 por Mesa * 10 produzidas

    const tuboConsumption = await db.stockMovement.findMany({ where: { referenceId: order.id, type: 'OUT', materialId: tubo.id } })
    expect(tuboConsumption).toHaveLength(0) // nunca explode nas matérias-primas do subconjunto

    const estruturaStock = await db.product.findUnique({ where: { id: estrutura.id } })
    expect(estruturaStock?.stockQty).toBe(990) // 1000 - 10 unidades consumidas
  })

  it('11. Retrocompatibilidade total: update() -> completed direto, sem nenhuma chamada a produce() antes', async () => {
    const { user, material, order } = await setupSimpleOrder('partial-backcompat', 50)

    const result = (await productionOrderService.update(order.id, { status: 'completed' }, user.id)) as {
      status: string
      quantityCompleted: number
      stockConsumed: boolean
    }

    expect(result.status).toBe('completed')
    expect(result.quantityCompleted).toBe(50)
    expect(result.stockConsumed).toBe(true)

    const materialFinal = await db.material.findUnique({ where: { id: material.id } })
    expect(materialFinal?.stockQty).toBe(100000 - 50)
    expect(materialFinal?.reservedQty).toBe(0)
  })

  it('12. OP sem bomRevisionId consome via ProductMaterial herdado (produto sem engenharia formal)', async () => {
    const user = await createTestUser('partial-legacy')
    createdUserIds.push(user.id)
    const product = await createTestProduct('partial-legacy')
    createdProductIds.push(product.id)
    const material = await createTestMaterial('partial-legacy')
    createdMaterialIds.push(material.id)
    await db.material.update({ where: { id: material.id }, data: { stockQty: 1000 } })
    await db.productMaterial.create({ data: { productId: product.id, materialId: material.id, quantity: 3, unit: 'KG', scrapPct: 0 } })

    const order = (await productionOrderService.create({ productId: product.id, quantity: 10, unit: 'UN' }, user.id)) as { id: string }
    createdOrderIds.push(order.id)
    expect((await db.productionOrder.findUnique({ where: { id: order.id } }))?.bomRevisionId).toBeNull()

    await productionOrderService.produce(order.id, 10, user.id)

    const materialFinal = await db.material.findUnique({ where: { id: material.id } })
    expect(materialFinal?.stockQty).toBe(1000 - 3 * 10)
  })

  it('13. Idempotência: duas chamadas com o mesmo clientRequestId processam só uma vez', async () => {
    const { user, material, order } = await setupSimpleOrder('partial-idempotent', 100)
    const clientRequestId = 'retry-abc-123'

    await productionOrderService.produce(order.id, 30, user.id, { clientRequestId })
    await productionOrderService.produce(order.id, 30, user.id, { clientRequestId }) // repetição — deve ser no-op

    const persisted = await db.productionOrder.findUnique({ where: { id: order.id } })
    expect(persisted?.quantityCompleted).toBe(30) // não 60

    const movements = await db.stockMovement.findMany({ where: { referenceId: order.id, type: 'OUT' } })
    expect(movements).toHaveLength(1) // não duplicado

    const executions = await db.productionOrderExecution.findMany({ where: { productionOrderId: order.id } })
    expect(executions).toHaveLength(1)

    const materialAfter = await db.material.findUnique({ where: { id: material.id } })
    expect(materialAfter?.stockQty).toBe(100000 - 30) // não 100000 - 60
  })

  it('14. Nenhuma quantidade negativa em quantityCompleted/reservedQty/shortfall, mesmo no limite exato da reserva', async () => {
    const { user, material, order } = await setupSimpleOrder('partial-no-negative', 100, 40)
    // estoque = 40, precisa de 100 -> reserva parcial (40 reservado, 60 em falta)

    await productionOrderService.produce(order.id, 40, user.id) // consome exatamente o que foi reservado

    const materialMid = await db.material.findUnique({ where: { id: material.id } })
    expect(materialMid?.reservedQty).toBe(0)
    expect(materialMid!.reservedQty).toBeGreaterThanOrEqual(0)

    const reservationMid = await db.materialReservation.findFirst({ where: { productionOrderId: order.id } })
    expect(reservationMid!.quantityShortfall).toBeGreaterThanOrEqual(0)
    expect(reservationMid!.quantityReserved).toBeGreaterThanOrEqual(0)
    expect(reservationMid!.quantityReserved).toBe(0) // nada sobrando pra liberar de novo

    // Simula chegada de estoque (ex: compra recebida) antes de produzir o restante, evitando estoque
    // físico negativo — o ponto deste teste é a aritmética de reservedQty/quantityCompleted, não a
    // regra (fora de escopo) de permitir ou não estoque físico negativo.
    await db.material.update({ where: { id: material.id }, data: { stockQty: { increment: 60 } } })

    // Produzir o restante (60) sem ter reserva nenhuma sobrando — não pode gerar reservedQty negativo
    await productionOrderService.produce(order.id, 60, user.id)
    const materialFinal = await db.material.findUnique({ where: { id: material.id } })
    expect(materialFinal!.reservedQty).toBeGreaterThanOrEqual(0)
    expect(materialFinal?.reservedQty).toBe(0)
    expect(materialFinal?.stockQty).toBe(0) // (40-40) + 60 - 60

    const reservationFinal = await db.materialReservation.findFirst({ where: { productionOrderId: order.id } })
    expect(reservationFinal?.status).toBe('consumed')
    expect(reservationFinal!.quantityNeeded).toBeGreaterThanOrEqual(0)
    expect(reservationFinal?.quantityNeeded).toBe(0)

    const orderFinal = await db.productionOrder.findUnique({ where: { id: order.id } })
    expect(orderFinal?.quantityCompleted).toBe(100)
    expect(orderFinal!.quantityCompleted).toBeGreaterThanOrEqual(0)
    expect(orderFinal?.status).toBe('completed')
  })
})
