import { describe, it, expect, afterAll } from 'vitest'
import { db } from '@/lib/db'
import { bomService } from '@/app/services/bom.service'
import { mrpExecutionService } from '@/app/services/mrp-execution.service'
import { mrpRunRepository } from '@/app/repositories/mrp-run.repository'
import type { MrpCalculationResult } from '@/app/services/mrp-calculation.service'
import { createTestUser, createTestProduct, createTestMaterial } from './helpers/fixtures'

/**
 * Fase 6, Subetapa 3 (ADR-007): execução e persistência. `mrp-execution.service.ts` orquestra;
 * `mrp-run.repository.ts` grava `MrpRun`/`MrpSuggestion`/`MrpSuggestionSource` numa única
 * transação. O motor de cálculo (Subetapa 2) já está coberto por `mrp-calculation.test.ts` — aqui
 * o foco é execução/persistência/histórico, não o algoritmo em si.
 */
describe('MRP — Execução e Persistência (Subetapa 3)', () => {
  const createdUserIds: string[] = []
  const createdProductIds: string[] = []
  const createdMaterialIds: string[] = []
  const createdRevisionIds: string[] = []
  const createdOrderIds: string[] = []
  const createdRunIds: string[] = []
  let orderCounter = 0

  afterAll(async () => {
    await db.mrpRun.deleteMany({ where: { id: { in: createdRunIds } } }) // cascade: MrpSuggestion -> MrpSuggestionSource
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

  async function openOrder(userId: string, productId: string, quantity: number, bomRevisionId: string | null) {
    orderCounter += 1
    const order = await db.productionOrder.create({
      data: { number: `OP-MRP-EXEC-${orderCounter}`, date: '01/01/2026', status: 'planned', productId, quantity, userId, bomRevisionId },
    })
    createdOrderIds.push(order.id)
    return order
  }

  it('1. Execução sem nenhuma necessidade aberta gera um MrpRun vazio', async () => {
    const user = await createTestUser('mrp-exec-empty')
    createdUserIds.push(user.id)

    const run = (await mrpExecutionService.run(user.id)) as { id: string; totalSuggestions: number; openOrdersConsidered: number; suggestions: unknown[] }
    createdRunIds.push(run.id)

    expect(run.totalSuggestions).toBe(0)
    expect(run.openOrdersConsidered).toBe(0)
    expect(run.suggestions).toHaveLength(0)
  })

  it('2. Execução com sugestão de compra: persiste MrpRun + MrpSuggestion + MrpSuggestionSource corretos', async () => {
    const user = await createTestUser('mrp-exec-purchase')
    createdUserIds.push(user.id)
    const product = await createTestProduct('mrp-exec-purchase')
    createdProductIds.push(product.id)
    const material = await createTestMaterial('mrp-exec-purchase')
    createdMaterialIds.push(material.id)

    const revision = await releasedRevision(product.id, user.id, 'A')
    await bomService.addLine(revision.id, {
      lineType: 'material', materialId: material.id, componentProductId: null,
      quantity: 2, unit: 'KG', scrapPct: 0, order: 0, notes: '',
    })
    await bomService.changeStatus(revision.id, 'released', user.id)
    const order = await openOrder(user.id, product.id, 5, revision.id)

    const run = (await mrpExecutionService.run(user.id)) as {
      id: string
      number: string
      totalPurchaseSuggestions: number
      suggestions: Array<{ id: string; materialId: string | null; suggestionType: string; quantityShortfall: number; sources: Array<{ productionOrderId: string; contributedQuantity: number }> }>
    }
    createdRunIds.push(run.id)

    expect(run.number).toBeTruthy()
    const suggestion = run.suggestions.find((s) => s.materialId === material.id)
    expect(suggestion).toBeDefined()
    expect(suggestion?.suggestionType).toBe('purchase')
    expect(suggestion?.quantityShortfall).toBe(10)
    expect(suggestion?.sources).toHaveLength(1)
    expect(suggestion?.sources[0].productionOrderId).toBe(order.id)
    expect(suggestion?.sources[0].contributedQuantity).toBe(10)
  })

  it('3. Execução com sugestão de produção (subconjunto)', async () => {
    const user = await createTestUser('mrp-exec-production')
    createdUserIds.push(user.id)
    const mesa = await createTestProduct('mrp-exec-production-mesa')
    createdProductIds.push(mesa.id)
    const estrutura = await createTestProduct('mrp-exec-production-estrutura')
    createdProductIds.push(estrutura.id)
    const tubo = await createTestMaterial('mrp-exec-production-tubo')
    createdMaterialIds.push(tubo.id)

    const estruturaRevision = await releasedRevision(estrutura.id, user.id, 'A')
    await bomService.addLine(estruturaRevision.id, {
      lineType: 'material', materialId: tubo.id, componentProductId: null,
      quantity: 4, unit: 'KG', scrapPct: 0, order: 0, notes: '',
    })
    await bomService.changeStatus(estruturaRevision.id, 'released', user.id)

    const mesaRevision = await releasedRevision(mesa.id, user.id, 'A')
    await bomService.addLine(mesaRevision.id, {
      lineType: 'component', materialId: null, componentProductId: estrutura.id,
      quantity: 1, unit: 'UN', scrapPct: 0, order: 0, notes: '',
    })
    await bomService.changeStatus(mesaRevision.id, 'released', user.id)
    await openOrder(user.id, mesa.id, 6, mesaRevision.id)

    const run = (await mrpExecutionService.run(user.id)) as {
      id: string
      suggestions: Array<{ productId: string | null; suggestionType: string; quantityShortfall: number }>
    }
    createdRunIds.push(run.id)

    const suggestion = run.suggestions.find((s) => s.productId === estrutura.id)
    expect(suggestion?.suggestionType).toBe('production')
    expect(suggestion?.quantityShortfall).toBe(6)
  })

  it('4. Múltiplas OPs precisando do mesmo material consolidam em UMA sugestão com várias fontes', async () => {
    const user = await createTestUser('mrp-exec-consolidate')
    createdUserIds.push(user.id)
    const productA = await createTestProduct('mrp-exec-consolidate-a')
    createdProductIds.push(productA.id)
    const productB = await createTestProduct('mrp-exec-consolidate-b')
    createdProductIds.push(productB.id)
    const acoInox = await createTestMaterial('mrp-exec-consolidate-aco-inox')
    createdMaterialIds.push(acoInox.id)

    const revisionA = await releasedRevision(productA.id, user.id, 'A')
    await bomService.addLine(revisionA.id, { lineType: 'material', materialId: acoInox.id, componentProductId: null, quantity: 1, unit: 'KG', scrapPct: 0, order: 0, notes: '' })
    await bomService.changeStatus(revisionA.id, 'released', user.id)

    const revisionB = await releasedRevision(productB.id, user.id, 'A')
    await bomService.addLine(revisionB.id, { lineType: 'material', materialId: acoInox.id, componentProductId: null, quantity: 1, unit: 'KG', scrapPct: 0, order: 0, notes: '' })
    await bomService.changeStatus(revisionB.id, 'released', user.id)

    const orderA = await openOrder(user.id, productA.id, 10, revisionA.id)
    const orderB = await openOrder(user.id, productB.id, 15, revisionB.id)

    const run = (await mrpExecutionService.run(user.id)) as { id: string }
    createdRunIds.push(run.id)

    const suggestionsForMaterial = await db.mrpSuggestion.findMany({
      where: { mrpRunId: run.id, materialId: acoInox.id },
      include: { sources: true },
    })

    expect(suggestionsForMaterial).toHaveLength(1) // nunca uma sugestão por OP
    expect(suggestionsForMaterial[0].quantityShortfall).toBe(25)
    expect(suggestionsForMaterial[0].sources).toHaveLength(2)
    const orderIds = suggestionsForMaterial[0].sources.map((s) => s.productionOrderId).sort()
    expect(orderIds).toEqual([orderA.id, orderB.id].sort())
  })

  it('5. Falha durante a persistência desfaz TUDO — nenhum MrpRun/MrpSuggestion parcial fica salvo', async () => {
    const user = await createTestUser('mrp-exec-rollback')
    createdUserIds.push(user.id)
    const material = await createTestMaterial('mrp-exec-rollback')
    createdMaterialIds.push(material.id)

    const fakeCalculation: MrpCalculationResult = {
      openOrdersConsidered: 1,
      suggestions: [
        {
          itemType: 'material',
          materialId: material.id,
          productId: null,
          suggestionType: 'purchase',
          quantityNeeded: 10,
          quantityAvailable: 0,
          quantityReserved: 0,
          quantityShortfall: 10,
          productTypeSnapshot: null,
          supplierId: null,
          supplierNameSnapshot: null,
          sources: [{ productionOrderId: 'nao-existe-esta-op', quantity: 10 }], // FK inválida de propósito
        },
      ],
    }

    const bogusNumber = 'MRP-ROLLBACK-TESTE'
    await expect(mrpRunRepository.persist(bogusNumber, user.id, fakeCalculation)).rejects.toThrow()

    const persistedRun = await db.mrpRun.findUnique({ where: { number: bogusNumber } })
    expect(persistedRun).toBeNull()
    const orphanSuggestions = await db.mrpSuggestion.findMany({ where: { materialId: material.id } })
    expect(orphanSuggestions).toHaveLength(0)
  })

  it('6. Duas execuções independentes: cada uma com seu próprio número, ambas consultáveis', async () => {
    const user = await createTestUser('mrp-exec-independent')
    createdUserIds.push(user.id)

    const runA = (await mrpExecutionService.run(user.id)) as { id: string; number: string }
    createdRunIds.push(runA.id)
    const runB = (await mrpExecutionService.run(user.id)) as { id: string; number: string }
    createdRunIds.push(runB.id)

    expect(runA.id).not.toBe(runB.id)
    expect(runA.number).not.toBe(runB.number)

    const foundA = await db.mrpRun.findUnique({ where: { id: runA.id } })
    const foundB = await db.mrpRun.findUnique({ where: { id: runB.id } })
    expect(foundA).not.toBeNull()
    expect(foundB).not.toBeNull()
  })

  it('7. Reexecução com os mesmos dados mantém histórico — duas MrpRun, sem deduplicar entre execuções', async () => {
    const user = await createTestUser('mrp-exec-rerun')
    createdUserIds.push(user.id)
    const product = await createTestProduct('mrp-exec-rerun')
    createdProductIds.push(product.id)
    const material = await createTestMaterial('mrp-exec-rerun')
    createdMaterialIds.push(material.id)

    const revision = await releasedRevision(product.id, user.id, 'A')
    await bomService.addLine(revision.id, {
      lineType: 'material', materialId: material.id, componentProductId: null,
      quantity: 1, unit: 'KG', scrapPct: 0, order: 0, notes: '',
    })
    await bomService.changeStatus(revision.id, 'released', user.id)
    await openOrder(user.id, product.id, 9, revision.id)

    const firstRun = (await mrpExecutionService.run(user.id)) as { id: string }
    createdRunIds.push(firstRun.id)
    const secondRun = (await mrpExecutionService.run(user.id)) as { id: string }
    createdRunIds.push(secondRun.id)

    expect(firstRun.id).not.toBe(secondRun.id)

    const suggestionsFirst = await db.mrpSuggestion.findMany({ where: { mrpRunId: firstRun.id, materialId: material.id } })
    const suggestionsSecond = await db.mrpSuggestion.findMany({ where: { mrpRunId: secondRun.id, materialId: material.id } })

    // Mesma necessidade calculada nas duas execuções (mesmos dados de entrada), mas em registros
    // INDEPENDENTES — reexecutar não apaga nem funde com a execução anterior.
    expect(suggestionsFirst).toHaveLength(1)
    expect(suggestionsSecond).toHaveLength(1)
    expect(suggestionsFirst[0].id).not.toBe(suggestionsSecond[0].id)
    expect(suggestionsFirst[0].quantityShortfall).toBe(9)
    expect(suggestionsSecond[0].quantityShortfall).toBe(9)
  })
})
