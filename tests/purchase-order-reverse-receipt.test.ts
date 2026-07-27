import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { db } from '@/lib/db'
import { registerDomainEventHandlers } from '@/lib/register-domain-event-handlers'
import { requisitionService } from '@/app/services/requisition.service'
import { purchaseOrderService } from '@/app/services/purchase-order.service'
import { bomService } from '@/app/services/bom.service'
import { productionOrderService } from '@/app/services/production-order.service'
import { createTestUser, createTestMaterial, createTestSupplier, createTestProduct } from './helpers/fixtures'

/**
 * ADR-023 (Decisão #1, Estorno) — primeiro caso concreto: reverter UM lançamento de recebimento de
 * compra (não o pedido inteiro). Recusa sem cascata quando o lote já foi consumido por produção —
 * decisão explícita do usuário, sem estorno em cascata nesta rodada.
 */
describe('Compras — Estorno de recebimento (ADR-023, Decisão #1)', () => {
  const createdUserIds: string[] = []
  const createdMaterialIds: string[] = []
  const createdSupplierIds: string[] = []
  const createdRequisitionIds: string[] = []
  const createdPurchaseOrderIds: string[] = []
  const createdProductIds: string[] = []
  const createdRevisionIds: string[] = []
  const createdOrderIds: string[] = []

  beforeAll(() => {
    registerDomainEventHandlers()
  })

  afterAll(async () => {
    await db.batchConsumption.deleteMany({ where: { productBatch: { productionOrderId: { in: createdOrderIds } } } })
    await db.productBatch.deleteMany({ where: { productionOrderId: { in: createdOrderIds } } })
    await db.productionOrderExecution.deleteMany({ where: { productionOrderId: { in: createdOrderIds } } })
    await db.materialReservation.deleteMany({ where: { productionOrderId: { in: createdOrderIds } } })
    await db.stockMovement.deleteMany({ where: { reversalOfId: { not: null }, referenceId: { in: createdPurchaseOrderIds } } })
    await db.stockMovement.deleteMany({ where: { referenceId: { in: [...createdPurchaseOrderIds, ...createdOrderIds] } } })
    await db.productionOrder.deleteMany({ where: { id: { in: createdOrderIds } } })
    await db.bomRevision.deleteMany({ where: { id: { in: createdRevisionIds } } })
    await db.materialBatch.deleteMany({ where: { materialId: { in: createdMaterialIds } } })
    // registerDomainEventHandlers() ativa o handler que gera AccountPayable a partir do recebimento
    // (mesmo efeito colateral já documentado em financial-account-listing.test.ts).
    await db.payment.deleteMany({ where: { accountPayable: { purchaseOrderId: { in: createdPurchaseOrderIds } } } })
    await db.accountPayable.deleteMany({ where: { purchaseOrderId: { in: createdPurchaseOrderIds } } })
    await db.purchaseOrder.deleteMany({ where: { id: { in: createdPurchaseOrderIds } } })
    await db.requisition.deleteMany({ where: { id: { in: createdRequisitionIds } } })
    await db.supplier.deleteMany({ where: { id: { in: createdSupplierIds } } })
    await db.material.deleteMany({ where: { id: { in: createdMaterialIds } } })
    await db.product.deleteMany({ where: { id: { in: createdProductIds } } })
    await db.statusHistory.deleteMany({ where: { userId: { in: createdUserIds } } })
    await db.user.deleteMany({ where: { id: { in: createdUserIds } } })
  })

  async function receivePurchaseOrder(suffix: string, quantity: number, unitPrice: number, batchNumber?: string) {
    const user = await createTestUser(suffix)
    createdUserIds.push(user.id)
    const material = await createTestMaterial(suffix)
    createdMaterialIds.push(material.id)
    if (batchNumber) await db.material.update({ where: { id: material.id }, data: { lotControlled: true } })
    const supplier = await createTestSupplier(suffix)
    createdSupplierIds.push(supplier.id)

    const requisition = (await requisitionService.create(
      { tipo: 'PRODUCAO', originModule: 'manual', productionOrderId: null, neededBy: '', notes: '', items: [{ materialId: material.id, description: '', supplierId: supplier.id, quantity, unit: 'KG', estimatedPrice: unitPrice, notes: '' }] },
      user.id
    )) as { id: string }
    createdRequisitionIds.push(requisition.id)
    await requisitionService.changeStatus(requisition.id, 'sent', user.id)
    await requisitionService.changeStatus(requisition.id, 'approved', user.id)
    const result = (await requisitionService.changeStatus(requisition.id, 'ordered', user.id)) as { generatedPurchaseOrders: Array<{ id: string }> }
    const purchaseOrderId = result.generatedPurchaseOrders[0].id
    createdPurchaseOrderIds.push(purchaseOrderId)

    await purchaseOrderService.changeStatus(purchaseOrderId, 'pending_approval', user.id)
    await purchaseOrderService.changeStatus(purchaseOrderId, 'approved', user.id)
    await purchaseOrderService.changeStatus(purchaseOrderId, 'sent', user.id)
    await purchaseOrderService.changeStatus(purchaseOrderId, 'confirmed', user.id)
    const purchaseOrder = (await db.purchaseOrder.findUnique({ where: { id: purchaseOrderId }, include: { items: true } }))!
    await purchaseOrderService.receive(
      purchaseOrderId,
      { items: [{ purchaseOrderItemId: purchaseOrder.items[0].id, quantityReceived: quantity, batchNumber }] },
      user.id
    )
    const movement = (await db.stockMovement.findFirst({ where: { referenceId: purchaseOrderId, type: 'IN' } }))!
    return { user, material, purchaseOrderId, itemId: purchaseOrder.items[0].id, movement }
  }

  it('1. Reverte um recebimento simples (sem lote): estoque, item e status voltam ao estado anterior', async () => {
    const { user, material, purchaseOrderId, itemId, movement } = await receivePurchaseOrder('reverse-simple', 5, 10)

    const beforeMaterial = (await db.material.findUnique({ where: { id: material.id } }))!
    expect(beforeMaterial.stockQty).toBe(5)

    await purchaseOrderService.reverseReceipt(movement.id, 'Recebimento lançado por engano', user.id)

    const afterMaterial = (await db.material.findUnique({ where: { id: material.id } }))!
    expect(afterMaterial.stockQty).toBe(0)

    const item = (await db.purchaseOrderItem.findUnique({ where: { id: itemId } }))!
    expect(item.quantityReceived).toBe(0)

    const purchaseOrder = (await db.purchaseOrder.findUnique({ where: { id: purchaseOrderId } }))!
    expect(purchaseOrder.status).toBe('confirmed')

    const originalMovement = (await db.stockMovement.findUnique({ where: { id: movement.id } }))!
    expect(originalMovement.reversedAt).not.toBeNull()

    const reversalMovement = await db.stockMovement.findFirst({ where: { reversalOfId: movement.id } })
    expect(reversalMovement).not.toBeNull()
    expect(reversalMovement?.type).toBe('OUT')
    expect(reversalMovement?.quantity).toBe(5)
  })

  it('2. Reverte um recebimento com lote: MaterialBatch é decrementado junto', async () => {
    const { user, material, movement } = await receivePurchaseOrder('reverse-lote', 8, 20, 'LOTE-REV-1')

    const batchBefore = (await db.materialBatch.findUnique({ where: { materialId_batchNumber: { materialId: material.id, batchNumber: 'LOTE-REV-1' } } }))!
    expect(batchBefore.quantityAvailable).toBe(8)

    await purchaseOrderService.reverseReceipt(movement.id, 'Lote errado', user.id)

    const batchAfter = (await db.materialBatch.findUnique({ where: { id: batchBefore.id } }))!
    expect(batchAfter.quantityAvailable).toBe(0)
    expect(batchAfter.quantityReceived).toBe(0)
  })

  it('3. Recusa estornar quando o lote já foi consumido por produção, nomeando a OP e o produto', async () => {
    const { user, material, movement } = await receivePurchaseOrder('reverse-consumido', 10, 5, 'LOTE-CONSUMIDO')

    const product = await createTestProduct('reverse-consumido-produto')
    createdProductIds.push(product.id)
    await db.product.update({ where: { id: product.id }, data: { lotControlled: true } })
    const revision = (await bomService.createRevision(product.id, { revisionCode: 'A', notes: '' }, user.id)) as { id: string }
    createdRevisionIds.push(revision.id)
    await bomService.addLine(revision.id, { lineType: 'material', materialId: material.id, componentProductId: null, quantity: 1, unit: 'KG', scrapPct: 0, order: 0, notes: '' })
    await bomService.changeStatus(revision.id, 'released', user.id)

    const order = (await productionOrderService.create({ productId: product.id, quantity: 2, unit: 'UN' }, user.id)) as { id: string; number: string }
    createdOrderIds.push(order.id)
    await productionOrderService.produce(order.id, 2, user.id)

    await expect(purchaseOrderService.reverseReceipt(movement.id, 'Tentando estornar mesmo assim', user.id)).rejects.toThrow(
      new RegExp(order.number)
    )
  })

  it('4. Recusa estornar um recebimento já estornado', async () => {
    const { user, movement } = await receivePurchaseOrder('reverse-duplo', 3, 7)
    await purchaseOrderService.reverseReceipt(movement.id, 'Primeiro estorno', user.id)

    await expect(purchaseOrderService.reverseReceipt(movement.id, 'Segundo estorno', user.id)).rejects.toThrow()
  })

  it('5. Recusa estornar um estorno (a movimentação OUT gerada pelo estorno)', async () => {
    const { user, movement } = await receivePurchaseOrder('reverse-do-estorno', 4, 9)
    await purchaseOrderService.reverseReceipt(movement.id, 'Estorno original', user.id)
    const reversalMovement = (await db.stockMovement.findFirst({ where: { reversalOfId: movement.id } }))!

    await expect(purchaseOrderService.reverseReceipt(reversalMovement.id, 'Tentando estornar o estorno', user.id)).rejects.toThrow()
  })
})
