import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { db } from '@/lib/db'
import { registerDomainEventHandlers } from '@/lib/register-domain-event-handlers'
import { quoteService } from '@/app/services/quote.service'
import { requisitionService } from '@/app/services/requisition.service'
import { createTestUser, createTestProduct, createTestMaterial, createTestSupplier } from './helpers/fixtures'

/**
 * Testes de integração dos 3 fluxos migrados para Eventos de Domínio (ADR-003, Fase 3.1).
 * Chamam os Services diretamente (sem HTTP) contra o banco de teste dedicado (.env.test) —
 * provam que o `DomainEventBus` real (com o singleton em `globalThis`) entrega o evento do
 * produtor para o consumidor e que o resultado retorna na resposta do Service, exatamente
 * como a chamada direta Service-a-Service fazia antes da Fase 3.
 */
describe('Fluxos via Eventos de Domínio', () => {
  const createdUserIds: string[] = []
  const createdProductIds: string[] = []
  const createdMaterialIds: string[] = []
  const createdSupplierIds: string[] = []
  const createdQuoteIds: string[] = []
  const createdSalesOrderIds: string[] = []
  const createdProductionOrderIds: string[] = []
  const createdRequisitionIds: string[] = []
  const createdPurchaseOrderIds: string[] = []

  beforeAll(() => {
    registerDomainEventHandlers()
  })

  afterAll(async () => {
    // Ordem importa por causa de FKs: filhos antes dos pais.
    await db.purchaseOrder.deleteMany({ where: { id: { in: createdPurchaseOrderIds } } })
    await db.requisition.deleteMany({ where: { id: { in: createdRequisitionIds } } })
    await db.productionOrder.deleteMany({ where: { id: { in: createdProductionOrderIds } } })
    await db.salesOrder.deleteMany({ where: { id: { in: createdSalesOrderIds } } })
    await db.quote.deleteMany({ where: { id: { in: createdQuoteIds } } })
    await db.supplier.deleteMany({ where: { id: { in: createdSupplierIds } } })
    await db.material.deleteMany({ where: { id: { in: createdMaterialIds } } })
    await db.product.deleteMany({ where: { id: { in: createdProductIds } } })
    await db.statusHistory.deleteMany({ where: { userId: { in: createdUserIds } } })
    await db.user.deleteMany({ where: { id: { in: createdUserIds } } })
  })

  it('Orçamento aprovado → Ordem de Produção criada (evento orcamento.aprovado)', async () => {
    const user = await createTestUser('op-flow')
    createdUserIds.push(user.id)
    const product = await createTestProduct('op-flow')
    createdProductIds.push(product.id)

    const quote = await quoteService.create(
      {
        status: 'draft',
        discountType: 'value',
        discountValue: 0,
        items: [{ productId: product.id, code: 'T1', description: 'Item de teste', quantity: 2, unit: 'UN', unitPrice: 10, notes: '' }],
      } as never,
      user.id
    )
    createdQuoteIds.push((quote as { id: string }).id)

    await quoteService.changeStatus((quote as { id: string }).id, 'sent', user.id)
    const result = await quoteService.changeStatus((quote as { id: string }).id, 'approved', user.id)

    const generated = result.generatedProductionOrders as unknown as Array<{ id: string; number: string; productId: string | null; status: string }>
    expect(generated).toHaveLength(1)
    createdProductionOrderIds.push(generated[0].id)

    const persisted = await db.productionOrder.findUnique({ where: { id: generated[0].id } })
    expect(persisted).not.toBeNull()
    expect(persisted?.productId).toBe(product.id)
    expect(persisted?.status).toBe('planned')
  })

  it('Orçamento aprovado → Pedido de Venda criado (evento orcamento.convertido_em_pedido_venda)', async () => {
    const user = await createTestUser('so-flow')
    createdUserIds.push(user.id)

    const quote = await quoteService.create(
      {
        status: 'draft',
        discountType: 'value',
        discountValue: 0,
        items: [{ productId: null, code: 'T2', description: 'Item avulso', quantity: 1, unit: 'UN', unitPrice: 50, notes: '' }],
      } as never,
      user.id
    )
    createdQuoteIds.push((quote as { id: string }).id)

    await quoteService.changeStatus((quote as { id: string }).id, 'sent', user.id)
    await quoteService.changeStatus((quote as { id: string }).id, 'approved', user.id)

    const salesOrder = (await quoteService.convertToSalesOrder((quote as { id: string }).id, user.id)) as { id: string; number: string }
    createdSalesOrderIds.push(salesOrder.id)

    // O prefixo ("PED-" etc.) é configuração de NumberSequence feita via admin, não existe
    // por padrão num banco de teste novo — só valida que um número foi gerado.
    expect(salesOrder.number).toBeTruthy()

    const persisted = await db.salesOrder.findUnique({ where: { id: salesOrder.id } })
    expect(persisted).not.toBeNull()
    expect(persisted?.quoteId).toBe((quote as { id: string }).id)
  })

  it('Requisição aprovada para compra → Pedido de Compra criado (evento requisicao.aprovada_para_compra)', async () => {
    const user = await createTestUser('po-flow')
    createdUserIds.push(user.id)
    const material = await createTestMaterial('po-flow')
    createdMaterialIds.push(material.id)
    const supplier = await createTestSupplier('po-flow')
    createdSupplierIds.push(supplier.id)

    const requisition = await requisitionService.create(
      {
        originModule: 'manual',
        neededBy: '',
        notes: 'Teste de fluxo via evento',
        items: [{ materialId: material.id, supplierId: supplier.id, quantity: 5, unit: 'KG', estimatedPrice: 10, notes: '' }],
      } as never,
      user.id
    )
    createdRequisitionIds.push((requisition as { id: string }).id)

    await requisitionService.changeStatus((requisition as { id: string }).id, 'sent', user.id)
    await requisitionService.changeStatus((requisition as { id: string }).id, 'approved', user.id)
    const result = await requisitionService.changeStatus((requisition as { id: string }).id, 'ordered', user.id)

    const generated = result.generatedPurchaseOrders as unknown as Array<{ id: string; number: string; supplierId: string }>
    expect(generated).toHaveLength(1)
    createdPurchaseOrderIds.push(generated[0].id)

    const persisted = await db.purchaseOrder.findUnique({ where: { id: generated[0].id } })
    expect(persisted).not.toBeNull()
    expect(persisted?.supplierId).toBe(supplier.id)
    expect(persisted?.requisitionId).toBe((requisition as { id: string }).id)
  })
})
