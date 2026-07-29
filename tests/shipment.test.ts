import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { db } from '@/lib/db'
import { registerDomainEventHandlers } from '@/lib/register-domain-event-handlers'
import { quoteService } from '@/app/services/quote.service'
import { salesOrderService } from '@/app/services/sales-order.service'
import { shipmentService } from '@/app/services/shipment.service'
import { createTestUser } from './helpers/fixtures'

/**
 * ADR-023 (item 6, Decisão #3) — Expedição: entidade própria, máquina de estados separada da do
 * Pedido de Venda. Quantidades somadas de Shipments não canceladas decidem sozinhas se o Pedido está
 * "partially_fulfilled" ou "completed" — nunca uma escolha manual.
 */
describe('Expedição (ADR-023, item 6)', () => {
  const createdUserIds: string[] = []
  const createdQuoteIds: string[] = []
  const createdSalesOrderIds: string[] = []
  const createdShipmentIds: string[] = []

  beforeAll(() => {
    registerDomainEventHandlers()
  })

  afterAll(async () => {
    await db.shipmentItem.deleteMany({ where: { shipmentId: { in: createdShipmentIds } } })
    await db.shipment.deleteMany({ where: { id: { in: createdShipmentIds } } })
    await db.salesOrder.deleteMany({ where: { id: { in: createdSalesOrderIds } } })
    await db.quote.deleteMany({ where: { id: { in: createdQuoteIds } } })
    await db.statusHistory.deleteMany({ where: { userId: { in: createdUserIds } } })
    await db.user.deleteMany({ where: { id: { in: createdUserIds } } })
  })

  async function createSalesOrder(suffix: string, quantity = 10) {
    const user = await createTestUser(suffix)
    createdUserIds.push(user.id)

    const quote = (await quoteService.create(
      {
        status: 'draft', discountType: 'value', discountValue: 0, paymentTerms: '',
        items: [{ productId: null, code: 'EXP-1', description: 'Item de teste', quantity, unit: 'UN', unitPrice: 100, notes: '' }],
      } as never,
      user.id
    )) as { id: string }
    createdQuoteIds.push(quote.id)

    await quoteService.changeStatus(quote.id, 'sent', user.id)
    await quoteService.changeStatus(quote.id, 'approved', user.id)
    const salesOrder = (await quoteService.convertToSalesOrder(quote.id, user.id)) as { id: string; number: string }
    createdSalesOrderIds.push(salesOrder.id)

    const item = await db.salesOrderItem.findFirstOrThrow({ where: { salesOrderId: salesOrder.id } })
    return { user, salesOrder, itemId: item.id }
  }

  it('1. Recusa criar expedição enquanto o Pedido não está "Pronto para expedição"', async () => {
    const { user, salesOrder, itemId } = await createSalesOrder('shipment-not-ready')

    await expect(
      shipmentService.create(salesOrder.id, { carrier: '', vehiclePlate: '', driverName: '', scheduledDate: null, notes: '', items: [{ salesOrderItemId: itemId, quantity: 5 }] }, user.id)
    ).rejects.toThrow(/Pronto para expedição/)
  })

  it('2. Cria expedição parcial: Pedido vira partially_fulfilled só depois do status "shipped", nunca antes', async () => {
    const { user, salesOrder, itemId } = await createSalesOrder('shipment-partial', 10)
    await salesOrderService.changeStatus(salesOrder.id, 'in_production', user.id)
    await salesOrderService.changeStatus(salesOrder.id, 'ready_for_shipping', user.id)

    const shipment = (await shipmentService.create(
      salesOrder.id, { carrier: 'Transportadora X', vehiclePlate: 'ABC1234', driverName: 'João', scheduledDate: null, notes: '', items: [{ salesOrderItemId: itemId, quantity: 4 }] }, user.id
    )) as { id: string; status: string }
    createdShipmentIds.push(shipment.id)
    expect(shipment.status).toBe('draft')

    let refreshed = await db.salesOrder.findUnique({ where: { id: salesOrder.id } })
    expect(refreshed?.status).toBe('ready_for_shipping') // criar a expedição ainda não move o Pedido

    await shipmentService.changeStatus(shipment.id, 'picking', user.id)
    await shipmentService.changeStatus(shipment.id, 'ready', user.id)
    refreshed = await db.salesOrder.findUnique({ where: { id: salesOrder.id } })
    expect(refreshed?.status).toBe('ready_for_shipping') // "ready" da expedição ainda não é "shipped"

    await shipmentService.changeStatus(shipment.id, 'shipped', user.id)
    refreshed = await db.salesOrder.findUnique({ where: { id: salesOrder.id } })
    expect(refreshed?.status).toBe('partially_fulfilled') // 4 de 10 expedidos
  })

  it('3. Segunda expedição completando o saldo: Pedido vira completed', async () => {
    const { user, salesOrder, itemId } = await createSalesOrder('shipment-complete', 10)
    await salesOrderService.changeStatus(salesOrder.id, 'in_production', user.id)
    await salesOrderService.changeStatus(salesOrder.id, 'ready_for_shipping', user.id)

    const shipment1 = (await shipmentService.create(
      salesOrder.id, { carrier: '', vehiclePlate: '', driverName: '', scheduledDate: null, notes: '', items: [{ salesOrderItemId: itemId, quantity: 6 }] }, user.id
    )) as { id: string }
    createdShipmentIds.push(shipment1.id)
    await shipmentService.changeStatus(shipment1.id, 'picking', user.id)
    await shipmentService.changeStatus(shipment1.id, 'ready', user.id)
    await shipmentService.changeStatus(shipment1.id, 'shipped', user.id)

    let refreshed = await db.salesOrder.findUnique({ where: { id: salesOrder.id } })
    expect(refreshed?.status).toBe('partially_fulfilled')

    const shipment2 = (await shipmentService.create(
      salesOrder.id, { carrier: '', vehiclePlate: '', driverName: '', scheduledDate: null, notes: '', items: [{ salesOrderItemId: itemId, quantity: 4 }] }, user.id
    )) as { id: string }
    createdShipmentIds.push(shipment2.id)
    await shipmentService.changeStatus(shipment2.id, 'picking', user.id)
    await shipmentService.changeStatus(shipment2.id, 'ready', user.id)
    await shipmentService.changeStatus(shipment2.id, 'shipped', user.id)

    refreshed = await db.salesOrder.findUnique({ where: { id: salesOrder.id } })
    expect(refreshed?.status).toBe('completed')
  })

  it('4. Recusa expedir quantidade acima do saldo restante (idempotência, mesmo padrão do Faturamento)', async () => {
    const { user, salesOrder, itemId } = await createSalesOrder('shipment-over', 10)
    await salesOrderService.changeStatus(salesOrder.id, 'in_production', user.id)
    await salesOrderService.changeStatus(salesOrder.id, 'ready_for_shipping', user.id)

    await expect(
      shipmentService.create(salesOrder.id, { carrier: '', vehiclePlate: '', driverName: '', scheduledDate: null, notes: '', items: [{ salesOrderItemId: itemId, quantity: 15 }] }, user.id)
    ).rejects.toThrow(/excede o saldo restante/)
  })

  it('5. "shipped" não pode ser cancelada (mercadoria já saiu); "draft" pode', async () => {
    const { user, salesOrder, itemId } = await createSalesOrder('shipment-cancel', 10)
    await salesOrderService.changeStatus(salesOrder.id, 'in_production', user.id)
    await salesOrderService.changeStatus(salesOrder.id, 'ready_for_shipping', user.id)

    const shipment = (await shipmentService.create(
      salesOrder.id, { carrier: '', vehiclePlate: '', driverName: '', scheduledDate: null, notes: '', items: [{ salesOrderItemId: itemId, quantity: 5 }] }, user.id
    )) as { id: string }
    createdShipmentIds.push(shipment.id)

    const cancelled = (await shipmentService.changeStatus(shipment.id, 'cancelled', user.id)) as { status: string }
    expect(cancelled.status).toBe('cancelled')

    const shipment2 = (await shipmentService.create(
      salesOrder.id, { carrier: '', vehiclePlate: '', driverName: '', scheduledDate: null, notes: '', items: [{ salesOrderItemId: itemId, quantity: 5 }] }, user.id
    )) as { id: string }
    createdShipmentIds.push(shipment2.id)
    await shipmentService.changeStatus(shipment2.id, 'picking', user.id)
    await shipmentService.changeStatus(shipment2.id, 'ready', user.id)
    await shipmentService.changeStatus(shipment2.id, 'shipped', user.id)

    await expect(shipmentService.changeStatus(shipment2.id, 'cancelled', user.id)).rejects.toThrow()
  })

  it('6. Expedição cancelada não conta no saldo — o mesmo item pode ser expedido de novo integralmente', async () => {
    const { user, salesOrder, itemId } = await createSalesOrder('shipment-cancel-balance', 10)
    await salesOrderService.changeStatus(salesOrder.id, 'in_production', user.id)
    await salesOrderService.changeStatus(salesOrder.id, 'ready_for_shipping', user.id)

    const shipment1 = (await shipmentService.create(
      salesOrder.id, { carrier: '', vehiclePlate: '', driverName: '', scheduledDate: null, notes: '', items: [{ salesOrderItemId: itemId, quantity: 10 }] }, user.id
    )) as { id: string }
    createdShipmentIds.push(shipment1.id)
    await shipmentService.changeStatus(shipment1.id, 'cancelled', user.id)

    const balance = await shipmentService.getShippableBalance(salesOrder.id)
    expect(balance[0].quantityRemaining).toBe(10)
  })

  it('7. Bloqueia cancelar o Pedido de Venda com expedição ativa vinculada', async () => {
    const { user, salesOrder, itemId } = await createSalesOrder('shipment-so-cancel-block', 10)
    await salesOrderService.changeStatus(salesOrder.id, 'in_production', user.id)
    await salesOrderService.changeStatus(salesOrder.id, 'ready_for_shipping', user.id)

    const shipment = (await shipmentService.create(
      salesOrder.id, { carrier: '', vehiclePlate: '', driverName: '', scheduledDate: null, notes: '', items: [{ salesOrderItemId: itemId, quantity: 5 }] }, user.id
    )) as { id: string }
    createdShipmentIds.push(shipment.id)

    await expect(salesOrderService.changeStatus(salesOrder.id, 'cancelled', user.id)).rejects.toThrow(/Expedição/)
  })

  it('8. Não bloqueia cancelar o Pedido quando a única expedição vinculada já está cancelada', async () => {
    const { user, salesOrder, itemId } = await createSalesOrder('shipment-so-cancel-ok', 10)
    await salesOrderService.changeStatus(salesOrder.id, 'in_production', user.id)
    await salesOrderService.changeStatus(salesOrder.id, 'ready_for_shipping', user.id)

    const shipment = (await shipmentService.create(
      salesOrder.id, { carrier: '', vehiclePlate: '', driverName: '', scheduledDate: null, notes: '', items: [{ salesOrderItemId: itemId, quantity: 5 }] }, user.id
    )) as { id: string }
    createdShipmentIds.push(shipment.id)
    await shipmentService.changeStatus(shipment.id, 'cancelled', user.id)

    const cancelledOrder = (await salesOrderService.changeStatus(salesOrder.id, 'cancelled', user.id)) as { status: string }
    expect(cancelledOrder.status).toBe('cancelled')
  })

  it('9. "in_production" não avança mais direto para "completed" (removido de propósito, ADR-023 item 6)', async () => {
    const { user, salesOrder } = await createSalesOrder('shipment-no-direct-complete', 10)
    await salesOrderService.changeStatus(salesOrder.id, 'in_production', user.id)

    await expect(salesOrderService.changeStatus(salesOrder.id, 'completed', user.id)).rejects.toThrow()
  })

  it('10. Só matéria-prima de expedição editável enquanto draft/picking; trava depois de "ready"', async () => {
    const { user, salesOrder, itemId } = await createSalesOrder('shipment-edit-lock', 10)
    await salesOrderService.changeStatus(salesOrder.id, 'in_production', user.id)
    await salesOrderService.changeStatus(salesOrder.id, 'ready_for_shipping', user.id)

    const shipment = (await shipmentService.create(
      salesOrder.id, { carrier: 'A', vehiclePlate: '', driverName: '', scheduledDate: null, notes: '', items: [{ salesOrderItemId: itemId, quantity: 5 }] }, user.id
    )) as { id: string }
    createdShipmentIds.push(shipment.id)

    const updated = (await shipmentService.update(shipment.id, { carrier: 'B', vehiclePlate: '', driverName: '', scheduledDate: null, proofDocument: '', notes: '' })) as { carrier: string }
    expect(updated.carrier).toBe('B')

    await shipmentService.changeStatus(shipment.id, 'picking', user.id)
    await shipmentService.changeStatus(shipment.id, 'ready', user.id)

    await expect(
      shipmentService.update(shipment.id, { carrier: 'C', vehiclePlate: '', driverName: '', scheduledDate: null, proofDocument: '', notes: '' })
    ).rejects.toThrow(/rascunho ou em separação/)
  })

  /**
   * Achado numa avaliação end-to-end (2026-07-29): `new Date("05/09/2026")` era interpretado como
   * mm/dd/aaaa americano (9 de maio) em vez de 5 de setembro. `parseApiDate` (src/lib/format.ts)
   * corrige isso aceitando tanto ISO (o que `<input type="date">` já envia) quanto dd/mm/aaaa.
   */
  it('9. scheduledDate aceita ISO (aaaa-mm-dd) sem ambiguidade', async () => {
    const { user, salesOrder, itemId } = await createSalesOrder('shipment-date-iso', 10)
    await salesOrderService.changeStatus(salesOrder.id, 'in_production', user.id)
    await salesOrderService.changeStatus(salesOrder.id, 'ready_for_shipping', user.id)

    const shipment = (await shipmentService.create(
      salesOrder.id,
      { carrier: '', vehiclePlate: '', driverName: '', scheduledDate: '2026-09-05', notes: '', items: [{ salesOrderItemId: itemId, quantity: 5 }] },
      user.id
    )) as { id: string; scheduledDate: Date }
    createdShipmentIds.push(shipment.id)

    expect(shipment.scheduledDate.getUTCMonth()).toBe(8) // setembro (0-indexed)
    expect(shipment.scheduledDate.getUTCDate()).toBe(5)
  })

  it('10. scheduledDate aceita dd/mm/aaaa sem confundir com mm/dd (bug corrigido)', async () => {
    const { user, salesOrder, itemId } = await createSalesOrder('shipment-date-br', 10)
    await salesOrderService.changeStatus(salesOrder.id, 'in_production', user.id)
    await salesOrderService.changeStatus(salesOrder.id, 'ready_for_shipping', user.id)

    const shipment = (await shipmentService.create(
      salesOrder.id,
      { carrier: '', vehiclePlate: '', driverName: '', scheduledDate: '05/09/2026', notes: '', items: [{ salesOrderItemId: itemId, quantity: 5 }] },
      user.id
    )) as { id: string; scheduledDate: Date }
    createdShipmentIds.push(shipment.id)

    // 05/09/2026 é 5 de SETEMBRO (mês 9, índice 8) — nunca 9 de maio (o bug antigo interpretava
    // como mm/dd americano).
    expect(shipment.scheduledDate.getMonth()).toBe(8)
    expect(shipment.scheduledDate.getDate()).toBe(5)
  })

  it('11. scheduledDate inválida é rejeitada com erro claro, não silenciosamente aceita', async () => {
    const { user, salesOrder, itemId } = await createSalesOrder('shipment-date-invalid', 10)
    await salesOrderService.changeStatus(salesOrder.id, 'in_production', user.id)
    await salesOrderService.changeStatus(salesOrder.id, 'ready_for_shipping', user.id)

    await expect(
      shipmentService.create(
        salesOrder.id,
        { carrier: '', vehiclePlate: '', driverName: '', scheduledDate: 'nao é uma data', notes: '', items: [{ salesOrderItemId: itemId, quantity: 5 }] },
        user.id
      )
    ).rejects.toThrow(/Data prevista inválida/)
  })
})
