import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { db } from '@/lib/db'
import { registerDomainEventHandlers } from '@/lib/register-domain-event-handlers'
import { requisitionService } from '@/app/services/requisition.service'
import { createTestUser, createTestMaterial, createTestSupplier } from './helpers/fixtures'

/**
 * Fase 7, Subetapa 2 (ADR-009): regra de atendimento por estoque disponível — só o saldo faltante
 * (quantityToPurchase) vira Pedido de Compra; a parte atendida (quantityFromStock) gera baixa real
 * de estoque (primeira vez que Requisição, por si só, move estoque).
 */
describe('Requisição — Regra de Atendimento por Estoque (Subetapa 2)', () => {
  const createdUserIds: string[] = []
  const createdMaterialIds: string[] = []
  const createdSupplierIds: string[] = []
  const createdRequisitionIds: string[] = []

  beforeAll(() => {
    registerDomainEventHandlers()
  })

  afterAll(async () => {
    await db.stockMovement.deleteMany({ where: { referenceId: { in: createdRequisitionIds } } })
    await db.purchaseOrder.deleteMany({ where: { requisitionId: { in: createdRequisitionIds } } }) // cascade: PurchaseOrderItem
    await db.requisition.deleteMany({ where: { id: { in: createdRequisitionIds } } })
    await db.supplier.deleteMany({ where: { id: { in: createdSupplierIds } } })
    await db.material.deleteMany({ where: { id: { in: createdMaterialIds } } })
    await db.statusHistory.deleteMany({ where: { userId: { in: createdUserIds } } })
    await db.user.deleteMany({ where: { id: { in: createdUserIds } } })
  })

  async function advanceToOrdered(requisitionId: string, userId: string) {
    await requisitionService.changeStatus(requisitionId, 'sent', userId)
    await requisitionService.changeStatus(requisitionId, 'approved', userId)
    return requisitionService.changeStatus(requisitionId, 'ordered', userId)
  }

  it('Estoque suficiente: item inteiro atendido por estoque, baixa real, nenhuma compra gerada', async () => {
    const user = await createTestUser('req-estoque-suficiente')
    createdUserIds.push(user.id)
    const material = await createTestMaterial('req-estoque-suficiente')
    createdMaterialIds.push(material.id)
    await db.material.update({ where: { id: material.id }, data: { stockQty: 20 } })

    const requisition = (await requisitionService.create(
      { tipo: 'PRODUCAO', originModule: 'manual', productionOrderId: null, neededBy: '', notes: '', items: [{ materialId: material.id, description: '', supplierId: null, quantity: 10, unit: 'KG', estimatedPrice: 5, notes: '' }] },
      user.id
    )) as { id: string }
    createdRequisitionIds.push(requisition.id)

    const result = (await advanceToOrdered(requisition.id, user.id)) as { generatedPurchaseOrders: unknown[] }

    const item = await db.requisitionItem.findFirst({ where: { requisitionId: requisition.id } })
    expect(item?.quantityFromStock).toBe(10)
    expect(item?.quantityToPurchase).toBe(0)

    const material2 = await db.material.findUnique({ where: { id: material.id } })
    expect(material2?.stockQty).toBe(10) // 20 - 10

    const movements = await db.stockMovement.findMany({ where: { referenceId: requisition.id, type: 'OUT' } })
    expect(movements).toHaveLength(1)
    expect(movements[0].quantity).toBe(10)

    expect(result.generatedPurchaseOrders).toHaveLength(0)
  })

  it('Estoque parcial: split correto, baixa só da parte atendida, compra só do saldo faltante', async () => {
    const user = await createTestUser('req-estoque-parcial')
    createdUserIds.push(user.id)
    const material = await createTestMaterial('req-estoque-parcial')
    createdMaterialIds.push(material.id)
    await db.material.update({ where: { id: material.id }, data: { stockQty: 4 } })
    const supplier = await createTestSupplier('req-estoque-parcial')
    createdSupplierIds.push(supplier.id)

    const requisition = (await requisitionService.create(
      { tipo: 'PRODUCAO', originModule: 'manual', productionOrderId: null, neededBy: '', notes: '', items: [{ materialId: material.id, description: '', supplierId: supplier.id, quantity: 10, unit: 'KG', estimatedPrice: 5, notes: '' }] },
      user.id
    )) as { id: string }
    createdRequisitionIds.push(requisition.id)

    const result = (await advanceToOrdered(requisition.id, user.id)) as { generatedPurchaseOrders: Array<{ number: string }> }

    const item = await db.requisitionItem.findFirst({ where: { requisitionId: requisition.id } })
    expect(item?.quantityFromStock).toBe(4)
    expect(item?.quantityToPurchase).toBe(6)

    const material2 = await db.material.findUnique({ where: { id: material.id } })
    expect(material2?.stockQty).toBe(0) // 4 - 4

    const movements = await db.stockMovement.findMany({ where: { referenceId: requisition.id, type: 'OUT' } })
    expect(movements).toHaveLength(1)
    expect(movements[0].quantity).toBe(4)

    expect(result.generatedPurchaseOrders).toHaveLength(1)
    const po = await db.purchaseOrder.findFirst({ where: { requisitionId: requisition.id }, include: { items: true } })
    expect(po?.items).toHaveLength(1)
    expect(po?.items[0].quantity).toBe(6) // nunca a quantidade cheia (10)
  })

  it('Sem estoque: tudo vira compra, nenhum StockMovement gerado', async () => {
    const user = await createTestUser('req-sem-estoque')
    createdUserIds.push(user.id)
    const material = await createTestMaterial('req-sem-estoque')
    createdMaterialIds.push(material.id)
    const supplier = await createTestSupplier('req-sem-estoque')
    createdSupplierIds.push(supplier.id)

    const requisition = (await requisitionService.create(
      { tipo: 'PRODUCAO', originModule: 'manual', productionOrderId: null, neededBy: '', notes: '', items: [{ materialId: material.id, description: '', supplierId: supplier.id, quantity: 8, unit: 'KG', estimatedPrice: 5, notes: '' }] },
      user.id
    )) as { id: string }
    createdRequisitionIds.push(requisition.id)

    await advanceToOrdered(requisition.id, user.id)

    const item = await db.requisitionItem.findFirst({ where: { requisitionId: requisition.id } })
    expect(item?.quantityFromStock).toBe(0)
    expect(item?.quantityToPurchase).toBe(8)

    const movements = await db.stockMovement.findMany({ where: { referenceId: requisition.id } })
    expect(movements).toHaveLength(0)
  })

  it('Item não-estocável (sem materialId): sempre 100% quantityToPurchase, nunca vira linha de Pedido de Compra', async () => {
    const user = await createTestUser('req-item-nao-estocavel')
    createdUserIds.push(user.id)

    const requisition = (await requisitionService.create(
      {
        tipo: 'SERVICOS',
        originModule: 'manual',
        productionOrderId: null,
        neededBy: '',
        notes: '',
        items: [{ materialId: null, description: 'Licença de software anual', supplierId: null, quantity: 1, unit: 'UN', estimatedPrice: 0, notes: '' }],
      },
      user.id
    )) as { id: string }
    createdRequisitionIds.push(requisition.id)

    const result = (await advanceToOrdered(requisition.id, user.id)) as { generatedPurchaseOrders: unknown[] }

    const item = await db.requisitionItem.findFirst({ where: { requisitionId: requisition.id } })
    expect(item?.quantityFromStock).toBe(0)
    expect(item?.quantityToPurchase).toBe(1)
    expect(result.generatedPurchaseOrders).toHaveLength(0) // sem material, Compras não gera nada nesta fase
  })
})
