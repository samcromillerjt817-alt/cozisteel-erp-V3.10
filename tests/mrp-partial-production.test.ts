import { describe, it, expect, afterAll } from 'vitest'
import { db } from '@/lib/db'
import { bomService } from '@/app/services/bom.service'
import { productionOrderService } from '@/app/services/production-order.service'
import { mrpCalculationService } from '@/app/services/mrp-calculation.service'
import { mrpExecutionService } from '@/app/services/mrp-execution.service'
import { createTestUser, createTestProduct, createTestMaterial } from './helpers/fixtures'

/**
 * Fase 9, Subetapa 2 (ADR-011): o MRP passa a considerar só o saldo RESTANTE
 * (quantity - quantityCompleted) de cada OP aberta — nunca a quantidade cheia.
 */
describe('MRP — Impacto da Produção Parcial (Fase 9, Subetapa 2)', () => {
  const createdUserIds: string[] = []
  const createdProductIds: string[] = []
  const createdMaterialIds: string[] = []
  const createdRevisionIds: string[] = []
  const createdOrderIds: string[] = []
  const createdRunIds: string[] = []

  afterAll(async () => {
    await db.mrpRun.deleteMany({ where: { id: { in: createdRunIds } } }) // cascade: MrpSuggestion/Source
    await db.productionOrderExecution.deleteMany({ where: { productionOrderId: { in: createdOrderIds } } })
    await db.materialReservation.deleteMany({ where: { productionOrderId: { in: createdOrderIds } } })
    await db.stockMovement.deleteMany({ where: { referenceId: { in: createdOrderIds } } })
    await db.productionOrder.deleteMany({ where: { id: { in: createdOrderIds } } })
    await db.bomRevision.deleteMany({ where: { id: { in: createdRevisionIds } } })
    await db.material.deleteMany({ where: { id: { in: createdMaterialIds } } })
    await db.product.deleteMany({ where: { id: { in: createdProductIds } } })
    await db.statusHistory.deleteMany({ where: { userId: { in: createdUserIds } } })
    await db.user.deleteMany({ where: { id: { in: createdUserIds } } })
  })

  async function releasedRevision(productId: string, userId: string, code: string) {
    const revision = (await bomService.createRevision(productId, { revisionCode: code, notes: '' }, userId)) as { id: string }
    createdRevisionIds.push(revision.id)
    return revision
  }

  it('1. OP 100 → produz 30 → MRP calcula demanda só dos 70 restantes', async () => {
    const user = await createTestUser('mrp-partial-70')
    createdUserIds.push(user.id)
    const product = await createTestProduct('mrp-partial-70')
    createdProductIds.push(product.id)
    const material = await createTestMaterial('mrp-partial-70')
    createdMaterialIds.push(material.id)

    const revision = await releasedRevision(product.id, user.id, 'A')
    await bomService.addLine(revision.id, { lineType: 'material', materialId: material.id, componentProductId: null, quantity: 1, unit: 'KG', scrapPct: 0, order: 0, notes: '' })
    await bomService.changeStatus(revision.id, 'released', user.id)

    const order = (await productionOrderService.create({ productId: product.id, quantity: 100, unit: 'UN' }, user.id)) as { id: string }
    createdOrderIds.push(order.id)

    await productionOrderService.produce(order.id, 30, user.id)

    const result = await mrpCalculationService.calculate()
    const suggestion = result.suggestions.find((s) => s.materialId === material.id)

    expect(suggestion?.quantityNeeded).toBe(70) // nunca 100
  })

  it('2. OP 100 → produz 100 → desaparece completamente da demanda do MRP', async () => {
    const user = await createTestUser('mrp-partial-complete')
    createdUserIds.push(user.id)
    const product = await createTestProduct('mrp-partial-complete')
    createdProductIds.push(product.id)
    const material = await createTestMaterial('mrp-partial-complete')
    createdMaterialIds.push(material.id)

    const revision = await releasedRevision(product.id, user.id, 'A')
    await bomService.addLine(revision.id, { lineType: 'material', materialId: material.id, componentProductId: null, quantity: 1, unit: 'KG', scrapPct: 0, order: 0, notes: '' })
    await bomService.changeStatus(revision.id, 'released', user.id)

    const order = (await productionOrderService.create({ productId: product.id, quantity: 50, unit: 'UN' }, user.id)) as { id: string }
    createdOrderIds.push(order.id)

    await productionOrderService.produce(order.id, 50, user.id) // completa 100%

    const result = await mrpCalculationService.calculate()
    const suggestion = result.suggestions.find((s) => s.materialId === material.id)

    expect(suggestion).toBeUndefined() // OP concluída não gera nenhuma demanda
  })

  it('3. Subconjunto parcialmente produzido: inProduction reduz o shortfall pelo saldo restante, não pela quantidade cheia', async () => {
    const user = await createTestUser('mrp-partial-subassembly')
    createdUserIds.push(user.id)
    const mesa = await createTestProduct('mrp-partial-subassembly-mesa')
    createdProductIds.push(mesa.id)
    const estrutura = await createTestProduct('mrp-partial-subassembly-estrutura')
    createdProductIds.push(estrutura.id)
    const tubo = await createTestMaterial('mrp-partial-subassembly-tubo')
    createdMaterialIds.push(tubo.id)

    const estruturaRevision = await releasedRevision(estrutura.id, user.id, 'A')
    await bomService.addLine(estruturaRevision.id, { lineType: 'material', materialId: tubo.id, componentProductId: null, quantity: 1, unit: 'KG', scrapPct: 0, order: 0, notes: '' })
    await bomService.changeStatus(estruturaRevision.id, 'released', user.id)

    const mesaRevision = await releasedRevision(mesa.id, user.id, 'A')
    await bomService.addLine(mesaRevision.id, { lineType: 'component', materialId: null, componentProductId: estrutura.id, quantity: 1, unit: 'UN', scrapPct: 0, order: 0, notes: '' })
    await bomService.changeStatus(mesaRevision.id, 'released', user.id)

    // OP-A produz a Estrutura diretamente: 100 planejadas, 30 já produzidas -> stockQty vira 30
    // (a produção JÁ ENTRA no estoque físico da Estrutura), restante = 70 ainda "em produção".
    const orderEstrutura = (await productionOrderService.create({ productId: estrutura.id, quantity: 100, unit: 'UN' }, user.id)) as { id: string }
    createdOrderIds.push(orderEstrutura.id)
    await productionOrderService.produce(orderEstrutura.id, 30, user.id)

    // OP-B precisa de 120 Estruturas como componente da Mesa — mais do que a OP-A, sozinha,
    // algum dia vai produzir (100) — para isso ficar visível, é preciso mais do que as 100
    // planejadas por OP-A inteira, provando que a disponibilidade não é superestimada.
    const orderMesa = (await productionOrderService.create({ productId: mesa.id, quantity: 120, unit: 'UN' }, user.id)) as { id: string }
    createdOrderIds.push(orderMesa.id)

    const result = await mrpCalculationService.calculate()
    const estruturaSuggestion = result.suggestions.find((s) => s.productId === estrutura.id)

    // needed (só da Mesa, dependente) = 120
    // available = freeStock (30, já produzido e fisicamente em estoque) + inProduction (RESTANTE
    // da OP-A: 100-30=70, nunca os 100 originais — esse é o ponto que esta correção garante) = 100
    // shortfall = 120 - 0 - 100 = 20
    //
    // Sem a correção (usando os 100 originais de inProduction em vez do restante de 70), o cálculo
    // contaria em dobro os 30 já produzidos (uma vez em freeStock, de novo em inProduction cheio),
    // chegando a available=130 e shortfall=0 — escondendo uma falta real de 20 unidades.
    expect(estruturaSuggestion?.quantityNeeded).toBe(120)
    expect(estruturaSuggestion?.quantityAvailable).toBe(100)
    expect(estruturaSuggestion?.quantityShortfall).toBe(20)
  })

  it('4. Múltiplas OPs parcialmente produzidas do mesmo item agregam corretamente pelo saldo restante de cada uma', async () => {
    const user = await createTestUser('mrp-partial-multiple')
    createdUserIds.push(user.id)
    const productA = await createTestProduct('mrp-partial-multiple-a')
    createdProductIds.push(productA.id)
    const productB = await createTestProduct('mrp-partial-multiple-b')
    createdProductIds.push(productB.id)
    const material = await createTestMaterial('mrp-partial-multiple')
    createdMaterialIds.push(material.id)

    const revisionA = await releasedRevision(productA.id, user.id, 'A')
    await bomService.addLine(revisionA.id, { lineType: 'material', materialId: material.id, componentProductId: null, quantity: 1, unit: 'KG', scrapPct: 0, order: 0, notes: '' })
    await bomService.changeStatus(revisionA.id, 'released', user.id)

    const revisionB = await releasedRevision(productB.id, user.id, 'A')
    await bomService.addLine(revisionB.id, { lineType: 'material', materialId: material.id, componentProductId: null, quantity: 1, unit: 'KG', scrapPct: 0, order: 0, notes: '' })
    await bomService.changeStatus(revisionB.id, 'released', user.id)

    // OP-A: 100 planejadas, 40 produzidas -> restante 60
    const orderA = (await productionOrderService.create({ productId: productA.id, quantity: 100, unit: 'UN' }, user.id)) as { id: string }
    createdOrderIds.push(orderA.id)
    await productionOrderService.produce(orderA.id, 40, user.id)

    // OP-B: 50 planejadas, 10 produzidas -> restante 40
    const orderB = (await productionOrderService.create({ productId: productB.id, quantity: 50, unit: 'UN' }, user.id)) as { id: string }
    createdOrderIds.push(orderB.id)
    await productionOrderService.produce(orderB.id, 10, user.id)

    const result = await mrpCalculationService.calculate()
    const suggestion = result.suggestions.find((s) => s.materialId === material.id)

    expect(suggestion?.quantityNeeded).toBe(100) // 60 (restante de A) + 40 (restante de B), nunca 150
  })

  it('5. Histórico antigo do MRP permanece inalterado depois de uma nova execução refletir a produção parcial', async () => {
    const user = await createTestUser('mrp-partial-history')
    createdUserIds.push(user.id)
    const product = await createTestProduct('mrp-partial-history')
    createdProductIds.push(product.id)
    const material = await createTestMaterial('mrp-partial-history')
    createdMaterialIds.push(material.id)

    const revision = await releasedRevision(product.id, user.id, 'A')
    await bomService.addLine(revision.id, { lineType: 'material', materialId: material.id, componentProductId: null, quantity: 1, unit: 'KG', scrapPct: 0, order: 0, notes: '' })
    await bomService.changeStatus(revision.id, 'released', user.id)

    const order = (await productionOrderService.create({ productId: product.id, quantity: 100, unit: 'UN' }, user.id)) as { id: string }
    createdOrderIds.push(order.id)

    const firstRun = (await mrpExecutionService.run(user.id)) as { id: string }
    createdRunIds.push(firstRun.id)
    const firstSuggestion = await db.mrpSuggestion.findFirst({ where: { mrpRunId: firstRun.id, materialId: material.id } })
    expect(firstSuggestion?.quantityNeeded).toBe(100)

    // Produção parcial acontece DEPOIS da primeira execução
    await productionOrderService.produce(order.id, 30, user.id)

    const secondRun = (await mrpExecutionService.run(user.id)) as { id: string }
    createdRunIds.push(secondRun.id)
    const secondSuggestion = await db.mrpSuggestion.findFirst({ where: { mrpRunId: secondRun.id, materialId: material.id } })
    expect(secondSuggestion?.quantityNeeded).toBe(70) // nova execução reflete o restante

    // A sugestão da PRIMEIRA execução continua exatamente como estava — histórico nunca é reescrito
    const firstSuggestionAfter = await db.mrpSuggestion.findUnique({ where: { id: firstSuggestion!.id } })
    expect(firstSuggestionAfter?.quantityNeeded).toBe(100)
  })
})
