import { describe, it, expect, afterAll } from 'vitest'
import { db } from '@/lib/db'
import { bomService } from '@/app/services/bom.service'
import { productionOrderService } from '@/app/services/production-order.service'
import { createTestUser, createTestProduct, createTestMaterial } from './helpers/fixtures'

/**
 * ADR-012, Subetapa 2: integração de `ReservationReconciliationService` em `produce()`/
 * `produceWithTx()` — a reserva multinível (Estrutura->Tubo, Reserva nunca cria linha para
 * Estrutura) passa a ser corretamente liberada quando a OP consome Estrutura como componente de
 * um nível só (Consumo físico, inalterado desde a Fase 9).
 */
describe('Reconciliação de Reserva integrada à Produção (ADR-012, Subetapa 2)', () => {
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

  function reservationOf(productionOrderId: string, materialId: string) {
    return db.materialReservation.findFirst({ where: { productionOrderId, itemType: 'material', materialId } })
  }

  /** Mesa (componente) -> Estrutura (subconjunto, revisão própria) -> Tubo (matéria-prima). */
  async function setupTwoLevelStructure(suffix: string) {
    const user = await createTestUser(suffix)
    createdUserIds.push(user.id)
    const estrutura = await createTestProduct(`${suffix}-estrutura`)
    createdProductIds.push(estrutura.id)
    const mesa = await createTestProduct(`${suffix}-mesa`)
    createdProductIds.push(mesa.id)
    const tubo = await createTestMaterial(`${suffix}-tubo`)
    createdMaterialIds.push(tubo.id)

    await db.material.update({ where: { id: tubo.id }, data: { stockQty: 100000 } })
    // Estoque de Estrutura já existente (simula que ela já foi produzida por sua própria OP) —
    // este teste foca na reconciliação da reserva de Tubo ao produzir Mesa, não na produção da
    // própria Estrutura.
    await db.product.update({ where: { id: estrutura.id }, data: { stockQty: 100000 } })

    const estruturaRevision = await releasedRevision(estrutura.id, user.id, 'A')
    await bomService.addLine(estruturaRevision.id, { lineType: 'material', materialId: tubo.id, componentProductId: null, quantity: 1, unit: 'KG', scrapPct: 0, order: 0, notes: '' })
    await bomService.changeStatus(estruturaRevision.id, 'released', user.id)

    const mesaRevision = await releasedRevision(mesa.id, user.id, 'A')
    await bomService.addLine(mesaRevision.id, { lineType: 'component', materialId: null, componentProductId: estrutura.id, quantity: 1, unit: 'UN', scrapPct: 0, order: 0, notes: '' })
    await bomService.changeStatus(mesaRevision.id, 'released', user.id)

    return { user, estrutura, mesa, tubo }
  }

  it('2. Produção TOTAL de estrutura de 2 níveis: reserva de Tubo chega a needed=0, status="consumed" (nunca reserva de Estrutura)', async () => {
    const { user, estrutura, mesa, tubo } = await setupTwoLevelStructure('reconcile-total')

    const order = (await productionOrderService.create({ productId: mesa.id, quantity: 50, unit: 'UN' }, user.id)) as { id: string }
    createdOrderIds.push(order.id)

    const reservationBefore = await reservationOf(order.id, tubo.id)
    expect(reservationBefore?.quantityNeeded).toBe(50)
    expect(reservationBefore?.quantityReserved).toBe(50) // estoque farto, reserva total

    const tuboStockBefore = (await db.material.findUnique({ where: { id: tubo.id } }))!.stockQty

    await productionOrderService.produce(order.id, 50, user.id) // total, em uma única rodada

    const reservationAfter = await reservationOf(order.id, tubo.id)
    expect(reservationAfter?.quantityNeeded).toBe(0)
    expect(reservationAfter?.quantityReserved).toBe(0)
    expect(reservationAfter?.status).toBe('consumed')

    // Nunca existe reserva de Estrutura — a Reserva sempre atravessou ela, ADR-006/012.
    const estruturaReservation = await db.materialReservation.findFirst({ where: { productionOrderId: order.id, itemType: 'product', productId: estrutura.id } })
    expect(estruturaReservation).toBeNull()

    // Consumo físico (um nível): Estrutura.stockQty cai. Reconciliação (multinível): só libera
    // reservedQty de Tubo, NUNCA mexe no stockQty físico de Tubo (que já foi consumido quando
    // Estrutura foi produzida, fora deste fluxo).
    const estruturaAfter = await db.product.findUnique({ where: { id: estrutura.id } })
    expect(estruturaAfter?.stockQty).toBe(100000 - 50)
    const tuboAfter = await db.material.findUnique({ where: { id: tubo.id } })
    expect(tuboAfter?.stockQty).toBe(tuboStockBefore) // inalterado
    expect(tuboAfter?.reservedQty).toBe(0)
  })

  it('3. Múltiplas produções parciais sucessivas: a soma das liberações bate com o total teórico', async () => {
    const { user, mesa, tubo } = await setupTwoLevelStructure('reconcile-multi-round')

    const order = (await productionOrderService.create({ productId: mesa.id, quantity: 60, unit: 'UN' }, user.id)) as { id: string }
    createdOrderIds.push(order.id)

    await productionOrderService.produce(order.id, 10, user.id)
    let reservation = await reservationOf(order.id, tubo.id)
    expect(reservation?.quantityNeeded).toBe(50)
    expect(reservation?.status).toBe('partial')

    await productionOrderService.produce(order.id, 20, user.id)
    reservation = await reservationOf(order.id, tubo.id)
    expect(reservation?.quantityNeeded).toBe(30)

    await productionOrderService.produce(order.id, 30, user.id) // completa 10+20+30=60
    reservation = await reservationOf(order.id, tubo.id)
    expect(reservation?.quantityNeeded).toBe(0)
    expect(reservation?.status).toBe('consumed')

    const updatedOrder = await db.productionOrder.findUnique({ where: { id: order.id } })
    expect(updatedOrder?.quantityCompleted).toBe(60)
    expect(updatedOrder?.status).toBe('completed')
  })

  it('4. Duas OPs diferentes reutilizando o mesmo subconjunto: produzir uma nunca mexe na reserva da outra', async () => {
    const user = await createTestUser('reconcile-two-orders')
    createdUserIds.push(user.id)
    const estrutura = await createTestProduct('reconcile-two-orders-estrutura')
    createdProductIds.push(estrutura.id)
    const mesa = await createTestProduct('reconcile-two-orders-mesa')
    createdProductIds.push(mesa.id)
    const cadeira = await createTestProduct('reconcile-two-orders-cadeira')
    createdProductIds.push(cadeira.id)
    const tubo = await createTestMaterial('reconcile-two-orders-tubo')
    createdMaterialIds.push(tubo.id)

    await db.material.update({ where: { id: tubo.id }, data: { stockQty: 100000 } })
    await db.product.update({ where: { id: estrutura.id }, data: { stockQty: 100000 } })

    const estruturaRevision = await releasedRevision(estrutura.id, user.id, 'A')
    await bomService.addLine(estruturaRevision.id, { lineType: 'material', materialId: tubo.id, componentProductId: null, quantity: 1, unit: 'KG', scrapPct: 0, order: 0, notes: '' })
    await bomService.changeStatus(estruturaRevision.id, 'released', user.id)

    const mesaRevision = await releasedRevision(mesa.id, user.id, 'A')
    await bomService.addLine(mesaRevision.id, { lineType: 'component', materialId: null, componentProductId: estrutura.id, quantity: 1, unit: 'UN', scrapPct: 0, order: 0, notes: '' })
    await bomService.changeStatus(mesaRevision.id, 'released', user.id)

    const cadeiraRevision = await releasedRevision(cadeira.id, user.id, 'A')
    await bomService.addLine(cadeiraRevision.id, { lineType: 'component', materialId: null, componentProductId: estrutura.id, quantity: 1, unit: 'UN', scrapPct: 0, order: 0, notes: '' })
    await bomService.changeStatus(cadeiraRevision.id, 'released', user.id)

    const orderMesa = (await productionOrderService.create({ productId: mesa.id, quantity: 40, unit: 'UN' }, user.id)) as { id: string }
    createdOrderIds.push(orderMesa.id)
    const orderCadeira = (await productionOrderService.create({ productId: cadeira.id, quantity: 25, unit: 'UN' }, user.id)) as { id: string }
    createdOrderIds.push(orderCadeira.id)

    await productionOrderService.produce(orderMesa.id, 40, user.id) // total

    const reservationMesa = await reservationOf(orderMesa.id, tubo.id)
    expect(reservationMesa?.status).toBe('consumed')

    const reservationCadeira = await reservationOf(orderCadeira.id, tubo.id)
    expect(reservationCadeira?.quantityNeeded).toBe(25) // intocada
    expect(reservationCadeira?.quantityReserved).toBe(25)
    expect(reservationCadeira?.status).toBe('reserved')
  })

  it('6. Prevenção de dupla liberação: retry com o mesmo clientRequestId reconcilia só uma vez', async () => {
    const { user, mesa, tubo } = await setupTwoLevelStructure('reconcile-idempotent')

    const order = (await productionOrderService.create({ productId: mesa.id, quantity: 50, unit: 'UN' }, user.id)) as { id: string }
    createdOrderIds.push(order.id)

    await productionOrderService.produce(order.id, 20, user.id, { clientRequestId: 'retry-1' })
    const reservationAfterFirst = await reservationOf(order.id, tubo.id)
    expect(reservationAfterFirst?.quantityNeeded).toBe(30)

    // Retry com o MESMO clientRequestId — não deve reconciliar de novo.
    await productionOrderService.produce(order.id, 20, user.id, { clientRequestId: 'retry-1' })
    const reservationAfterRetry = await reservationOf(order.id, tubo.id)
    expect(reservationAfterRetry?.quantityNeeded).toBe(30) // inalterado, não caiu para 10

    const updatedOrder = await db.productionOrder.findUnique({ where: { id: order.id } })
    expect(updatedOrder?.quantityCompleted).toBe(20) // só a primeira rodada contou
  })

  it('11. Item consumido direto E indiretamente (via subconjunto) na mesma rodada: agrega e libera uma única vez', async () => {
    const user = await createTestUser('reconcile-direct-and-indirect')
    createdUserIds.push(user.id)
    const estrutura = await createTestProduct('reconcile-direct-and-indirect-estrutura')
    createdProductIds.push(estrutura.id)
    const mesa = await createTestProduct('reconcile-direct-and-indirect-mesa')
    createdProductIds.push(mesa.id)
    const tubo = await createTestMaterial('reconcile-direct-and-indirect-tubo')
    createdMaterialIds.push(tubo.id)

    await db.material.update({ where: { id: tubo.id }, data: { stockQty: 100000 } })
    await db.product.update({ where: { id: estrutura.id }, data: { stockQty: 100000 } })

    const estruturaRevision = await releasedRevision(estrutura.id, user.id, 'A')
    await bomService.addLine(estruturaRevision.id, { lineType: 'material', materialId: tubo.id, componentProductId: null, quantity: 1, unit: 'KG', scrapPct: 0, order: 0, notes: '' })
    await bomService.changeStatus(estruturaRevision.id, 'released', user.id)

    // Mesa usa Estrutura (indireto -> Tubo) E Tubo diretamente, na MESMA revisão.
    const mesaRevision = await releasedRevision(mesa.id, user.id, 'A')
    await bomService.addLine(mesaRevision.id, { lineType: 'component', materialId: null, componentProductId: estrutura.id, quantity: 1, unit: 'UN', scrapPct: 0, order: 0, notes: '' })
    await bomService.addLine(mesaRevision.id, { lineType: 'material', materialId: tubo.id, componentProductId: null, quantity: 2, unit: 'KG', scrapPct: 0, order: 1, notes: '' })
    await bomService.changeStatus(mesaRevision.id, 'released', user.id)

    const order = (await productionOrderService.create({ productId: mesa.id, quantity: 10, unit: 'UN' }, user.id)) as { id: string }
    createdOrderIds.push(order.id)

    // Reserva, na criação: via Estrutura 1*10=10, direto 2*10=20 -> total 30, numa ÚNICA linha de reserva.
    const reservationBefore = await reservationOf(order.id, tubo.id)
    expect(reservationBefore?.quantityNeeded).toBe(30)

    await productionOrderService.produce(order.id, 10, user.id) // total

    const reservationAfter = await reservationOf(order.id, tubo.id)
    expect(reservationAfter?.quantityNeeded).toBe(0)
    expect(reservationAfter?.status).toBe('consumed')

    // Só uma linha de reserva de Tubo existiu para esta OP — nunca duas competindo pelo mesmo clamp.
    const allTuboReservations = await db.materialReservation.findMany({ where: { productionOrderId: order.id, itemType: 'material', materialId: tubo.id } })
    expect(allTuboReservations.length).toBe(1)
  })

  it('15. Produção parcial em duas OPs diferentes, concorrente: cada uma reconcilia só as próprias reservas', async () => {
    const { user, mesa: mesaA, tubo: tuboA } = await setupTwoLevelStructure('reconcile-concurrent-a')
    const { mesa: mesaB, tubo: tuboB } = await setupTwoLevelStructure('reconcile-concurrent-b')

    const orderA = (await productionOrderService.create({ productId: mesaA.id, quantity: 30, unit: 'UN' }, user.id)) as { id: string }
    createdOrderIds.push(orderA.id)
    const orderB = (await productionOrderService.create({ productId: mesaB.id, quantity: 45, unit: 'UN' }, user.id)) as { id: string }
    createdOrderIds.push(orderB.id)

    await Promise.all([
      productionOrderService.produce(orderA.id, 30, user.id),
      productionOrderService.produce(orderB.id, 45, user.id),
    ])

    const reservationA = await reservationOf(orderA.id, tuboA.id)
    expect(reservationA?.status).toBe('consumed')
    expect(reservationA?.quantityNeeded).toBe(0)

    const reservationB = await reservationOf(orderB.id, tuboB.id)
    expect(reservationB?.status).toBe('consumed')
    expect(reservationB?.quantityNeeded).toBe(0)

    const orderAAfter = await db.productionOrder.findUnique({ where: { id: orderA.id } })
    const orderBAfter = await db.productionOrder.findUnique({ where: { id: orderB.id } })
    expect(orderAAfter?.quantityCompleted).toBe(30)
    expect(orderBAfter?.quantityCompleted).toBe(45)
  })
})
