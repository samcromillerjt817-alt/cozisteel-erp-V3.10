import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { db } from '@/lib/db'
import { registerDomainEventHandlers } from '@/lib/register-domain-event-handlers'
import { bomService } from '@/app/services/bom.service'
import { productionOrderService } from '@/app/services/production-order.service'
import { costingService } from '@/app/services/costing.service'
import { settingService } from '@/app/services/setting.service'
import { createTestUser, createTestProduct, createTestMaterial } from './helpers/fixtures'

/**
 * Fase 12 (ADR-020, Subetapa 8) — custo padrão de mão de obra (tempo padrão da BomRevision × taxa
 * configurável) e overhead (percentual sobre materialCost). Ambos são custo PADRÃO, não real —
 * calculados a partir do que já está cadastrado desde a Fase 4 (`ProductOperation`), nunca de
 * apontamento manual (decisão resolvida, ver ADR-020 Parte 5).
 */
describe('Financeiro — Mão de obra e Overhead (Fase 12, Subetapa 8, ADR-020)', () => {
  const createdUserIds: string[] = []
  const createdProductIds: string[] = []
  const createdMaterialIds: string[] = []
  const createdRevisionIds: string[] = []
  const createdOrderIds: string[] = []
  const createdOperationTypeIds: string[] = []

  beforeAll(() => {
    registerDomainEventHandlers()
  })

  afterAll(async () => {
    await db.batchConsumption.deleteMany({ where: { productBatch: { productionOrderId: { in: createdOrderIds } } } })
    await db.productBatch.deleteMany({ where: { productionOrderId: { in: createdOrderIds } } })
    await db.materialBatch.deleteMany({ where: { materialId: { in: createdMaterialIds } } })
    await db.productionOrderExecution.deleteMany({ where: { productionOrderId: { in: createdOrderIds } } })
    await db.materialReservation.deleteMany({ where: { productionOrderId: { in: createdOrderIds } } })
    await db.stockMovement.deleteMany({ where: { referenceId: { in: createdOrderIds } } })
    await db.productionOrder.deleteMany({ where: { id: { in: createdOrderIds } } })
    await db.productOperation.deleteMany({ where: { bomRevisionId: { in: createdRevisionIds } } })
    await db.bomRevision.deleteMany({ where: { id: { in: createdRevisionIds } } })
    await db.operationType.deleteMany({ where: { id: { in: createdOperationTypeIds } } })
    await db.material.deleteMany({ where: { id: { in: createdMaterialIds } } })
    await db.product.deleteMany({ where: { id: { in: createdProductIds } } })
    await db.statusHistory.deleteMany({ where: { userId: { in: createdUserIds } } })
    await db.user.deleteMany({ where: { id: { in: createdUserIds } } })
    // Configuração global usada pelos testes abaixo — não deixar vazar pro resto da suíte.
    await db.systemSetting.deleteMany({ where: { key: { in: ['custeio.laborRatePerHour', 'custeio.overheadPercent'] } } })
  })

  async function releasedRevisionWithOperation(productId: string, userId: string, code: string, setupTimeMinutes: number, runTimeMinutesPerUnit: number) {
    const opType = (await bomService.createOperationType({ name: `Operação teste custeio ${code}-${Date.now()}`, description: '' })) as { id: string }
    createdOperationTypeIds.push(opType.id)

    const revision = (await bomService.createRevision(productId, { revisionCode: code, notes: '' }, userId)) as { id: string }
    createdRevisionIds.push(revision.id)

    await bomService.addOperation(revision.id, {
      operationTypeId: opType.id,
      description: 'Operação de teste',
      setupTimeMinutes,
      runTimeMinutesPerUnit,
      workCenter: '',
      notes: '',
    })

    return revision
  }

  it('1. Mão de obra: taxa configurada × tempo padrão da BOM (setup + runTime × quantidade produzida)', async () => {
    await settingService.set('custeio.laborRatePerHour', '60') // R$1/min
    await settingService.set('custeio.overheadPercent', '0')

    const user = await createTestUser('labor-basico')
    createdUserIds.push(user.id)
    const mesa = await createTestProduct('labor-basico-mesa')
    createdProductIds.push(mesa.id)
    await db.product.update({ where: { id: mesa.id }, data: { lotControlled: true } })

    // setup 10min + runTime 2min/un × 5un = 20min de tempo padrão -> R$1/min * 20min = R$20
    const revision = await releasedRevisionWithOperation(mesa.id, user.id, 'A', 10, 2)
    await bomService.changeStatus(revision.id, 'released', user.id)

    const order = (await productionOrderService.create({ productId: mesa.id, quantity: 5, unit: 'UN' }, user.id)) as { id: string }
    createdOrderIds.push(order.id)
    await productionOrderService.produce(order.id, 5, user.id)

    const productBatch = await db.productBatch.findFirst({ where: { productionOrderId: order.id } })
    expect(productBatch?.laborCost).toBe(20)
  })

  it('2. Overhead: percentual configurado × materialCost já persistido', async () => {
    await settingService.set('custeio.laborRatePerHour', '0')
    await settingService.set('custeio.overheadPercent', '15')

    const user = await createTestUser('overhead-basico')
    createdUserIds.push(user.id)
    const mesa = await createTestProduct('overhead-basico-mesa')
    createdProductIds.push(mesa.id)
    await db.product.update({ where: { id: mesa.id }, data: { lotControlled: true } })
    const tubo = await createTestMaterial('overhead-basico-tubo')
    createdMaterialIds.push(tubo.id)
    await db.material.update({ where: { id: tubo.id }, data: { lotControlled: true, stockQty: 1000 } })
    await db.materialBatch.create({
      data: { materialId: tubo.id, batchNumber: 'LOTE-OVERHEAD', quantityReceived: 1000, quantityAvailable: 1000, unitCost: 10 },
    })

    const revision = await releasedRevisionWithOperation(mesa.id, user.id, 'A', 0, 0)
    await bomService.addLine(revision.id, { lineType: 'material', materialId: tubo.id, componentProductId: null, quantity: 1, unit: 'KG', scrapPct: 0, order: 0, notes: '' })
    await bomService.changeStatus(revision.id, 'released', user.id)

    const order = (await productionOrderService.create({ productId: mesa.id, quantity: 10, unit: 'UN' }, user.id)) as { id: string }
    createdOrderIds.push(order.id)
    await productionOrderService.produce(order.id, 10, user.id)

    const productBatch = await db.productBatch.findFirst({ where: { productionOrderId: order.id } })
    expect(productBatch?.materialCost).toBe(100) // 10kg * R$10
    expect(productBatch?.overheadCost).toBe(15) // 15% de R$100
  })

  it('3. OP sem bomRevisionId: laborCost/overheadCost ficam null, nunca 0 (mesmo tratamento de materialCost)', async () => {
    await settingService.set('custeio.laborRatePerHour', '60')
    await settingService.set('custeio.overheadPercent', '15')

    const user = await createTestUser('semengenharia')
    createdUserIds.push(user.id)
    const mesa = await createTestProduct('semengenharia-mesa')
    createdProductIds.push(mesa.id)
    await db.product.update({ where: { id: mesa.id }, data: { lotControlled: true } })

    // Nenhuma BomRevision criada — produção sem engenharia formal.
    const order = (await productionOrderService.create({ productId: mesa.id, quantity: 3, unit: 'UN' }, user.id)) as { id: string }
    createdOrderIds.push(order.id)
    await productionOrderService.produce(order.id, 3, user.id)

    const productBatch = await db.productBatch.findFirst({ where: { productionOrderId: order.id } })
    expect(productBatch?.laborCost).toBeNull()
    expect(productBatch?.overheadCost).toBeNull()
  })

  it('4. Taxas não configuradas (default 0): custo calculado é 0, não null — dado existe, só a taxa é neutra', async () => {
    await db.systemSetting.deleteMany({ where: { key: { in: ['custeio.laborRatePerHour', 'custeio.overheadPercent'] } } })

    const user = await createTestUser('taxa-zero')
    createdUserIds.push(user.id)
    const mesa = await createTestProduct('taxa-zero-mesa')
    createdProductIds.push(mesa.id)
    await db.product.update({ where: { id: mesa.id }, data: { lotControlled: true } })

    const revision = await releasedRevisionWithOperation(mesa.id, user.id, 'A', 30, 5)
    await bomService.changeStatus(revision.id, 'released', user.id)

    const order = (await productionOrderService.create({ productId: mesa.id, quantity: 2, unit: 'UN' }, user.id)) as { id: string }
    createdOrderIds.push(order.id)
    await productionOrderService.produce(order.id, 2, user.id)

    const productBatch = await db.productBatch.findFirst({ where: { productionOrderId: order.id } })
    expect(productBatch?.laborCost).toBe(0)
    expect(productBatch?.overheadCost).toBe(0)
  })

  it('5. Chamada direta é idempotente (recalcular o mesmo lote produz o mesmo resultado)', async () => {
    await settingService.set('custeio.laborRatePerHour', '60')
    await settingService.set('custeio.overheadPercent', '0')

    const user = await createTestUser('labor-idempotent')
    createdUserIds.push(user.id)
    const mesa = await createTestProduct('labor-idempotent-mesa')
    createdProductIds.push(mesa.id)
    await db.product.update({ where: { id: mesa.id }, data: { lotControlled: true } })

    const revision = await releasedRevisionWithOperation(mesa.id, user.id, 'A', 10, 0)
    await bomService.changeStatus(revision.id, 'released', user.id)

    const order = (await productionOrderService.create({ productId: mesa.id, quantity: 1, unit: 'UN' }, user.id)) as { id: string }
    createdOrderIds.push(order.id)
    await productionOrderService.produce(order.id, 1, user.id)

    const productBatch = await db.productBatch.findFirst({ where: { productionOrderId: order.id } })
    const recalculated = await costingService.calculateAndPersistLaborAndOverheadCost(productBatch!.id)
    expect(recalculated.laborCost).toBe(10) // 10min de setup * R$1/min
    expect(recalculated.laborCost).toBe(productBatch!.laborCost)
  })
})
