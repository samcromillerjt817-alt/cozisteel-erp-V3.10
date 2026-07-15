import { describe, it, expect, afterAll } from 'vitest'
import { db } from '@/lib/db'
import { createTestUser, createTestProduct, createTestMaterial, createTestSupplier } from './helpers/fixtures'

/**
 * Fase 10, Subetapa 1 (ADR-013): campos lotControlled em Material/Product e as entidades
 * MaterialBatch/ProductBatch/BatchConsumption — puramente estrutural, sem lógica de
 * criação/consumo de lote ainda (Subetapas 2/3). Opt-in: itens sem lotControlled continuam
 * funcionando exatamente como hoje.
 */
describe('Rastreabilidade por Lote — Schema (Subetapa 1)', () => {
  const createdUserIds: string[] = []
  const createdProductIds: string[] = []
  const createdMaterialIds: string[] = []
  const createdSupplierIds: string[] = []
  const createdOrderIds: string[] = []
  const createdPurchaseOrderIds: string[] = []
  const createdRequisitionIds: string[] = []
  const createdMaterialBatchIds: string[] = []
  const createdProductBatchIds: string[] = []
  const createdBatchConsumptionIds: string[] = []

  afterAll(async () => {
    await db.batchConsumption.deleteMany({ where: { id: { in: createdBatchConsumptionIds } } })
    await db.productBatch.deleteMany({ where: { id: { in: createdProductBatchIds } } })
    await db.materialBatch.deleteMany({ where: { id: { in: createdMaterialBatchIds } } })
    await db.productionOrder.deleteMany({ where: { id: { in: createdOrderIds } } })
    await db.purchaseOrder.deleteMany({ where: { id: { in: createdPurchaseOrderIds } } })
    await db.requisition.deleteMany({ where: { id: { in: createdRequisitionIds } } })
    await db.material.deleteMany({ where: { id: { in: createdMaterialIds } } })
    await db.product.deleteMany({ where: { id: { in: createdProductIds } } })
    await db.supplier.deleteMany({ where: { id: { in: createdSupplierIds } } })
    await db.statusHistory.deleteMany({ where: { userId: { in: createdUserIds } } })
    await db.user.deleteMany({ where: { id: { in: createdUserIds } } })
  })

  it('Material/Product recebem lotControlled = false por padrão (opt-in, compatibilidade total)', async () => {
    const material = await db.material.create({ data: { name: 'Material Lote Teste' } })
    createdMaterialIds.push(material.id)
    const product = await db.product.create({ data: { name: 'Produto Lote Teste' } })
    createdProductIds.push(product.id)

    expect(material.lotControlled).toBe(false)
    expect(product.lotControlled).toBe(false)
  })

  it('MaterialBatch é criado com todas as relações (material, fornecedor, pedido de compra) e unitCost snapshot', async () => {
    const user = await createTestUser('lote-material')
    createdUserIds.push(user.id)
    const material = await createTestMaterial('lote-material')
    createdMaterialIds.push(material.id)
    const supplier = await createTestSupplier('lote-material')
    createdSupplierIds.push(supplier.id)

    const requisition = await db.requisition.create({
      data: { number: 'REQ-LOTE-TESTE-1', date: '01/01/2026', status: 'ordered', userId: user.id },
    })
    createdRequisitionIds.push(requisition.id)

    const purchaseOrder = await db.purchaseOrder.create({
      data: { number: 'PC-LOTE-TESTE-1', date: '01/01/2026', supplierId: supplier.id, requisitionId: requisition.id, userId: user.id },
    })
    createdPurchaseOrderIds.push(purchaseOrder.id)

    const purchaseOrderItem = await db.purchaseOrderItem.create({
      data: { purchaseOrderId: purchaseOrder.id, materialId: material.id, quantity: 100, unitPrice: 12.5 },
    })

    const batch = await db.materialBatch.create({
      data: {
        materialId: material.id,
        batchNumber: 'LOTE-FORNECEDOR-001',
        supplierId: supplier.id,
        purchaseOrderId: purchaseOrder.id,
        purchaseOrderItemId: purchaseOrderItem.id,
        quantityReceived: 100,
        quantityAvailable: 100,
        unitCost: 12.5,
      },
    })
    createdMaterialBatchIds.push(batch.id)

    expect(batch.materialId).toBe(material.id)
    expect(batch.supplierId).toBe(supplier.id)
    expect(batch.purchaseOrderId).toBe(purchaseOrder.id)
    expect(batch.quantityReceived).toBe(100)
    expect(batch.quantityAvailable).toBe(100)
    expect(batch.unitCost).toBe(12.5) // snapshot — preparação para custeio por lote, Fase 12
  })

  it('MaterialBatch aceita ausência de número de lote do fornecedor (fallback interno, gerado pela Service na Subetapa 2)', async () => {
    const material = await createTestMaterial('lote-sem-numero')
    createdMaterialIds.push(material.id)

    const batch = await db.materialBatch.create({
      data: { materialId: material.id, quantityReceived: 50, quantityAvailable: 50 },
    })
    createdMaterialBatchIds.push(batch.id)

    expect(batch.batchNumber).toBe('')
    expect(batch.supplierId).toBeNull()
    expect(batch.purchaseOrderId).toBeNull()
  })

  it('MaterialBatch impede dois lotes com o mesmo número para o mesmo material (@@unique)', async () => {
    const material = await createTestMaterial('lote-unique')
    createdMaterialIds.push(material.id)

    const batch = await db.materialBatch.create({
      data: { materialId: material.id, batchNumber: 'DUPLICADO-001', quantityReceived: 10, quantityAvailable: 10 },
    })
    createdMaterialBatchIds.push(batch.id)

    await expect(
      db.materialBatch.create({
        data: { materialId: material.id, batchNumber: 'DUPLICADO-001', quantityReceived: 5, quantityAvailable: 5 },
      })
    ).rejects.toThrow()

    // Mesmo número de lote, material DIFERENTE — permitido, a constraint é composta (materialId + batchNumber).
    const otherMaterial = await createTestMaterial('lote-unique-outro')
    createdMaterialIds.push(otherMaterial.id)
    const otherBatch = await db.materialBatch.create({
      data: { materialId: otherMaterial.id, batchNumber: 'DUPLICADO-001', quantityReceived: 5, quantityAvailable: 5 },
    })
    createdMaterialBatchIds.push(otherBatch.id)
    expect(otherBatch.batchNumber).toBe('DUPLICADO-001')
  })

  it('ProductBatch é criado ligado a Product e ProductionOrder, um por rodada', async () => {
    const user = await createTestUser('lote-produto')
    createdUserIds.push(user.id)
    const product = await createTestProduct('lote-produto')
    createdProductIds.push(product.id)

    const order = await db.productionOrder.create({
      data: { number: 'OP-LOTE-TESTE-1', date: '01/01/2026', productId: product.id, quantity: 50, userId: user.id },
    })
    createdOrderIds.push(order.id)

    const batch1 = await db.productBatch.create({
      data: { productId: product.id, productionOrderId: order.id, batchNumber: `${order.number}-1`, quantityProduced: 20 },
    })
    createdProductBatchIds.push(batch1.id)
    const batch2 = await db.productBatch.create({
      data: { productId: product.id, productionOrderId: order.id, batchNumber: `${order.number}-2`, quantityProduced: 30 },
    })
    createdProductBatchIds.push(batch2.id)

    expect(batch1.batchNumber).toBe('OP-LOTE-TESTE-1-1')
    expect(batch2.batchNumber).toBe('OP-LOTE-TESTE-1-2')

    const batchesOfOrder = await db.productBatch.findMany({ where: { productionOrderId: order.id } })
    expect(batchesOfOrder).toHaveLength(2) // uma OP pode gerar múltiplos lotes, um por rodada
  })

  it('BatchConsumption liga um ProductBatch a um MaterialBatch (itemType="material") — rastreabilidade de 1 nível', async () => {
    const user = await createTestUser('consumo-material')
    createdUserIds.push(user.id)
    const material = await createTestMaterial('consumo-material')
    createdMaterialIds.push(material.id)
    const product = await createTestProduct('consumo-material')
    createdProductIds.push(product.id)

    const materialBatch = await db.materialBatch.create({
      data: { materialId: material.id, batchNumber: 'TUBO-001', quantityReceived: 100, quantityAvailable: 70 },
    })
    createdMaterialBatchIds.push(materialBatch.id)

    const order = await db.productionOrder.create({
      data: { number: 'OP-CONSUMO-TESTE-1', date: '01/01/2026', productId: product.id, quantity: 30, userId: user.id },
    })
    createdOrderIds.push(order.id)

    const productBatch = await db.productBatch.create({
      data: { productId: product.id, productionOrderId: order.id, batchNumber: `${order.number}-1`, quantityProduced: 30 },
    })
    createdProductBatchIds.push(productBatch.id)

    const consumption = await db.batchConsumption.create({
      data: { productBatchId: productBatch.id, itemType: 'material', materialBatchId: materialBatch.id, quantityConsumed: 30 },
    })
    createdBatchConsumptionIds.push(consumption.id)

    expect(consumption.itemType).toBe('material')
    expect(consumption.materialBatchId).toBe(materialBatch.id)
    expect(consumption.consumedProductBatchId).toBeNull()

    // Rastreabilidade backward: do ProductBatch, encontrar o MaterialBatch de origem.
    const withConsumptions = await db.productBatch.findUnique({
      where: { id: productBatch.id },
      include: { consumedFrom: { include: { materialBatch: true } } },
    })
    expect(withConsumptions?.consumedFrom[0].materialBatch?.batchNumber).toBe('TUBO-001')

    // Rastreabilidade forward: do MaterialBatch, encontrar os ProductBatch que o consumiram.
    const withUsages = await db.materialBatch.findUnique({
      where: { id: materialBatch.id },
      include: { consumptions: { include: { productBatch: true } } },
    })
    expect(withUsages?.consumptions[0].productBatch.batchNumber).toBe('OP-CONSUMO-TESTE-1-1')
  })

  it('BatchConsumption liga um ProductBatch a OUTRO ProductBatch (itemType="product") — rastreabilidade multinível (Mesa->Estrutura)', async () => {
    const user = await createTestUser('consumo-multinivel')
    createdUserIds.push(user.id)
    const tubo = await createTestMaterial('consumo-multinivel-tubo')
    createdMaterialIds.push(tubo.id)
    const estrutura = await createTestProduct('consumo-multinivel-estrutura')
    createdProductIds.push(estrutura.id)
    const mesa = await createTestProduct('consumo-multinivel-mesa')
    createdProductIds.push(mesa.id)

    const materialBatch = await db.materialBatch.create({
      data: { materialId: tubo.id, batchNumber: 'TUBO-MULTINIVEL-001', quantityReceived: 200, quantityAvailable: 100 },
    })
    createdMaterialBatchIds.push(materialBatch.id)

    const orderEstrutura = await db.productionOrder.create({
      data: { number: 'OP-ESTRUTURA-TESTE', date: '01/01/2026', productId: estrutura.id, quantity: 40, userId: user.id },
    })
    createdOrderIds.push(orderEstrutura.id)
    const estruturaBatch = await db.productBatch.create({
      data: { productId: estrutura.id, productionOrderId: orderEstrutura.id, batchNumber: `${orderEstrutura.number}-1`, quantityProduced: 40 },
    })
    createdProductBatchIds.push(estruturaBatch.id)

    // Estrutura consumiu Tubo (nível 1).
    const estruturaConsumesTubo = await db.batchConsumption.create({
      data: { productBatchId: estruturaBatch.id, itemType: 'material', materialBatchId: materialBatch.id, quantityConsumed: 40 },
    })
    createdBatchConsumptionIds.push(estruturaConsumesTubo.id)

    const orderMesa = await db.productionOrder.create({
      data: { number: 'OP-MESA-TESTE', date: '01/01/2026', productId: mesa.id, quantity: 40, userId: user.id },
    })
    createdOrderIds.push(orderMesa.id)
    const mesaBatch = await db.productBatch.create({
      data: { productId: mesa.id, productionOrderId: orderMesa.id, batchNumber: `${orderMesa.number}-1`, quantityProduced: 40 },
    })
    createdProductBatchIds.push(mesaBatch.id)

    // Mesa consumiu o LOTE de Estrutura (nível 2, itemType="product") — nunca o Tubo diretamente.
    const mesaConsumesEstrutura = await db.batchConsumption.create({
      data: { productBatchId: mesaBatch.id, itemType: 'product', consumedProductBatchId: estruturaBatch.id, quantityConsumed: 40 },
    })
    createdBatchConsumptionIds.push(mesaConsumesEstrutura.id)

    expect(mesaConsumesEstrutura.itemType).toBe('product')
    expect(mesaConsumesEstrutura.materialBatchId).toBeNull()
    expect(mesaConsumesEstrutura.consumedProductBatchId).toBe(estruturaBatch.id)

    // Rastreabilidade backward encadeada: Mesa -> lote de Estrutura -> lote de Tubo -> fornecedor/PO.
    const mesaChain = await db.productBatch.findUnique({
      where: { id: mesaBatch.id },
      include: {
        consumedFrom: {
          include: {
            consumedProductBatch: { include: { consumedFrom: { include: { materialBatch: true } } } },
          },
        },
      },
    })
    const estruturaFromMesa = mesaChain?.consumedFrom[0].consumedProductBatch
    expect(estruturaFromMesa?.batchNumber).toBe('OP-ESTRUTURA-TESTE-1')
    expect(estruturaFromMesa?.consumedFrom[0].materialBatch?.batchNumber).toBe('TUBO-MULTINIVEL-001')

    // Rastreabilidade forward encadeada: lote de Tubo -> Estrutura -> Mesa que a usou como componente.
    const tuboChain = await db.materialBatch.findUnique({
      where: { id: materialBatch.id },
      include: {
        consumptions: {
          include: {
            productBatch: { include: { consumedAsComponentIn: { include: { productBatch: true } } } },
          },
        },
      },
    })
    const estruturaFromTubo = tuboChain?.consumptions[0].productBatch
    expect(estruturaFromTubo?.batchNumber).toBe('OP-ESTRUTURA-TESTE-1')
    const mesaFromEstrutura = estruturaFromTubo?.consumedAsComponentIn[0].productBatch
    expect(mesaFromEstrutura?.batchNumber).toBe('OP-MESA-TESTE-1')
  })
})
