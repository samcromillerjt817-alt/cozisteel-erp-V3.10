import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { db } from '@/lib/db'
import { registerDomainEventHandlers } from '@/lib/register-domain-event-handlers'
import { mrpSuggestionService } from '@/app/services/mrp-suggestion.service'
import { requisitionService } from '@/app/services/requisition.service'
import { createTestUser, createTestMaterial, createTestProduct, createTestSupplier } from './helpers/fixtures'

/**
 * Fase 7, Subetapa 3 (ADR-009): MrpSuggestion aprovada pelo usuário vira Requisição Tipo="PRODUCAO",
 * originModule="mrp" — nunca automático, sempre uma ação humana explícita
 * (mrpSuggestionService.approve()). A Requisição resultante pula a regra de atendimento por
 * estoque (Subetapa 2): o MRP já fez esse netting no próprio cálculo.
 */
describe('MRP → Requisição — Aprovação de Sugestão (Subetapa 3)', () => {
  const createdUserIds: string[] = []
  const createdMaterialIds: string[] = []
  const createdProductIds: string[] = []
  const createdSupplierIds: string[] = []
  const createdRunIds: string[] = []
  const createdRequisitionIds: string[] = []
  let runCounter = 0

  beforeAll(() => {
    registerDomainEventHandlers()
  })

  afterAll(async () => {
    await db.purchaseOrder.deleteMany({ where: { requisitionId: { in: createdRequisitionIds } } }) // cascade: PurchaseOrderItem
    await db.requisition.deleteMany({ where: { id: { in: createdRequisitionIds } } })
    await db.mrpRun.deleteMany({ where: { id: { in: createdRunIds } } }) // cascade: MrpSuggestion
    await db.supplier.deleteMany({ where: { id: { in: createdSupplierIds } } })
    await db.material.deleteMany({ where: { id: { in: createdMaterialIds } } })
    await db.product.deleteMany({ where: { id: { in: createdProductIds } } })
    await db.statusHistory.deleteMany({ where: { userId: { in: createdUserIds } } })
    await db.user.deleteMany({ where: { id: { in: createdUserIds } } })
  })

  async function createRun(userId: string) {
    runCounter += 1
    const run = await db.mrpRun.create({ data: { number: `MRP-APPROVAL-${runCounter}`, userId } })
    createdRunIds.push(run.id)
    return run
  }

  it('Aprovar uma sugestão de compra gera Requisição Tipo=PRODUCAO, originModule=mrp, com o fornecedor sugerido', async () => {
    const user = await createTestUser('mrp-approve-purchase')
    createdUserIds.push(user.id)
    const material = await createTestMaterial('mrp-approve-purchase')
    createdMaterialIds.push(material.id)
    const supplier = await createTestSupplier('mrp-approve-purchase')
    createdSupplierIds.push(supplier.id)
    const run = await createRun(user.id)

    const suggestion = await db.mrpSuggestion.create({
      data: {
        mrpRunId: run.id,
        suggestionType: 'purchase',
        itemType: 'material',
        materialId: material.id,
        quantityNeeded: 50,
        quantityAvailable: 0,
        quantityReserved: 0,
        quantityShortfall: 50,
        supplierId: supplier.id,
      },
    })

    const requisition = (await mrpSuggestionService.approve(suggestion.id, user.id)) as { id: string; tipo: string; originModule: string; items: Array<{ materialId: string | null; quantity: number; supplierId: string | null; originMrpSuggestionId: string | null }> }
    createdRequisitionIds.push(requisition.id)

    expect(requisition.tipo).toBe('PRODUCAO')
    expect(requisition.originModule).toBe('mrp')
    expect(requisition.items).toHaveLength(1)
    expect(requisition.items[0].materialId).toBe(material.id)
    expect(requisition.items[0].quantity).toBe(50)
    expect(requisition.items[0].supplierId).toBe(supplier.id)
    expect(requisition.items[0].originMrpSuggestionId).toBe(suggestion.id)

    const updatedSuggestion = await db.mrpSuggestion.findUnique({ where: { id: suggestion.id } })
    expect(updatedSuggestion?.status).toBe('accepted')
  })

  it('Aprovar a mesma sugestão duas vezes falha na segunda tentativa', async () => {
    const user = await createTestUser('mrp-approve-twice')
    createdUserIds.push(user.id)
    const material = await createTestMaterial('mrp-approve-twice')
    createdMaterialIds.push(material.id)
    const run = await createRun(user.id)

    const suggestion = await db.mrpSuggestion.create({
      data: { mrpRunId: run.id, suggestionType: 'purchase', itemType: 'material', materialId: material.id, quantityNeeded: 10, quantityAvailable: 0, quantityReserved: 0, quantityShortfall: 10 },
    })

    const requisition = (await mrpSuggestionService.approve(suggestion.id, user.id)) as { id: string }
    createdRequisitionIds.push(requisition.id)

    await expect(mrpSuggestionService.approve(suggestion.id, user.id)).rejects.toThrow(/já foi tratada/)
  })

  it('Sugestão de produção não pode virar Requisição nesta fase', async () => {
    const user = await createTestUser('mrp-approve-production')
    createdUserIds.push(user.id)
    const product = await createTestProduct('mrp-approve-production')
    createdProductIds.push(product.id)
    const run = await createRun(user.id)

    const suggestion = await db.mrpSuggestion.create({
      data: { mrpRunId: run.id, suggestionType: 'production', itemType: 'product', productId: product.id, quantityNeeded: 10, quantityAvailable: 0, quantityReserved: 0, quantityShortfall: 10 },
    })

    await expect(mrpSuggestionService.approve(suggestion.id, user.id)).rejects.toThrow(/Só sugestões de compra/)
  })

  it('Descartar uma sugestão pendente marca status=dismissed', async () => {
    const user = await createTestUser('mrp-dismiss')
    createdUserIds.push(user.id)
    const material = await createTestMaterial('mrp-dismiss')
    createdMaterialIds.push(material.id)
    const run = await createRun(user.id)

    const suggestion = await db.mrpSuggestion.create({
      data: { mrpRunId: run.id, suggestionType: 'purchase', itemType: 'material', materialId: material.id, quantityNeeded: 5, quantityAvailable: 0, quantityReserved: 0, quantityShortfall: 5 },
    })

    await mrpSuggestionService.dismiss(suggestion.id, user.id)
    const updated = await db.mrpSuggestion.findUnique({ where: { id: suggestion.id } })
    expect(updated?.status).toBe('dismissed')
  })

  it('Requisição originada do MRP pula a regra de atendimento por estoque ao avançar para "ordered"', async () => {
    const user = await createTestUser('mrp-skip-stock-check')
    createdUserIds.push(user.id)
    const material = await createTestMaterial('mrp-skip-stock-check')
    createdMaterialIds.push(material.id)
    // Estoque físico existe, mas a Requisição vinda do MRP NÃO deve reconsultá-lo — o motor já netou isso.
    await db.material.update({ where: { id: material.id }, data: { stockQty: 999 } })
    const supplier = await createTestSupplier('mrp-skip-stock-check')
    createdSupplierIds.push(supplier.id)
    const run = await createRun(user.id)

    const suggestion = await db.mrpSuggestion.create({
      data: { mrpRunId: run.id, suggestionType: 'purchase', itemType: 'material', materialId: material.id, quantityNeeded: 20, quantityAvailable: 0, quantityReserved: 0, quantityShortfall: 20, supplierId: supplier.id },
    })

    const requisition = (await mrpSuggestionService.approve(suggestion.id, user.id)) as { id: string }
    createdRequisitionIds.push(requisition.id)

    await requisitionService.changeStatus(requisition.id, 'sent', user.id)
    await requisitionService.changeStatus(requisition.id, 'approved', user.id)
    const result = (await requisitionService.changeStatus(requisition.id, 'ordered', user.id)) as { generatedPurchaseOrders: Array<{ number: string }> }

    const item = await db.requisitionItem.findFirst({ where: { requisitionId: requisition.id } })
    expect(item?.quantityFromStock).toBe(0) // nenhum desconto de estoque, mesmo com 999 disponíveis
    expect(item?.quantityToPurchase).toBe(20) // a quantidade cheia calculada pelo MRP

    const movements = await db.stockMovement.findMany({ where: { referenceId: requisition.id } })
    expect(movements).toHaveLength(0) // nenhuma baixa de estoque para Requisição de origem MRP

    const material2 = await db.material.findUnique({ where: { id: material.id } })
    expect(material2?.stockQty).toBe(999) // intocado

    expect(result.generatedPurchaseOrders).toHaveLength(1)
  })
})
