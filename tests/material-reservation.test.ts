import { describe, it, expect, afterAll } from 'vitest'
import { db } from '@/lib/db'
import { bomService } from '@/app/services/bom.service'
import { productionOrderService } from '@/app/services/production-order.service'
import { materialReservationService } from '@/app/services/material-reservation.service'
import { createTestUser, createTestProduct, createTestMaterial } from './helpers/fixtures'

/**
 * Fase 5, Subetapa 3 (ADR-006): Serviço de Reserva de Material. Testa a integração real — via
 * `productionOrderService.create()`/`.update()`, não chamando `materialReservationService`
 * diretamente — para provar que a reserva acontece automaticamente na criação da OP e o
 * cancelamento libera de verdade, exatamente como o fluxo real do usuário passaria por isso.
 */
describe('Reserva de Material — Serviço (Subetapa 3)', () => {
  const createdUserIds: string[] = []
  const createdProductIds: string[] = []
  const createdMaterialIds: string[] = []
  const createdRevisionIds: string[] = []
  const createdOrderIds: string[] = []

  afterAll(async () => {
    await db.materialReservation.deleteMany({ where: { productionOrderId: { in: createdOrderIds } } })
    await db.stockMovement.deleteMany({ where: { referenceId: { in: createdOrderIds } } })
    await db.productionOrder.deleteMany({ where: { id: { in: createdOrderIds } } })
    await db.bomRevision.deleteMany({ where: { id: { in: createdRevisionIds } } })
    await db.material.deleteMany({ where: { id: { in: createdMaterialIds } } })
    await db.product.deleteMany({ where: { id: { in: createdProductIds } } })
    await db.statusHistory.deleteMany({ where: { userId: { in: createdUserIds } } })
    await db.user.deleteMany({ where: { id: { in: createdUserIds } } })
  })

  /** Produto com 1 linha de material (quantidade 10, sem perda) numa revisão liberada. */
  async function setupProductWithMaterial(suffix: string, materialStockQty: number) {
    const user = await createTestUser(`reservation-${suffix}`)
    createdUserIds.push(user.id)
    const product = await createTestProduct(`reservation-${suffix}`)
    createdProductIds.push(product.id)
    const material = await createTestMaterial(`reservation-${suffix}`)
    createdMaterialIds.push(material.id)
    await db.material.update({ where: { id: material.id }, data: { stockQty: materialStockQty } })

    const revision = (await bomService.createRevision(product.id, { revisionCode: 'A', notes: '' }, user.id)) as { id: string }
    createdRevisionIds.push(revision.id)
    await bomService.addLine(revision.id, {
      lineType: 'material', materialId: material.id, componentProductId: null,
      quantity: 10, unit: 'KG', scrapPct: 0, order: 0, notes: '',
    })
    await bomService.changeStatus(revision.id, 'released', user.id)

    return { user, product, material, revision }
  }

  it('reserva completa: saldo suficiente cobre 100% da necessidade', async () => {
    const { user, product, material } = await setupProductWithMaterial('complete', 100)

    const order = (await productionOrderService.create({ productId: product.id, quantity: 2, unit: 'UN' }, user.id)) as { id: string }
    createdOrderIds.push(order.id)

    // necessidade: 10 * 2 = 20
    const reservations = await materialReservationService.listReservations(order.id)
    expect(reservations).toHaveLength(1)
    const reservation = reservations[0] as { quantityNeeded: number; quantityReserved: number; quantityShortfall: number; status: string }
    expect(reservation.quantityNeeded).toBe(20)
    expect(reservation.quantityReserved).toBe(20)
    expect(reservation.quantityShortfall).toBe(0)
    expect(reservation.status).toBe('reserved')

    const updatedMaterial = await db.material.findUnique({ where: { id: material.id } })
    expect(updatedMaterial?.reservedQty).toBe(20)

    const movements = await db.stockMovement.findMany({ where: { referenceId: order.id, type: 'RESERVE' } })
    expect(movements).toHaveLength(1)
    expect(movements[0].quantity).toBe(20)
  })

  it('reserva parcial: saldo insuficiente cobre só uma parte, sem bloquear a OP', async () => {
    const { user, product, material } = await setupProductWithMaterial('partial', 12)

    const order = (await productionOrderService.create({ productId: product.id, quantity: 2, unit: 'UN' }, user.id)) as { id: string }
    createdOrderIds.push(order.id)

    // necessidade: 20, saldo: 12 → reserva 12, falta 8
    const reservations = await materialReservationService.listReservations(order.id)
    const reservation = reservations[0] as { quantityNeeded: number; quantityReserved: number; quantityShortfall: number; status: string }
    expect(reservation.quantityNeeded).toBe(20)
    expect(reservation.quantityReserved).toBe(12)
    expect(reservation.quantityShortfall).toBe(8)
    expect(reservation.status).toBe('partial')

    const updatedMaterial = await db.material.findUnique({ where: { id: material.id } })
    expect(updatedMaterial?.reservedQty).toBe(12)

    // a OP foi criada normalmente, sem erro — falta de material não bloqueia
    const persistedOrder = await db.productionOrder.findUnique({ where: { id: order.id } })
    expect(persistedOrder?.status).toBe('planned')
  })

  it('ausência total de estoque: reserva zero, shortfall = necessidade inteira, nenhum movimento RESERVE', async () => {
    const { user, product, material } = await setupProductWithMaterial('empty', 0)

    const order = (await productionOrderService.create({ productId: product.id, quantity: 1, unit: 'UN' }, user.id)) as { id: string }
    createdOrderIds.push(order.id)

    const reservations = await materialReservationService.listReservations(order.id)
    const reservation = reservations[0] as { quantityNeeded: number; quantityReserved: number; quantityShortfall: number; status: string }
    expect(reservation.quantityReserved).toBe(0)
    expect(reservation.quantityShortfall).toBe(10)
    expect(reservation.status).toBe('partial')

    const updatedMaterial = await db.material.findUnique({ where: { id: material.id } })
    expect(updatedMaterial?.reservedQty).toBe(0)

    const movements = await db.stockMovement.findMany({ where: { referenceId: order.id, type: 'RESERVE' } })
    expect(movements).toHaveLength(0)
  })

  it('recálculo: chegada de saldo novo permite reservar o delta que faltava, sem duplicar o que já estava reservado', async () => {
    const { user, product, material } = await setupProductWithMaterial('recalc', 12)

    const order = (await productionOrderService.create({ productId: product.id, quantity: 2, unit: 'UN' }, user.id)) as { id: string }
    createdOrderIds.push(order.id)

    // Simula chegada de estoque (ex: recebimento de compra) — sobe de 12 pra 30 disponíveis fisicamente
    await db.material.update({ where: { id: material.id }, data: { stockQty: 30 } })

    // Retentativa de reserva ("reabertura", ADR-006) — mesma OP, sem mudar de status
    await materialReservationService.reserveForProductionOrder(order.id, user.id)

    const reservations = await materialReservationService.listReservations(order.id)
    const reservation = reservations[0] as { quantityNeeded: number; quantityReserved: number; quantityShortfall: number; status: string }
    expect(reservation.quantityReserved).toBe(20) // agora cobre tudo
    expect(reservation.quantityShortfall).toBe(0)
    expect(reservation.status).toBe('reserved')

    const updatedMaterial = await db.material.findUnique({ where: { id: material.id } })
    expect(updatedMaterial?.reservedQty).toBe(20) // 12 (1ª tentativa) + 8 (delta da 2ª) = 20, nunca 32

    // 2 movimentos RESERVE: um de 12 (1ª tentativa) e um de 8 (só o delta da 2ª) — nunca um de 20 duplicado
    const movements = await db.stockMovement.findMany({ where: { referenceId: order.id, type: 'RESERVE' }, orderBy: { createdAt: 'asc' } })
    expect(movements).toHaveLength(2)
    expect(movements[0].quantity).toBe(12)
    expect(movements[1].quantity).toBe(8)
  })

  it('cancelamento: libera toda reserva ativa, gera movimento RELEASE e preserva o histórico (não apaga a linha)', async () => {
    const { user, product, material } = await setupProductWithMaterial('cancel', 100)

    const order = (await productionOrderService.create({ productId: product.id, quantity: 2, unit: 'UN' }, user.id)) as { id: string }
    createdOrderIds.push(order.id)

    await productionOrderService.update(order.id, { status: 'cancelled' }, user.id)

    const reservations = await materialReservationService.listReservations(order.id)
    expect(reservations).toHaveLength(1) // linha preservada, não apagada
    const reservation = reservations[0] as { quantityNeeded: number; quantityReserved: number; quantityShortfall: number; status: string }
    expect(reservation.status).toBe('released')
    expect(reservation.quantityReserved).toBe(0)
    expect(reservation.quantityShortfall).toBe(reservation.quantityNeeded) // 20

    const updatedMaterial = await db.material.findUnique({ where: { id: material.id } })
    expect(updatedMaterial?.reservedQty).toBe(0) // devolvido ao saldo disponível

    const releaseMovements = await db.stockMovement.findMany({ where: { referenceId: order.id, type: 'RELEASE' } })
    expect(releaseMovements).toHaveLength(1)
    expect(releaseMovements[0].quantity).toBe(20)
  })

  it('reexecução idêntica não duplica: reservar de novo sem nada mudar não gera novo movimento nem nova linha', async () => {
    const { user, product } = await setupProductWithMaterial('idempotent-reserve', 100)

    const order = (await productionOrderService.create({ productId: product.id, quantity: 2, unit: 'UN' }, user.id)) as { id: string }
    createdOrderIds.push(order.id)

    const before = await db.stockMovement.findMany({ where: { referenceId: order.id, type: 'RESERVE' } })
    const reservationsBefore = await materialReservationService.listReservations(order.id)

    // Reexecuta a mesma reserva, nada mudou (mesmo saldo, mesma necessidade)
    await materialReservationService.reserveForProductionOrder(order.id, user.id)
    await materialReservationService.reserveForProductionOrder(order.id, user.id)
    await materialReservationService.reserveForProductionOrder(order.id, user.id)

    const after = await db.stockMovement.findMany({ where: { referenceId: order.id, type: 'RESERVE' } })
    const reservationsAfter = await materialReservationService.listReservations(order.id)

    expect(after).toHaveLength(before.length) // nenhum movimento novo
    expect(reservationsAfter).toHaveLength(reservationsBefore.length) // nenhuma linha duplicada
    expect((reservationsAfter[0] as { quantityReserved: number }).quantityReserved).toBe(
      (reservationsBefore[0] as { quantityReserved: number }).quantityReserved
    )
  })

  it('reexecução de cancelamento não duplica: liberar uma reserva já liberada não gera novo movimento RELEASE', async () => {
    const { user, product } = await setupProductWithMaterial('idempotent-release', 100)

    const order = (await productionOrderService.create({ productId: product.id, quantity: 1, unit: 'UN' }, user.id)) as { id: string }
    createdOrderIds.push(order.id)

    await materialReservationService.releaseForProductionOrder(order.id, user.id, 'Teste de idempotência do release')
    const afterFirstRelease = await db.stockMovement.findMany({ where: { referenceId: order.id, type: 'RELEASE' } })

    await materialReservationService.releaseForProductionOrder(order.id, user.id, 'Segunda tentativa')
    const afterSecondRelease = await db.stockMovement.findMany({ where: { referenceId: order.id, type: 'RELEASE' } })

    expect(afterSecondRelease).toHaveLength(afterFirstRelease.length)
  })
})
