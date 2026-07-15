import { describe, it, expect, afterAll } from 'vitest'
import { db } from '@/lib/db'
import { bomService } from '@/app/services/bom.service'
import { productionOrderService } from '@/app/services/production-order.service'
import { materialReservationService } from '@/app/services/material-reservation.service'
import { createTestUser, createTestProduct, createTestMaterial } from './helpers/fixtures'

/**
 * ADR-012 (decisão do usuário, 2026-07-10): `consumed` é um estado TERMINAL de
 * `MaterialReservation` — `releaseMany()` (cancelamento de OP) nunca mais toca uma reserva já
 * `consumed`, preservando o significado histórico ("gasto em produção" nunca vira "liberado sem
 * uso"). `reserved`/`partial` continuam sendo liberados normalmente pelo cancelamento.
 */
describe('Cancelamento de OP e estado terminal de MaterialReservation (ADR-012)', () => {
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

  function reservationOf(productionOrderId: string, materialId: string) {
    return db.materialReservation.findFirst({ where: { productionOrderId, itemType: 'material', materialId } })
  }

  it('cancelamento de OP parcialmente produzida: reserva ainda "partial" é liberada normalmente', async () => {
    const user = await createTestUser('cancel-partial')
    createdUserIds.push(user.id)
    const product = await createTestProduct('cancel-partial')
    createdProductIds.push(product.id)
    const material = await createTestMaterial('cancel-partial')
    createdMaterialIds.push(material.id)
    await db.material.update({ where: { id: material.id }, data: { stockQty: 100000 } })

    const revision = (await bomService.createRevision(product.id, { revisionCode: 'A', notes: '' }, user.id)) as { id: string }
    createdRevisionIds.push(revision.id)
    await bomService.addLine(revision.id, { lineType: 'material', materialId: material.id, componentProductId: null, quantity: 1, unit: 'KG', scrapPct: 0, order: 0, notes: '' })
    await bomService.changeStatus(revision.id, 'released', user.id)

    const order = (await productionOrderService.create({ productId: product.id, quantity: 50, unit: 'UN' }, user.id)) as { id: string }
    createdOrderIds.push(order.id)

    await productionOrderService.produce(order.id, 20, user.id)
    const reservationBefore = await reservationOf(order.id, material.id)
    expect(reservationBefore?.status).toBe('partial')
    expect(reservationBefore?.quantityNeeded).toBe(30)
    expect(reservationBefore?.quantityReserved).toBe(30)

    await productionOrderService.update(order.id, { status: 'cancelled' }, user.id)

    const reservationAfter = await reservationOf(order.id, material.id)
    expect(reservationAfter?.status).toBe('released')
    expect(reservationAfter?.quantityReserved).toBe(0)
    expect(reservationAfter?.quantityShortfall).toBe(30)

    const materialAfter = await db.material.findUnique({ where: { id: material.id } })
    expect(materialAfter?.reservedQty).toBe(0) // devolvido de fato
  })

  it('cancelamento não altera reserva já "consumed" (produção total do item, estado terminal preservado)', async () => {
    const user = await createTestUser('cancel-consumed')
    createdUserIds.push(user.id)
    const product = await createTestProduct('cancel-consumed')
    createdProductIds.push(product.id)
    const material = await createTestMaterial('cancel-consumed')
    createdMaterialIds.push(material.id)
    await db.material.update({ where: { id: material.id }, data: { stockQty: 100000 } })

    const revision = (await bomService.createRevision(product.id, { revisionCode: 'A', notes: '' }, user.id)) as { id: string }
    createdRevisionIds.push(revision.id)
    await bomService.addLine(revision.id, { lineType: 'material', materialId: material.id, componentProductId: null, quantity: 1, unit: 'KG', scrapPct: 0, order: 0, notes: '' })
    await bomService.changeStatus(revision.id, 'released', user.id)

    const order = (await productionOrderService.create({ productId: product.id, quantity: 30, unit: 'UN' }, user.id)) as { id: string }
    createdOrderIds.push(order.id)

    await productionOrderService.produce(order.id, 30, user.id) // total — reserva chega a "consumed" e a OP a "completed"
    const reservationBefore = await reservationOf(order.id, material.id)
    expect(reservationBefore?.status).toBe('consumed')

    // A máquina de estados da OP já bloqueia cancelar uma OP "completed" (defesa em outra camada,
    // independente desta) — confirmando isso primeiro, para deixar claro que os dois mecanismos
    // protegem o mesmo invariante por caminhos diferentes.
    await expect(productionOrderService.update(order.id, { status: 'cancelled' }, user.id)).rejects.toThrow()

    // Defesa em profundidade: mesmo chamando o release de reserva diretamente (contornando a
    // máquina de estados da OP, como poderia acontecer por um caminho futuro ainda não previsto),
    // releaseMany() nunca deve tocar uma reserva já "consumed".
    await materialReservationService.releaseForProductionOrder(order.id, user.id, 'Tentativa de liberação direta')

    const reservationAfter = await reservationOf(order.id, material.id)
    expect(reservationAfter?.status).toBe('consumed') // inalterado
    expect(reservationAfter?.quantityReserved).toBe(0)
    expect(reservationAfter?.quantityNeeded).toBe(0)
  })

  it('cancelamento sem nenhuma produção: reserva "reserved" é liberada integralmente', async () => {
    const user = await createTestUser('cancel-none')
    createdUserIds.push(user.id)
    const product = await createTestProduct('cancel-none')
    createdProductIds.push(product.id)
    const material = await createTestMaterial('cancel-none')
    createdMaterialIds.push(material.id)
    await db.material.update({ where: { id: material.id }, data: { stockQty: 100000 } })

    const revision = (await bomService.createRevision(product.id, { revisionCode: 'A', notes: '' }, user.id)) as { id: string }
    createdRevisionIds.push(revision.id)
    await bomService.addLine(revision.id, { lineType: 'material', materialId: material.id, componentProductId: null, quantity: 1, unit: 'KG', scrapPct: 0, order: 0, notes: '' })
    await bomService.changeStatus(revision.id, 'released', user.id)

    const order = (await productionOrderService.create({ productId: product.id, quantity: 40, unit: 'UN' }, user.id)) as { id: string }
    createdOrderIds.push(order.id)

    const reservationBefore = await reservationOf(order.id, material.id)
    expect(reservationBefore?.status).toBe('reserved')
    expect(reservationBefore?.quantityReserved).toBe(40)

    await productionOrderService.update(order.id, { status: 'cancelled' }, user.id)

    const reservationAfter = await reservationOf(order.id, material.id)
    expect(reservationAfter?.status).toBe('released')
    expect(reservationAfter?.quantityReserved).toBe(0)
    expect(reservationAfter?.quantityShortfall).toBe(40)

    const materialAfter = await db.material.findUnique({ where: { id: material.id } })
    expect(materialAfter?.reservedQty).toBe(0)
  })

  it('histórico misto: reserva "consumed" preservada e reserva "partial" liberada pelo MESMO cancelamento', async () => {
    const user = await createTestUser('cancel-mixed')
    createdUserIds.push(user.id)
    const product = await createTestProduct('cancel-mixed')
    createdProductIds.push(product.id)
    const materialConsumed = await createTestMaterial('cancel-mixed-consumed')
    createdMaterialIds.push(materialConsumed.id)
    const materialPartial = await createTestMaterial('cancel-mixed-partial')
    createdMaterialIds.push(materialPartial.id)
    await db.material.update({ where: { id: materialConsumed.id }, data: { stockQty: 100000 } })
    await db.material.update({ where: { id: materialPartial.id }, data: { stockQty: 100000 } })

    const revision = (await bomService.createRevision(product.id, { revisionCode: 'A', notes: '' }, user.id)) as { id: string }
    createdRevisionIds.push(revision.id)
    await bomService.addLine(revision.id, { lineType: 'material', materialId: materialConsumed.id, componentProductId: null, quantity: 1, unit: 'KG', scrapPct: 0, order: 0, notes: '' })
    await bomService.addLine(revision.id, { lineType: 'material', materialId: materialPartial.id, componentProductId: null, quantity: 1, unit: 'KG', scrapPct: 0, order: 1, notes: '' })
    await bomService.changeStatus(revision.id, 'released', user.id)

    const order = (await productionOrderService.create({ productId: product.id, quantity: 50, unit: 'UN' }, user.id)) as { id: string }
    createdOrderIds.push(order.id)

    await productionOrderService.produce(order.id, 20, user.id) // ambas ficam "partial" (needed=30)

    // Simula diretamente o gatilho documentado no ADR-012 (mudança de revisão ativa de um
    // subconjunto entre a reserva e a reconciliação pode fazer uma reserva específica chegar a
    // "consumed" antes da OP inteira completar) — aqui, seedado direto para o teste ser
    // determinístico, focando no comportamento de `releaseMany()` em si, não em como o estado foi
    // alcançado.
    await db.materialReservation.updateMany({
      where: { productionOrderId: order.id, materialId: materialConsumed.id },
      data: { quantityNeeded: 0, quantityReserved: 0, quantityShortfall: 0, status: 'consumed' },
    })

    await productionOrderService.update(order.id, { status: 'cancelled' }, user.id)

    const consumedAfter = await reservationOf(order.id, materialConsumed.id)
    expect(consumedAfter?.status).toBe('consumed') // preservado, cancelamento não tocou

    const partialAfter = await reservationOf(order.id, materialPartial.id)
    expect(partialAfter?.status).toBe('released') // liberado normalmente
    expect(partialAfter?.quantityReserved).toBe(0)
    expect(partialAfter?.quantityShortfall).toBe(30)
  })
})
