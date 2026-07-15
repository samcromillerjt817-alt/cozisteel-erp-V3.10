import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { db } from '@/lib/db'
import { registerDomainEventHandlers } from '@/lib/register-domain-event-handlers'
import { requisitionService } from '@/app/services/requisition.service'
import { purchaseOrderService } from '@/app/services/purchase-order.service'
import { createTestUser, createTestMaterial, createTestSupplier } from './helpers/fixtures'

/**
 * Fase 8 (ADR-010): máquina de estados de aprovação do Pedido de Compra —
 * draft → pending_approval → approved → sent → confirmed → partially_received → received,
 * com pending_approval → draft (rejeição) e cancelled a partir de qualquer estado não-terminal.
 * "approved" é só autorização interna; "sent" é o envio de fato ao fornecedor — os dois nunca
 * se confundem.
 */
describe('Pedido de Compra — Aprovação (Fase 8)', () => {
  const createdUserIds: string[] = []
  const createdMaterialIds: string[] = []
  const createdSupplierIds: string[] = []
  const createdRequisitionIds: string[] = []
  const createdPurchaseOrderIds: string[] = []

  beforeAll(() => {
    registerDomainEventHandlers()
  })

  afterAll(async () => {
    await db.stockMovement.deleteMany({ where: { referenceId: { in: createdPurchaseOrderIds } } })
    // Fase 12 (ADR-016): recebimento agora também gera/atualiza AccountPayable via evento
    // pedido_compra.recebido — precisa ser limpo antes do PurchaseOrder (FK sem cascade, de
    // propósito: um título financeiro nunca deve sumir só porque o pedido de origem foi apagado).
    await db.payment.deleteMany({ where: { accountPayable: { purchaseOrderId: { in: createdPurchaseOrderIds } } } })
    await db.accountPayable.deleteMany({ where: { purchaseOrderId: { in: createdPurchaseOrderIds } } })
    await db.purchaseOrder.deleteMany({ where: { requisitionId: { in: createdRequisitionIds } } }) // cascade: PurchaseOrderItem
    await db.requisition.deleteMany({ where: { id: { in: createdRequisitionIds } } })
    await db.supplier.deleteMany({ where: { id: { in: createdSupplierIds } } })
    await db.material.deleteMany({ where: { id: { in: createdMaterialIds } } })
    await db.statusHistory.deleteMany({ where: { userId: { in: createdUserIds } } })
    await db.user.deleteMany({ where: { id: { in: createdUserIds } } })
  })

  /** Cria uma Requisição de Produção com 1 item, avança até "ordered" e devolve o Pedido de Compra gerado (em "draft"). */
  async function createDraftPurchaseOrder(suffix: string, quantity = 10) {
    const user = await createTestUser(suffix)
    createdUserIds.push(user.id)
    const material = await createTestMaterial(suffix)
    createdMaterialIds.push(material.id)
    const supplier = await createTestSupplier(suffix)
    createdSupplierIds.push(supplier.id)

    const requisition = (await requisitionService.create(
      {
        tipo: 'PRODUCAO',
        originModule: 'manual',
        productionOrderId: null,
        neededBy: '',
        notes: '',
        items: [{ materialId: material.id, description: '', supplierId: supplier.id, quantity, unit: 'KG', estimatedPrice: 10, notes: '' }],
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
    return { user, material, supplier, requisition, purchaseOrder }
  }

  it('1. Criação: Pedido de Compra nasce sempre em "draft", nunca aprovado', async () => {
    const { purchaseOrder } = await createDraftPurchaseOrder('po-approval-create')
    const persisted = await db.purchaseOrder.findUnique({ where: { id: purchaseOrder.id } })
    expect(persisted?.status).toBe('draft')
    expect(persisted?.approvedBy).toBeNull()
    expect(persisted?.approvedAt).toBeNull()
  })

  it('2. draft → pending_approval', async () => {
    const { user, purchaseOrder } = await createDraftPurchaseOrder('po-approval-pending')
    const updated = (await purchaseOrderService.changeStatus(purchaseOrder.id, 'pending_approval', user.id)) as { status: string }
    expect(updated.status).toBe('pending_approval')
  })

  it('3. pending_approval → approved: grava approvedBy/approvedAt (autorização interna, não envio)', async () => {
    const { user, purchaseOrder } = await createDraftPurchaseOrder('po-approval-approve')
    await purchaseOrderService.changeStatus(purchaseOrder.id, 'pending_approval', user.id)
    const updated = (await purchaseOrderService.changeStatus(purchaseOrder.id, 'approved', user.id)) as {
      status: string
      approvedBy: string | null
      approvedAt: Date | null
      sentAt: Date | null
    }
    expect(updated.status).toBe('approved')
    expect(updated.approvedBy).toBe(user.id)
    expect(updated.approvedAt).not.toBeNull()
    expect(updated.sentAt).toBeNull() // aprovado != enviado ao fornecedor
  })

  it('4. pending_approval → draft (rejeição): volta para edição, não apaga approvedBy (que nunca foi setado)', async () => {
    const { user, purchaseOrder } = await createDraftPurchaseOrder('po-approval-reject')
    await purchaseOrderService.changeStatus(purchaseOrder.id, 'pending_approval', user.id)
    const rejected = (await purchaseOrderService.changeStatus(purchaseOrder.id, 'draft', user.id)) as { status: string; approvedBy: string | null }
    expect(rejected.status).toBe('draft')
    expect(rejected.approvedBy).toBeNull()
  })

  it('5. approved → sent: sentAt gravado, representa o envio de fato ao fornecedor', async () => {
    const { user, purchaseOrder } = await createDraftPurchaseOrder('po-approval-sent')
    await purchaseOrderService.changeStatus(purchaseOrder.id, 'pending_approval', user.id)
    await purchaseOrderService.changeStatus(purchaseOrder.id, 'approved', user.id)
    const sent = (await purchaseOrderService.changeStatus(purchaseOrder.id, 'sent', user.id)) as { status: string; sentAt: Date | null }
    expect(sent.status).toBe('sent')
    expect(sent.sentAt).not.toBeNull()
  })

  it('6. Transições inválidas são rejeitadas', async () => {
    const { user, purchaseOrder } = await createDraftPurchaseOrder('po-approval-invalid')

    await expect(purchaseOrderService.changeStatus(purchaseOrder.id, 'sent', user.id)).rejects.toThrow() // draft → sent direto não existe mais
    await expect(purchaseOrderService.changeStatus(purchaseOrder.id, 'approved', user.id)).rejects.toThrow() // draft → approved direto

    await purchaseOrderService.changeStatus(purchaseOrder.id, 'pending_approval', user.id)
    await purchaseOrderService.changeStatus(purchaseOrder.id, 'approved', user.id)

    await expect(purchaseOrderService.changeStatus(purchaseOrder.id, 'pending_approval', user.id)).rejects.toThrow() // approved não volta

    await purchaseOrderService.changeStatus(purchaseOrder.id, 'sent', user.id)
    await expect(purchaseOrderService.changeStatus(purchaseOrder.id, 'approved', user.id)).rejects.toThrow() // sent não volta para approved
  })

  it('7. Cancelamento é permitido a partir de todo estado não-terminal', async () => {
    const scenarios: Array<(poId: string, userId: string) => Promise<void>> = [
      async () => {}, // draft
      async (poId, userId) => {
        await purchaseOrderService.changeStatus(poId, 'pending_approval', userId)
      },
      async (poId, userId) => {
        await purchaseOrderService.changeStatus(poId, 'pending_approval', userId)
        await purchaseOrderService.changeStatus(poId, 'approved', userId)
      },
      async (poId, userId) => {
        await purchaseOrderService.changeStatus(poId, 'pending_approval', userId)
        await purchaseOrderService.changeStatus(poId, 'approved', userId)
        await purchaseOrderService.changeStatus(poId, 'sent', userId)
      },
    ]

    for (let i = 0; i < scenarios.length; i++) {
      const { user, purchaseOrder } = await createDraftPurchaseOrder(`po-approval-cancel-${i}`)
      await scenarios[i](purchaseOrder.id, user.id)
      const cancelled = (await purchaseOrderService.changeStatus(purchaseOrder.id, 'cancelled', user.id)) as { status: string; cancelledAt: Date | null }
      expect(cancelled.status).toBe('cancelled')
      expect(cancelled.cancelledAt).not.toBeNull()
    }
  })

  it('8. StatusHistory registra toda transição', async () => {
    const { user, purchaseOrder } = await createDraftPurchaseOrder('po-approval-history')
    await purchaseOrderService.changeStatus(purchaseOrder.id, 'pending_approval', user.id)

    const history = await db.statusHistory.findMany({ where: { entityType: 'purchase_order', entityId: purchaseOrder.id } })
    expect(history).toHaveLength(1)
    expect(history[0].fromStatus).toBe('draft')
    expect(history[0].toStatus).toBe('pending_approval')
  })

  it('9. AuditLog registra a transição com beforeValue/afterValue', async () => {
    const { user, purchaseOrder } = await createDraftPurchaseOrder('po-approval-audit')
    await purchaseOrderService.changeStatus(purchaseOrder.id, 'pending_approval', user.id)

    const logs = await db.auditLog.findMany({ where: { entityId: purchaseOrder.id, module: 'compras', action: 'PATCH' } })
    expect(logs).toHaveLength(1)
    expect(logs[0].beforeValue).toEqual({ status: 'draft' })
    expect(logs[0].afterValue).toEqual({ status: 'pending_approval' })
  })

  it('10/11. Fluxo completo compatível com Requisição e Recebimento: draft→...→received move estoque só no recebimento', async () => {
    const { user, material, purchaseOrder } = await createDraftPurchaseOrder('po-approval-full-flow', 20)
    const stockBefore = (await db.material.findUnique({ where: { id: material.id } }))?.stockQty ?? 0

    await purchaseOrderService.changeStatus(purchaseOrder.id, 'pending_approval', user.id)
    const afterApproval = (await purchaseOrderService.changeStatus(purchaseOrder.id, 'approved', user.id)) as { status: string }
    expect(afterApproval.status).toBe('approved')
    // Aprovação não move estoque
    expect((await db.material.findUnique({ where: { id: material.id } }))?.stockQty).toBe(stockBefore)

    const afterSent = (await purchaseOrderService.changeStatus(purchaseOrder.id, 'sent', user.id)) as { status: string }
    expect(afterSent.status).toBe('sent')
    // Envio não move estoque
    expect((await db.material.findUnique({ where: { id: material.id } }))?.stockQty).toBe(stockBefore)

    const afterConfirmed = (await purchaseOrderService.changeStatus(purchaseOrder.id, 'confirmed', user.id)) as { status: string }
    expect(afterConfirmed.status).toBe('confirmed')
    // Confirmação não move estoque
    expect((await db.material.findUnique({ where: { id: material.id } }))?.stockQty).toBe(stockBefore)

    const poWithItems = await db.purchaseOrder.findUnique({ where: { id: purchaseOrder.id }, include: { items: true } })
    const item = poWithItems!.items[0]

    const received = await purchaseOrderService.receive(
      purchaseOrder.id,
      { items: [{ purchaseOrderItemId: item.id, quantityReceived: item.quantity }] },
      user.id
    )
    expect((received as { status: string }).status).toBe('received')

    // Só o recebimento move estoque
    const stockAfter = (await db.material.findUnique({ where: { id: material.id } }))?.stockQty ?? 0
    expect(stockAfter).toBe(stockBefore + item.quantity)

    const movements = await db.stockMovement.findMany({ where: { referenceId: purchaseOrder.id, type: 'IN' } })
    expect(movements).toHaveLength(1)
    expect(movements[0].quantity).toBe(item.quantity)
  })
})
