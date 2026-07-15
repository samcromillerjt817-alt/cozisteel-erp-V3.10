import { describe, it, expect, afterAll } from 'vitest'
import { db } from '@/lib/db'
import { bomService } from '@/app/services/bom.service'
import { createTestUser, createTestProduct, createTestMaterial } from './helpers/fixtures'

/**
 * Fase 5, Subetapa 1 (ADR-006): campos de saldo (reservedQty/onOrderQty/inProductionQty),
 * ProductionOrder.bomRevisionId e a entidade MaterialReservation — puramente estrutural, sem
 * lógica de reserva ainda (isso é a Subetapa 3).
 */
describe('Reserva de Material — Schema (Subetapa 1)', () => {
  const createdUserIds: string[] = []
  const createdProductIds: string[] = []
  const createdMaterialIds: string[] = []
  const createdRevisionIds: string[] = []
  const createdOrderIds: string[] = []
  const createdReservationIds: string[] = []

  afterAll(async () => {
    await db.materialReservation.deleteMany({ where: { id: { in: createdReservationIds } } })
    await db.productionOrder.deleteMany({ where: { id: { in: createdOrderIds } } })
    await db.bomRevision.deleteMany({ where: { id: { in: createdRevisionIds } } })
    await db.material.deleteMany({ where: { id: { in: createdMaterialIds } } })
    await db.product.deleteMany({ where: { id: { in: createdProductIds } } })
    await db.statusHistory.deleteMany({ where: { userId: { in: createdUserIds } } })
    await db.user.deleteMany({ where: { id: { in: createdUserIds } } })
  })

  it('Material/Product recebem reservedQty/onOrderQty/inProductionQty = 0 por padrão', async () => {
    const material = await db.material.create({ data: { name: 'Material Reserva Teste' } })
    createdMaterialIds.push(material.id)
    const product = await db.product.create({ data: { name: 'Produto Reserva Teste' } })
    createdProductIds.push(product.id)

    expect(material.reservedQty).toBe(0)
    expect(material.onOrderQty).toBe(0)
    expect(material.inProductionQty).toBe(0)
    expect(product.reservedQty).toBe(0)
    expect(product.onOrderQty).toBe(0)
    expect(product.inProductionQty).toBe(0)
  })

  it('ProductionOrder aceita bomRevisionId opcional, referenciando uma revisão liberada', async () => {
    const user = await createTestUser('reservation-schema')
    createdUserIds.push(user.id)
    const product = await createTestProduct('reservation-schema')
    createdProductIds.push(product.id)

    const revision = (await bomService.createRevision(product.id, { revisionCode: 'A', notes: '' }, user.id)) as { id: string }
    createdRevisionIds.push(revision.id)
    await bomService.changeStatus(revision.id, 'released', user.id)

    const order = await db.productionOrder.create({
      data: {
        number: 'OP-RESERVA-TESTE-1',
        date: '01/01/2026',
        productId: product.id,
        quantity: 1,
        userId: user.id,
        bomRevisionId: revision.id,
      },
    })
    createdOrderIds.push(order.id)

    expect(order.bomRevisionId).toBe(revision.id)

    const orderWithoutRevision = await db.productionOrder.create({
      data: { number: 'OP-RESERVA-TESTE-2', date: '01/01/2026', quantity: 1, userId: user.id },
    })
    createdOrderIds.push(orderWithoutRevision.id)
    expect(orderWithoutRevision.bomRevisionId).toBeNull()
  })

  it('MaterialReservation grava needed/reserved/shortfall separadamente para itemType=material e itemType=product', async () => {
    const user = await createTestUser('reservation-entity')
    createdUserIds.push(user.id)
    const product = await createTestProduct('reservation-entity')
    createdProductIds.push(product.id)
    const componentProduct = await createTestProduct('reservation-entity-component')
    createdProductIds.push(componentProduct.id)
    const material = await createTestMaterial('reservation-entity')
    createdMaterialIds.push(material.id)

    const order = await db.productionOrder.create({
      data: { number: 'OP-RESERVA-TESTE-3', date: '01/01/2026', productId: product.id, quantity: 2, userId: user.id },
    })
    createdOrderIds.push(order.id)

    const materialReservation = await db.materialReservation.create({
      data: {
        productionOrderId: order.id,
        itemType: 'material',
        materialId: material.id,
        quantityNeeded: 10,
        quantityReserved: 6,
        quantityShortfall: 4,
        status: 'partial',
      },
    })
    createdReservationIds.push(materialReservation.id)

    const productReservation = await db.materialReservation.create({
      data: {
        productionOrderId: order.id,
        itemType: 'product',
        productId: componentProduct.id,
        quantityNeeded: 3,
        quantityReserved: 3,
        quantityShortfall: 0,
        status: 'reserved',
      },
    })
    createdReservationIds.push(productReservation.id)

    expect(materialReservation.quantityNeeded).toBe(10)
    expect(materialReservation.quantityReserved).toBe(6)
    expect(materialReservation.quantityShortfall).toBe(4)
    expect(materialReservation.status).toBe('partial')

    expect(productReservation.itemType).toBe('product')
    expect(productReservation.status).toBe('reserved')

    const reservationsForOrder = await db.materialReservation.findMany({ where: { productionOrderId: order.id } })
    expect(reservationsForOrder).toHaveLength(2)
  })
})
