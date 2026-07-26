import { describe, it, expect, afterAll } from 'vitest'
import { db } from '@/lib/db'
import { registerDomainEventHandlers } from '@/lib/register-domain-event-handlers'
import { statusHistoryService } from '@/app/services/status-history.service'
import { requisitionService } from '@/app/services/requisition.service'
import { purchaseOrderService } from '@/app/services/purchase-order.service'
import { createTestUser, createTestMaterial, createTestSupplier } from './helpers/fixtures'

/**
 * ADR-022 (Fase UX-2, achado #14) — `StatusHistory` era gravado desde a Fase 2 e nunca tinha
 * consulta própria; `approvedBy`/`approvedAt` de Requisição e Pedido de Compra existiam no banco e
 * nunca eram expostos por `getById()`. Ambos fecham a mesma classe de achado: dado real, nunca lido.
 */
describe('Histórico de status e dados de aprovação (ADR-022, Fase UX-2)', () => {
  const createdUserIds: string[] = []
  const createdMaterialIds: string[] = []
  const createdSupplierIds: string[] = []
  const createdRequisitionIds: string[] = []
  const createdPurchaseOrderIds: string[] = []

  registerDomainEventHandlers()

  afterAll(async () => {
    await db.purchaseOrder.deleteMany({ where: { requisitionId: { in: createdRequisitionIds } } })
    await db.requisition.deleteMany({ where: { id: { in: createdRequisitionIds } } })
    await db.supplier.deleteMany({ where: { id: { in: createdSupplierIds } } })
    await db.material.deleteMany({ where: { id: { in: createdMaterialIds } } })
    await db.statusHistory.deleteMany({ where: { userId: { in: createdUserIds } } })
    await db.user.deleteMany({ where: { id: { in: createdUserIds } } })
  })

  it('1. statusHistoryService.list() devolve as transições em ordem cronológica, com nome do usuário', async () => {
    const user = await createTestUser('status-history-list')
    createdUserIds.push(user.id)
    const material = await createTestMaterial('status-history-list')
    createdMaterialIds.push(material.id)
    const supplier = await createTestSupplier('status-history-list')
    createdSupplierIds.push(supplier.id)

    const requisition = (await requisitionService.create(
      {
        tipo: 'PRODUCAO', originModule: 'manual', productionOrderId: null, neededBy: '', notes: '',
        items: [{ materialId: material.id, description: '', supplierId: supplier.id, quantity: 5, unit: 'KG', estimatedPrice: 10, notes: '' }],
      },
      user.id
    )) as { id: string }
    createdRequisitionIds.push(requisition.id)

    await requisitionService.changeStatus(requisition.id, 'sent', user.id)
    await requisitionService.changeStatus(requisition.id, 'approved', user.id)

    const history = await statusHistoryService.list('requisition', requisition.id)
    expect(history.map((h) => [h.fromStatus, h.toStatus])).toEqual([
      ['draft', 'sent'],
      ['sent', 'approved'],
    ])
    expect(history[0].user?.name).toBe(user.name)
    expect(history[0].createdAt.getTime()).toBeLessThanOrEqual(history[1].createdAt.getTime())
  })

  it('2. requisitionService.getById() expõe approvedByName/approvedAt após aprovar', async () => {
    const user = await createTestUser('req-approved-by')
    createdUserIds.push(user.id)
    const material = await createTestMaterial('req-approved-by')
    createdMaterialIds.push(material.id)
    const supplier = await createTestSupplier('req-approved-by')
    createdSupplierIds.push(supplier.id)

    const requisition = (await requisitionService.create(
      {
        tipo: 'PRODUCAO', originModule: 'manual', productionOrderId: null, neededBy: '', notes: '',
        items: [{ materialId: material.id, description: '', supplierId: supplier.id, quantity: 5, unit: 'KG', estimatedPrice: 10, notes: '' }],
      },
      user.id
    )) as { id: string }
    createdRequisitionIds.push(requisition.id)

    const before = await requisitionService.getById(requisition.id) as { approvedByName: string | null; approvedAt: string | null }
    expect(before.approvedByName).toBeNull()

    await requisitionService.changeStatus(requisition.id, 'sent', user.id)
    await requisitionService.changeStatus(requisition.id, 'approved', user.id)

    const after = await requisitionService.getById(requisition.id) as { approvedByName: string | null; approvedAt: Date | null }
    expect(after.approvedByName).toBe(user.name)
    expect(after.approvedAt).not.toBeNull()
  })

  it('3. purchaseOrderService.getById() expõe approvedByName/approvedAt após aprovar', async () => {
    const user = await createTestUser('po-approved-by')
    createdUserIds.push(user.id)
    const material = await createTestMaterial('po-approved-by')
    createdMaterialIds.push(material.id)
    const supplier = await createTestSupplier('po-approved-by')
    createdSupplierIds.push(supplier.id)

    const requisition = (await requisitionService.create(
      {
        tipo: 'PRODUCAO', originModule: 'manual', productionOrderId: null, neededBy: '', notes: '',
        items: [{ materialId: material.id, description: '', supplierId: supplier.id, quantity: 5, unit: 'KG', estimatedPrice: 10, notes: '' }],
      },
      user.id
    )) as { id: string; items: { id: string }[] }
    createdRequisitionIds.push(requisition.id)

    const full = await requisitionService.getById(requisition.id) as { items: { id: string }[] }
    const itemId = full.items[0].id
    const quote = (await requisitionService.createItemQuote(requisition.id, itemId, { supplierId: supplier.id, price: 10, leadTimeDays: 5 }, user.id)) as { id: string }
    await requisitionService.selectItemQuote(itemId, quote.id, user.id)

    await requisitionService.changeStatus(requisition.id, 'sent', user.id)
    await requisitionService.changeStatus(requisition.id, 'approved', user.id)
    const { generatedPurchaseOrders } = await requisitionService.changeStatus(requisition.id, 'ordered', user.id) as { generatedPurchaseOrders: { id: string }[] }
    createdPurchaseOrderIds.push(...generatedPurchaseOrders.map((po) => po.id))

    const poId = generatedPurchaseOrders[0].id
    const before = await purchaseOrderService.getById(poId) as { approvedByName: string | null }
    expect(before.approvedByName).toBeNull()

    await purchaseOrderService.changeStatus(poId, 'pending_approval', user.id)
    await purchaseOrderService.changeStatus(poId, 'approved', user.id)

    const after = await purchaseOrderService.getById(poId) as { approvedByName: string | null; approvedAt: Date | null }
    expect(after.approvedByName).toBe(user.name)
    expect(after.approvedAt).not.toBeNull()
  })
})
