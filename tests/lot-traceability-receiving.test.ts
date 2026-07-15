import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { db } from '@/lib/db'
import { registerDomainEventHandlers } from '@/lib/register-domain-event-handlers'
import { requisitionService } from '@/app/services/requisition.service'
import { purchaseOrderService } from '@/app/services/purchase-order.service'
import { createTestUser, createTestMaterial, createTestSupplier } from './helpers/fixtures'

/**
 * Fase 10, Subetapa 2 (ADR-013): recebimento de Pedido de Compra cria/incrementa MaterialBatch
 * quando o material é lotControlled. Opt-in: material sem o flag continua exatamente como antes
 * (Fase 8/ADR-010), sem nenhum MaterialBatch envolvido.
 */
describe('Rastreabilidade por Lote — Recebimento (Fase 10, Subetapa 2)', () => {
  const createdUserIds: string[] = []
  const createdMaterialIds: string[] = []
  const createdSupplierIds: string[] = []
  const createdRequisitionIds: string[] = []
  const createdPurchaseOrderIds: string[] = []
  const createdMaterialBatchIds: string[] = []

  beforeAll(() => {
    registerDomainEventHandlers()
  })

  afterAll(async () => {
    await db.materialBatch.deleteMany({ where: { id: { in: createdMaterialBatchIds } } })
    await db.stockMovement.deleteMany({ where: { referenceId: { in: createdPurchaseOrderIds } } })
    // Fase 12 (ADR-016): recebimento agora também gera/atualiza AccountPayable via evento
    // pedido_compra.recebido — precisa ser limpo antes do PurchaseOrder (FK sem cascade, de
    // propósito: um título financeiro nunca deve sumir só porque o pedido de origem foi apagado).
    await db.payment.deleteMany({ where: { accountPayable: { purchaseOrderId: { in: createdPurchaseOrderIds } } } })
    await db.accountPayable.deleteMany({ where: { purchaseOrderId: { in: createdPurchaseOrderIds } } })
    await db.purchaseOrder.deleteMany({ where: { requisitionId: { in: createdRequisitionIds } } })
    await db.requisition.deleteMany({ where: { id: { in: createdRequisitionIds } } })
    await db.supplier.deleteMany({ where: { id: { in: createdSupplierIds } } })
    await db.material.deleteMany({ where: { id: { in: createdMaterialIds } } })
    await db.statusHistory.deleteMany({ where: { userId: { in: createdUserIds } } })
    await db.user.deleteMany({ where: { id: { in: createdUserIds } } })
  })

  /** Cria uma Requisição de Produção com 1 item, avança até "confirmed" (pronto para receber). */
  async function createConfirmedPurchaseOrder(suffix: string, quantity: number, lotControlled: boolean, unitPrice = 10) {
    const user = await createTestUser(suffix)
    createdUserIds.push(user.id)
    const material = await createTestMaterial(suffix)
    createdMaterialIds.push(material.id)
    if (lotControlled) await db.material.update({ where: { id: material.id }, data: { lotControlled: true } })
    const supplier = await createTestSupplier(suffix)
    createdSupplierIds.push(supplier.id)

    const requisition = (await requisitionService.create(
      {
        tipo: 'PRODUCAO',
        originModule: 'manual',
        productionOrderId: null,
        neededBy: '',
        notes: '',
        items: [{ materialId: material.id, description: '', supplierId: supplier.id, quantity, unit: 'KG', estimatedPrice: unitPrice, notes: '' }],
      },
      user.id
    )) as { id: string }
    createdRequisitionIds.push(requisition.id)

    await requisitionService.changeStatus(requisition.id, 'sent', user.id)
    await requisitionService.changeStatus(requisition.id, 'approved', user.id)
    const result = (await requisitionService.changeStatus(requisition.id, 'ordered', user.id)) as {
      generatedPurchaseOrders: Array<{ id: string; number: string; status: string }>
    }
    const purchaseOrder = result.generatedPurchaseOrders[0]
    createdPurchaseOrderIds.push(purchaseOrder.id)

    await purchaseOrderService.changeStatus(purchaseOrder.id, 'pending_approval', user.id)
    await purchaseOrderService.changeStatus(purchaseOrder.id, 'approved', user.id)
    await purchaseOrderService.changeStatus(purchaseOrder.id, 'sent', user.id)
    await purchaseOrderService.changeStatus(purchaseOrder.id, 'confirmed', user.id)

    const poWithItems = await db.purchaseOrder.findUnique({ where: { id: purchaseOrder.id }, include: { items: true } })
    return { user, material, supplier, purchaseOrder, item: poWithItems!.items[0] }
  }

  it('1. Material SEM lotControlled: recebimento continua idêntico a antes, nenhum MaterialBatch criado', async () => {
    const { user, material, purchaseOrder, item } = await createConfirmedPurchaseOrder('lote-receb-sem-controle', 50, false)

    await purchaseOrderService.receive(purchaseOrder.id, { items: [{ purchaseOrderItemId: item.id, quantityReceived: 50 }] }, user.id)

    const batches = await db.materialBatch.findMany({ where: { materialId: material.id } })
    expect(batches).toHaveLength(0)

    const movement = await db.stockMovement.findFirst({ where: { referenceId: purchaseOrder.id, type: 'IN' } })
    expect(movement?.materialBatchId).toBeNull()
  })

  it('2. Material lotControlled COM número de lote informado: MaterialBatch criado com unitCost snapshot e StockMovement ligado', async () => {
    const { user, material, purchaseOrder, item } = await createConfirmedPurchaseOrder('lote-receb-com-numero', 40, true, 12.5)

    await purchaseOrderService.receive(
      purchaseOrder.id,
      { items: [{ purchaseOrderItemId: item.id, quantityReceived: 40, batchNumber: 'FORNECEDOR-LOTE-A' }] },
      user.id
    )

    const batch = await db.materialBatch.findFirst({ where: { materialId: material.id, batchNumber: 'FORNECEDOR-LOTE-A' } })
    createdMaterialBatchIds.push(batch!.id)
    expect(batch?.quantityReceived).toBe(40)
    expect(batch?.quantityAvailable).toBe(40)
    expect(batch?.unitCost).toBe(12.5) // snapshot de unitPrice do item
    expect(batch?.purchaseOrderId).toBe(purchaseOrder.id)
    expect(batch?.supplierId).not.toBeNull()

    const movement = await db.stockMovement.findFirst({ where: { referenceId: purchaseOrder.id, type: 'IN' } })
    expect(movement?.materialBatchId).toBe(batch!.id)
  })

  it('3. Material lotControlled SEM número informado: fallback via NumberingService gera um código', async () => {
    const { user, material, purchaseOrder, item } = await createConfirmedPurchaseOrder('lote-receb-fallback', 25, true)

    await purchaseOrderService.receive(purchaseOrder.id, { items: [{ purchaseOrderItemId: item.id, quantityReceived: 25 }] }, user.id)

    const batches = await db.materialBatch.findMany({ where: { materialId: material.id } })
    expect(batches).toHaveLength(1)
    createdMaterialBatchIds.push(batches[0].id)
    expect(batches[0].batchNumber).not.toBe('')
    expect(batches[0].quantityReceived).toBe(25)
  })

  it('4. Reenvio do mesmo número de lote (chamada separada): incrementa o MaterialBatch existente, sem sobrescrever unitCost/receivedAt', async () => {
    const { user, material, purchaseOrder, item } = await createConfirmedPurchaseOrder('lote-receb-reenvio', 100, true, 20)

    await purchaseOrderService.receive(
      purchaseOrder.id,
      { items: [{ purchaseOrderItemId: item.id, quantityReceived: 40, batchNumber: 'LOTE-REENVIADO' }] },
      user.id
    )
    const batchAfterFirst = await db.materialBatch.findFirst({ where: { materialId: material.id, batchNumber: 'LOTE-REENVIADO' } })
    createdMaterialBatchIds.push(batchAfterFirst!.id)
    const originalUnitCost = batchAfterFirst!.unitCost
    const originalReceivedAt = batchAfterFirst!.receivedAt

    // Segunda entrega do MESMO lote, chamada separada (nunca dentro da mesma chamada de receive()).
    await purchaseOrderService.receive(
      purchaseOrder.id,
      { items: [{ purchaseOrderItemId: item.id, quantityReceived: 60, batchNumber: 'LOTE-REENVIADO' }] },
      user.id
    )

    const batchesWithNumber = await db.materialBatch.findMany({ where: { materialId: material.id, batchNumber: 'LOTE-REENVIADO' } })
    expect(batchesWithNumber).toHaveLength(1) // nunca duplica — incrementa o mesmo registro
    expect(batchesWithNumber[0].quantityReceived).toBe(100) // 40 + 60
    expect(batchesWithNumber[0].quantityAvailable).toBe(100)
    expect(batchesWithNumber[0].unitCost).toBe(originalUnitCost) // preservado, não recalculado
    expect(batchesWithNumber[0].receivedAt.getTime()).toBe(originalReceivedAt.getTime()) // preservado
  })

  it('5. Recebimento parcial em lotes diferentes via chamadas separadas (40 no lote A, 60 no lote B): rastreabilidade correta para cada um', async () => {
    const { user, material, purchaseOrder, item } = await createConfirmedPurchaseOrder('lote-receb-parcial-dois-lotes', 100, true)

    await purchaseOrderService.receive(
      purchaseOrder.id,
      { items: [{ purchaseOrderItemId: item.id, quantityReceived: 40, batchNumber: 'LOTE-A' }] },
      user.id
    )
    await purchaseOrderService.receive(
      purchaseOrder.id,
      { items: [{ purchaseOrderItemId: item.id, quantityReceived: 60, batchNumber: 'LOTE-B' }] },
      user.id
    )

    const batchA = await db.materialBatch.findFirst({ where: { materialId: material.id, batchNumber: 'LOTE-A' } })
    const batchB = await db.materialBatch.findFirst({ where: { materialId: material.id, batchNumber: 'LOTE-B' } })
    createdMaterialBatchIds.push(batchA!.id, batchB!.id)

    expect(batchA?.quantityReceived).toBe(40)
    expect(batchB?.quantityReceived).toBe(60)

    const updatedOrder = await db.purchaseOrder.findUnique({ where: { id: purchaseOrder.id } })
    expect(updatedOrder?.status).toBe('received') // 40+60=100, item completo

    // Cada StockMovement IN aponta para o lote correto, não para um genérico.
    const movements = await db.stockMovement.findMany({ where: { referenceId: purchaseOrder.id, type: 'IN' }, orderBy: { createdAt: 'asc' } })
    expect(movements).toHaveLength(2)
    expect(movements[0].materialBatchId).toBe(batchA!.id)
    expect(movements[1].materialBatchId).toBe(batchB!.id)
  })
})
