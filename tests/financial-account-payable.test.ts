import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { db } from '@/lib/db'
import { registerDomainEventHandlers } from '@/lib/register-domain-event-handlers'
import { requisitionService } from '@/app/services/requisition.service'
import { purchaseOrderService } from '@/app/services/purchase-order.service'
import { financialAccountService } from '@/app/services/financial-account.service'
import { createTestUser, createTestMaterial, createTestSupplier } from './helpers/fixtures'

/**
 * Fase 12 (ADR-016, Subetapa 1/3) — Contas a Pagar. Decisão pendente #2 resolvida: o gatilho é o
 * recebimento físico (evento `pedido_compra.recebido`, já existente desde a Fase 8/ADR-010, agora
 * com seu primeiro consumidor). `amount` sempre recalculado do zero a cada recebimento — nunca
 * incrementado — para ser resiliente a um handler eventualmente repetido.
 */
describe('Financeiro — Contas a Pagar (Fase 12, Subetapa 1/3)', () => {
  const createdUserIds: string[] = []
  const createdMaterialIds: string[] = []
  const createdSupplierIds: string[] = []
  const createdRequisitionIds: string[] = []
  const createdPurchaseOrderIds: string[] = []

  beforeAll(() => {
    registerDomainEventHandlers()
  })

  afterAll(async () => {
    await db.payment.deleteMany({ where: { accountPayable: { purchaseOrderId: { in: createdPurchaseOrderIds } } } })
    await db.accountPayable.deleteMany({ where: { purchaseOrderId: { in: createdPurchaseOrderIds } } })
    await db.stockMovement.deleteMany({ where: { referenceId: { in: createdPurchaseOrderIds } } })
    await db.materialBatch.deleteMany({ where: { materialId: { in: createdMaterialIds } } })
    await db.purchaseOrder.deleteMany({ where: { requisitionId: { in: createdRequisitionIds } } })
    await db.requisition.deleteMany({ where: { id: { in: createdRequisitionIds } } })
    await db.supplier.deleteMany({ where: { id: { in: createdSupplierIds } } })
    await db.material.deleteMany({ where: { id: { in: createdMaterialIds } } })
    await db.statusHistory.deleteMany({ where: { userId: { in: createdUserIds } } })
    await db.user.deleteMany({ where: { id: { in: createdUserIds } } })
  })

  /** Cria um Pedido de Compra confirmado (pronto para receber mercadoria), preço unitário fixo = 10. */
  async function createConfirmedPurchaseOrder(suffix: string, quantity = 10) {
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
      generatedPurchaseOrders: Array<{ id: string; number: string }>
    }
    const purchaseOrderId = result.generatedPurchaseOrders[0].id
    createdPurchaseOrderIds.push(purchaseOrderId)

    await purchaseOrderService.changeStatus(purchaseOrderId, 'pending_approval', user.id)
    await purchaseOrderService.changeStatus(purchaseOrderId, 'approved', user.id)
    await purchaseOrderService.changeStatus(purchaseOrderId, 'sent', user.id)
    await purchaseOrderService.changeStatus(purchaseOrderId, 'confirmed', user.id)

    const purchaseOrder = await db.purchaseOrder.findUnique({ where: { id: purchaseOrderId }, include: { items: true } })
    return { user, material, supplier, purchaseOrder: purchaseOrder! }
  }

  it('1. Recebimento parcial gera um título a pagar no valor exatamente recebido (não o total do pedido)', async () => {
    const { user, purchaseOrder } = await createConfirmedPurchaseOrder('ap-partial', 10)
    const item = purchaseOrder.items[0]

    await purchaseOrderService.receive(purchaseOrder.id, { items: [{ purchaseOrderItemId: item.id, quantityReceived: 4 }] }, user.id)

    const payable = await db.accountPayable.findUnique({ where: { purchaseOrderId: purchaseOrder.id } })
    expect(payable).not.toBeNull()
    expect(payable?.amount).toBe(40) // 4 * unitPrice 10
    expect(payable?.status).toBe('open')
  })

  it('2. Segundo recebimento parcial RECALCULA o valor do MESMO título (não cria um segundo)', async () => {
    const { user, purchaseOrder } = await createConfirmedPurchaseOrder('ap-recalc', 10)
    const item = purchaseOrder.items[0]

    await purchaseOrderService.receive(purchaseOrder.id, { items: [{ purchaseOrderItemId: item.id, quantityReceived: 4 }] }, user.id)
    const firstPayable = await db.accountPayable.findUnique({ where: { purchaseOrderId: purchaseOrder.id } })

    await purchaseOrderService.receive(purchaseOrder.id, { items: [{ purchaseOrderItemId: item.id, quantityReceived: 6 }] }, user.id)
    const allPayables = await db.accountPayable.findMany({ where: { purchaseOrderId: purchaseOrder.id } })
    const secondPayable = await db.accountPayable.findUnique({ where: { purchaseOrderId: purchaseOrder.id } })

    expect(allPayables).toHaveLength(1) // nunca duplica
    expect(secondPayable?.id).toBe(firstPayable?.id)
    expect(secondPayable?.amount).toBe(100) // 10 * unitPrice 10, total já recebido
  })

  it('3. registerPayment: pagamento parcial marca "partially_paid", total marca "paid"', async () => {
    const { user, purchaseOrder } = await createConfirmedPurchaseOrder('ap-payment', 10)
    const item = purchaseOrder.items[0]
    await purchaseOrderService.receive(purchaseOrder.id, { items: [{ purchaseOrderItemId: item.id, quantityReceived: 10 }] }, user.id)
    const payable = (await db.accountPayable.findUnique({ where: { purchaseOrderId: purchaseOrder.id } }))!
    expect(payable.amount).toBe(100)

    const afterPartial = await financialAccountService.registerPayment(payable.id, 40, new Date(), 'Pagamento 1', user.id)
    expect((afterPartial as { status: string }).status).toBe('partially_paid')

    const afterFull = await financialAccountService.registerPayment(payable.id, 60, new Date(), 'Pagamento 2', user.id)
    expect((afterFull as { status: string }).status).toBe('paid')

    const payments = await db.payment.findMany({ where: { accountPayableId: payable.id } })
    expect(payments).toHaveLength(2)
  })

  it('4. registerPayment rejeita valor que excede o saldo em aberto', async () => {
    const { user, purchaseOrder } = await createConfirmedPurchaseOrder('ap-overpay', 10)
    const item = purchaseOrder.items[0]
    await purchaseOrderService.receive(purchaseOrder.id, { items: [{ purchaseOrderItemId: item.id, quantityReceived: 10 }] }, user.id)
    const payable = (await db.accountPayable.findUnique({ where: { purchaseOrderId: purchaseOrder.id } }))!

    await expect(financialAccountService.registerPayment(payable.id, 999, new Date(), '', user.id)).rejects.toThrow()
  })

  it('5. registerPayment rejeita pagamento num título já "paid"', async () => {
    const { user, purchaseOrder } = await createConfirmedPurchaseOrder('ap-already-paid', 10)
    const item = purchaseOrder.items[0]
    await purchaseOrderService.receive(purchaseOrder.id, { items: [{ purchaseOrderItemId: item.id, quantityReceived: 10 }] }, user.id)
    const payable = (await db.accountPayable.findUnique({ where: { purchaseOrderId: purchaseOrder.id } }))!

    await financialAccountService.registerPayment(payable.id, 100, new Date(), '', user.id)
    await expect(financialAccountService.registerPayment(payable.id, 1, new Date(), '', user.id)).rejects.toThrow()
  })

  it('6. cancelPayable: permitido só em "open" (sem nenhum pagamento ainda)', async () => {
    const { user, purchaseOrder } = await createConfirmedPurchaseOrder('ap-cancel', 10)
    const item = purchaseOrder.items[0]
    await purchaseOrderService.receive(purchaseOrder.id, { items: [{ purchaseOrderItemId: item.id, quantityReceived: 10 }] }, user.id)
    const payable = (await db.accountPayable.findUnique({ where: { purchaseOrderId: purchaseOrder.id } }))!

    const cancelled = await financialAccountService.cancelPayable(payable.id, user.id)
    expect((cancelled as { status: string }).status).toBe('cancelled')
  })

  it('7. cancelPayable rejeita se já houver pagamento registrado', async () => {
    const { user, purchaseOrder } = await createConfirmedPurchaseOrder('ap-cancel-blocked', 10)
    const item = purchaseOrder.items[0]
    await purchaseOrderService.receive(purchaseOrder.id, { items: [{ purchaseOrderItemId: item.id, quantityReceived: 10 }] }, user.id)
    const payable = (await db.accountPayable.findUnique({ where: { purchaseOrderId: purchaseOrder.id } }))!

    await financialAccountService.registerPayment(payable.id, 10, new Date(), '', user.id)
    await expect(financialAccountService.cancelPayable(payable.id, user.id)).rejects.toThrow()
  })

  it('8. AuditLog registra a criação do título a pagar', async () => {
    const { user, purchaseOrder } = await createConfirmedPurchaseOrder('ap-audit', 10)
    const item = purchaseOrder.items[0]
    await purchaseOrderService.receive(purchaseOrder.id, { items: [{ purchaseOrderItemId: item.id, quantityReceived: 10 }] }, user.id)
    const payable = (await db.accountPayable.findUnique({ where: { purchaseOrderId: purchaseOrder.id } }))!

    const logs = await db.auditLog.findMany({ where: { entityId: payable.id, module: 'financeiro', action: 'CREATE' } })
    expect(logs).toHaveLength(1)
  })
})
