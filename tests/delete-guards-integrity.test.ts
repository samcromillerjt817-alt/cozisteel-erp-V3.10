import { describe, it, expect, afterAll } from 'vitest'
import { db } from '@/lib/db'
import { materialService } from '@/app/services/material.service'
import { supplierService } from '@/app/services/supplier.service'
import { productionOrderService } from '@/app/services/production-order.service'
import { numberingService } from '@/app/services/numbering.service'
import { createTestUser, createTestMaterial, createTestSupplier, createTestProduct } from './helpers/fixtures'

/**
 * Achados de integridade encontrados revisando os logs de produção do PM2 (verificação pós-Fase 12,
 * a pedido do usuário: "garanta a integridade do sistema"). 3 `delete()` de Service que deixavam um
 * `PrismaClientKnownRequestError` (FK, P2003) vazar cru — ou, no caso de `ProductionOrder`, não
 * verificavam nada e permitiam apagar uma OP que já tinha produção física registrada, cascateando a
 * exclusão do `ProductBatch` sem nunca reverter `Product.stockQty` (corrupção silenciosa de saldo).
 */
describe('Guardas de exclusão contra corrupção de integridade referencial', () => {
  const createdUserIds: string[] = []
  const createdMaterialIds: string[] = []
  const createdSupplierIds: string[] = []
  const createdRequisitionIds: string[] = []
  const createdPurchaseOrderIds: string[] = []
  const createdProductIds: string[] = []
  const createdOrderIds: string[] = []

  afterAll(async () => {
    await db.materialBatch.deleteMany({ where: { materialId: { in: createdMaterialIds } } })
    await db.purchaseOrder.deleteMany({ where: { id: { in: createdPurchaseOrderIds } } })
    await db.requisition.deleteMany({ where: { id: { in: createdRequisitionIds } } })
    await db.supplier.deleteMany({ where: { id: { in: createdSupplierIds } } })
    await db.material.deleteMany({ where: { id: { in: createdMaterialIds } } })
    await db.productionOrder.deleteMany({ where: { id: { in: createdOrderIds } } })
    await db.product.deleteMany({ where: { id: { in: createdProductIds } } })
    await db.user.deleteMany({ where: { id: { in: createdUserIds } } })
  })

  it('1. materialService.delete rejeita matéria-prima com lote de recebimento já registrado', async () => {
    const material = await createTestMaterial('delete-guard-batch')
    createdMaterialIds.push(material.id)
    await db.materialBatch.create({ data: { materialId: material.id, batchNumber: 'DG-1', quantityReceived: 10, quantityAvailable: 10, unitCost: 5 } })

    await expect(materialService.delete(material.id, 'irrelevant-user-id')).rejects.toThrow(/lotes de recebimento/)
  })

  it('2. materialService.delete continua permitindo excluir matéria-prima sem nenhum vínculo (regressão do caminho feliz)', async () => {
    const material = await createTestMaterial('delete-guard-no-links')
    const user = await createTestUser('delete-guard-material-user')
    createdUserIds.push(user.id)

    const result = await materialService.delete(material.id, user.id)
    expect(result).toEqual({ success: true })
    const stillExists = await db.material.findUnique({ where: { id: material.id } })
    expect(stillExists).toBeNull()
  })

  it('3. supplierService.delete rejeita fornecedor com Pedido de Compra vinculado', async () => {
    const user = await createTestUser('delete-guard-supplier-po')
    createdUserIds.push(user.id)
    const supplier = await createTestSupplier('delete-guard-po')
    createdSupplierIds.push(supplier.id)
    const today = new Date().toLocaleDateString('pt-BR')
    const requisitionNumber = await numberingService.getNextNumber('requisicao')
    const requisition = await db.requisition.create({ data: { number: requisitionNumber, tipo: 'PRODUCAO', originModule: 'manual', status: 'draft', date: today, userId: user.id } })
    createdRequisitionIds.push(requisition.id)
    const poNumber = await numberingService.getNextNumber('compra')
    const purchaseOrder = await db.purchaseOrder.create({ data: { number: poNumber, status: 'draft', supplierId: supplier.id, requisitionId: requisition.id, date: today, userId: user.id } })
    createdPurchaseOrderIds.push(purchaseOrder.id)

    await expect(supplierService.delete(supplier.id, user.id)).rejects.toThrow(/pedidos de compra vinculados/)
  })

  it('4. productionOrderService.delete rejeita OP que já teve produção registrada (quantityCompleted > 0)', async () => {
    const user = await createTestUser('delete-guard-op-produced')
    createdUserIds.push(user.id)
    const product = await createTestProduct('delete-guard-op-produced')
    createdProductIds.push(product.id)
    const order = (await productionOrderService.create({ productId: product.id, quantity: 10, unit: 'UN' }, user.id)) as { id: string }
    createdOrderIds.push(order.id)
    await db.productionOrder.update({ where: { id: order.id }, data: { quantityCompleted: 4 } })

    await expect(productionOrderService.delete(order.id)).rejects.toThrow(/já teve produção registrada/)
  })

  it('5. productionOrderService.delete permite excluir uma OP recém-criada, sem nenhuma produção ainda', async () => {
    const user = await createTestUser('delete-guard-op-fresh')
    createdUserIds.push(user.id)
    const product = await createTestProduct('delete-guard-op-fresh')
    createdProductIds.push(product.id)
    const order = (await productionOrderService.create({ productId: product.id, quantity: 10, unit: 'UN' }, user.id)) as { id: string }

    const result = await productionOrderService.delete(order.id)
    expect(result).toEqual({ success: true })
    const stillExists = await db.productionOrder.findUnique({ where: { id: order.id } })
    expect(stillExists).toBeNull()
  })
})
