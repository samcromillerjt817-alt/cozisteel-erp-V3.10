import { describe, it, expect, afterAll } from 'vitest'
import { db } from '@/lib/db'
import { bomService } from '@/app/services/bom.service'
import { reservationReconciliationService } from '@/app/services/reservation-reconciliation.service'
import { createTestUser, createTestProduct, createTestMaterial } from './helpers/fixtures'

/**
 * ADR-012 — Subetapa 1: `ReservationReconciliationService` isolado, sem integração com
 * `produce()`/`produceWithTx()` ainda (Subetapa 2). Testa só a lógica de reconciliação em si:
 * dado um conjunto de linhas de consumo (um nível, como o chamador real já resolve) e uma
 * quantidade produzida, quais reservas (de qualquer profundidade) isso cobre.
 */
describe('Reconciliação de Reserva Multinível — Subetapa 1 (ADR-012)', () => {
  const createdUserIds: string[] = []
  const createdProductIds: string[] = []
  const createdMaterialIds: string[] = []
  const createdRevisionIds: string[] = []
  const createdLineIds: string[] = []

  afterAll(async () => {
    await db.bomLine.deleteMany({ where: { id: { in: createdLineIds } } })
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

  it('1. Reconcilia estrutura de 2 níveis (Mesa consome Estrutura → libera reserva de Tubo, nunca de Estrutura)', async () => {
    const user = await createTestUser('reconcile-2levels')
    createdUserIds.push(user.id)
    const estrutura = await createTestProduct('reconcile-2levels-estrutura')
    createdProductIds.push(estrutura.id)
    const tubo = await createTestMaterial('reconcile-2levels-tubo')
    createdMaterialIds.push(tubo.id)

    const revision = await releasedRevision(estrutura.id, user.id, 'A')
    await bomService.addLine(revision.id, { lineType: 'material', materialId: tubo.id, componentProductId: null, quantity: 1, unit: 'KG', scrapPct: 0, order: 0, notes: '' })
    await bomService.changeStatus(revision.id, 'released', user.id)

    // Simula a linha de consumo direta de Mesa (um nível, como resolveConsumptionLines já resolve hoje).
    const lines = [{ lineType: 'component', materialId: null, componentProductId: estrutura.id, quantity: 1, scrapPct: 0 }]

    const result = await reservationReconciliationService.resolveReleaseTargets(lines, 30)

    expect(result.materialNeeds.get(tubo.id)).toBe(30) // 1 * 1 * 30
    expect(result.productNeeds.has(estrutura.id)).toBe(false) // Estrutura nunca é "folha" de reserva
  })

  it('5. Consumo proporcional — rodada de X% libera exatamente X% (com scrap aplicado), em qualquer profundidade', async () => {
    const user = await createTestUser('reconcile-proportional')
    createdUserIds.push(user.id)
    const estrutura = await createTestProduct('reconcile-proportional-estrutura')
    createdProductIds.push(estrutura.id)
    const tubo = await createTestMaterial('reconcile-proportional-tubo')
    createdMaterialIds.push(tubo.id)

    const revision = await releasedRevision(estrutura.id, user.id, 'A')
    await bomService.addLine(revision.id, { lineType: 'material', materialId: tubo.id, componentProductId: null, quantity: 2, unit: 'KG', scrapPct: 10, order: 0, notes: '' })
    await bomService.changeStatus(revision.id, 'released', user.id)

    const lines = [{ lineType: 'component', materialId: null, componentProductId: estrutura.id, quantity: 1, scrapPct: 0 }]

    // Rodada de 25 unidades (25% de uma OP hipotética de 100).
    const result = await reservationReconciliationService.resolveReleaseTargets(lines, 25)

    // consumedQty de Estrutura = 1*25 = 25 ; dentro dela, Tubo = 2 * (1+10/100) * 25 = 55
    expect(result.materialNeeds.get(tubo.id)).toBeCloseTo(55)
  })

  it('7. Subconjunto reutilizado em produtos-pai diferentes: cada reconciliação é independente (sem estado compartilhado)', async () => {
    const user = await createTestUser('reconcile-reused')
    createdUserIds.push(user.id)
    const estrutura = await createTestProduct('reconcile-reused-estrutura')
    createdProductIds.push(estrutura.id)
    const tubo = await createTestMaterial('reconcile-reused-tubo')
    createdMaterialIds.push(tubo.id)

    const revision = await releasedRevision(estrutura.id, user.id, 'A')
    await bomService.addLine(revision.id, { lineType: 'material', materialId: tubo.id, componentProductId: null, quantity: 1, unit: 'KG', scrapPct: 0, order: 0, notes: '' })
    await bomService.changeStatus(revision.id, 'released', user.id)

    const lines = [{ lineType: 'component', materialId: null, componentProductId: estrutura.id, quantity: 1, scrapPct: 0 }]

    // Duas "OPs" diferentes (Mesa e Cadeira) consumindo a mesma Estrutura, em rodadas distintas.
    const resultMesa = await reservationReconciliationService.resolveReleaseTargets(lines, 10)
    const resultCadeira = await reservationReconciliationService.resolveReleaseTargets(lines, 40)

    expect(resultMesa.materialNeeds.get(tubo.id)).toBe(10)
    expect(resultCadeira.materialNeeds.get(tubo.id)).toBe(40) // não soma com a chamada anterior
  })

  it('8. Reconcilia estrutura profunda (4+ níveis), reaproveitando a recursão de bomExplosionService', async () => {
    const user = await createTestUser('reconcile-deep')
    createdUserIds.push(user.id)
    const p2 = await createTestProduct('reconcile-deep-2')
    createdProductIds.push(p2.id)
    const p3 = await createTestProduct('reconcile-deep-3')
    createdProductIds.push(p3.id)
    const p4 = await createTestProduct('reconcile-deep-4')
    createdProductIds.push(p4.id)
    const material = await createTestMaterial('reconcile-deep')
    createdMaterialIds.push(material.id)

    const rev4 = await releasedRevision(p4.id, user.id, 'A')
    await bomService.addLine(rev4.id, { lineType: 'material', materialId: material.id, componentProductId: null, quantity: 5, unit: 'KG', scrapPct: 0, order: 0, notes: '' })
    await bomService.changeStatus(rev4.id, 'released', user.id)

    const rev3 = await releasedRevision(p3.id, user.id, 'A')
    await bomService.addLine(rev3.id, { lineType: 'component', materialId: null, componentProductId: p4.id, quantity: 2, unit: 'UN', scrapPct: 0, order: 0, notes: '' })
    await bomService.changeStatus(rev3.id, 'released', user.id)

    const rev2 = await releasedRevision(p2.id, user.id, 'A')
    await bomService.addLine(rev2.id, { lineType: 'component', materialId: null, componentProductId: p3.id, quantity: 3, unit: 'UN', scrapPct: 0, order: 0, notes: '' })
    await bomService.changeStatus(rev2.id, 'released', user.id)

    // p2 é o componente diretamente consumido pela OP (nível 1 do consumo físico).
    const lines = [{ lineType: 'component', materialId: null, componentProductId: p2.id, quantity: 1, scrapPct: 0 }]

    const result = await reservationReconciliationService.resolveReleaseTargets(lines, 1)

    // 3 (p2->p3) * 2 (p3->p4) * 5 (p4->material) = 30
    expect(result.materialNeeds.get(material.id)).toBe(30)
  })

  it('9. Propaga a detecção de ciclo do bomExplosionService, sem mascarar nem duplicar', async () => {
    const user = await createTestUser('reconcile-cycle')
    createdUserIds.push(user.id)
    const productA = await createTestProduct('reconcile-cycle-a')
    createdProductIds.push(productA.id)
    const productB = await createTestProduct('reconcile-cycle-b')
    createdProductIds.push(productB.id)

    const revisionA = await releasedRevision(productA.id, user.id, 'A')
    await bomService.addLine(revisionA.id, { lineType: 'component', materialId: null, componentProductId: productB.id, quantity: 1, unit: 'UN', scrapPct: 0, order: 0, notes: '' })
    await bomService.changeStatus(revisionA.id, 'released', user.id)

    const revisionB = await releasedRevision(productB.id, user.id, 'A')
    await bomService.addLine(revisionB.id, { lineType: 'component', materialId: null, componentProductId: productA.id, quantity: 1, unit: 'UN', scrapPct: 0, order: 0, notes: '' })
    await bomService.changeStatus(revisionB.id, 'released', user.id)

    const lines = [{ lineType: 'component', materialId: null, componentProductId: productA.id, quantity: 1, scrapPct: 0 }]

    await expect(reservationReconciliationService.resolveReleaseTargets(lines, 1)).rejects.toThrow(/Ciclo detectado/)
  })

  it('10. Componente sem revisão própria continua tratado como folha direta (regressão do comportamento atual)', async () => {
    const purchasedComponent = await createTestProduct('reconcile-purchased')
    createdProductIds.push(purchasedComponent.id)
    // Nunca recebe BomRevision — simula item comprado/terceirizado.

    const lines = [{ lineType: 'component', materialId: null, componentProductId: purchasedComponent.id, quantity: 3, scrapPct: 0 }]

    const result = await reservationReconciliationService.resolveReleaseTargets(lines, 2)

    expect(result.productNeeds.get(purchasedComponent.id)).toBe(6) // 3*2, sem reexplosão
    expect(result.materialNeeds.size).toBe(0)
  })

  it('13. Mesma matéria-prima usada em dois subconjuntos diferentes, consumidos na MESMA rodada — soma corretamente', async () => {
    const user = await createTestUser('reconcile-shared-material')
    createdUserIds.push(user.id)
    const estrutura = await createTestProduct('reconcile-shared-estrutura')
    createdProductIds.push(estrutura.id)
    const pe = await createTestProduct('reconcile-shared-pe')
    createdProductIds.push(pe.id)
    const tubo = await createTestMaterial('reconcile-shared-tubo')
    createdMaterialIds.push(tubo.id)

    const revEstrutura = await releasedRevision(estrutura.id, user.id, 'A')
    await bomService.addLine(revEstrutura.id, { lineType: 'material', materialId: tubo.id, componentProductId: null, quantity: 1, unit: 'KG', scrapPct: 0, order: 0, notes: '' })
    await bomService.changeStatus(revEstrutura.id, 'released', user.id)

    const revPe = await releasedRevision(pe.id, user.id, 'A')
    await bomService.addLine(revPe.id, { lineType: 'material', materialId: tubo.id, componentProductId: null, quantity: 2, unit: 'KG', scrapPct: 0, order: 0, notes: '' })
    await bomService.changeStatus(revPe.id, 'released', user.id)

    // Mesa consome 1 Estrutura e 4 Pés na mesma rodada — ambos usam Tubo internamente.
    const lines = [
      { lineType: 'component', materialId: null, componentProductId: estrutura.id, quantity: 1, scrapPct: 0 },
      { lineType: 'component', materialId: null, componentProductId: pe.id, quantity: 4, scrapPct: 0 },
    ]

    const result = await reservationReconciliationService.resolveReleaseTargets(lines, 10)

    // via Estrutura: 1*10=10 unidades de Estrutura -> Tubo = 1*10 = 10
    // via Pé: 4*10=40 unidades de Pé -> Tubo = 2*40 = 80
    // total Tubo = 10 + 80 = 90, numa única chave, uma única liberação
    expect(result.materialNeeds.get(tubo.id)).toBe(90)
  })

  it('14. Múltiplas revisões de BOM coexistindo (simulando duas OPs congeladas em revisões diferentes do mesmo produto)', async () => {
    const user = await createTestUser('reconcile-multi-revision')
    createdUserIds.push(user.id)
    const estrutura = await createTestProduct('reconcile-multi-revision-estrutura')
    createdProductIds.push(estrutura.id)
    const tuboAntigo = await createTestMaterial('reconcile-multi-revision-tubo-antigo')
    createdMaterialIds.push(tuboAntigo.id)
    const tuboNovo = await createTestMaterial('reconcile-multi-revision-tubo-novo')
    createdMaterialIds.push(tuboNovo.id)

    // Revisão A (antiga) — seria a congelada na OP-1.
    const revA = await releasedRevision(estrutura.id, user.id, 'A')
    await bomService.addLine(revA.id, { lineType: 'material', materialId: tuboAntigo.id, componentProductId: null, quantity: 1, unit: 'KG', scrapPct: 0, order: 0, notes: '' })
    await bomService.changeStatus(revA.id, 'released', user.id)

    // Revisão B (nova, liberada depois) — seria a congelada na OP-2, criada mais tarde.
    const revB = await releasedRevision(estrutura.id, user.id, 'B')
    await bomService.addLine(revB.id, { lineType: 'material', materialId: tuboNovo.id, componentProductId: null, quantity: 3, unit: 'KG', scrapPct: 0, order: 0, notes: '' })
    await bomService.changeStatus(revB.id, 'released', user.id)

    // Cada "OP" já resolveu suas próprias linhas de consumo a partir da SUA revisão congelada
    // (responsabilidade do chamador — resolveConsumptionLines, não deste serviço). Aqui simulamos
    // isso diretamente: a linha de consumo em si já reflete a revisão congelada de cada OP.
    const linesOp1 = [{ lineType: 'material', materialId: tuboAntigo.id, componentProductId: null, quantity: 1, scrapPct: 0 }]
    const linesOp2 = [{ lineType: 'material', materialId: tuboNovo.id, componentProductId: null, quantity: 3, scrapPct: 0 }]

    const resultOp1 = await reservationReconciliationService.resolveReleaseTargets(linesOp1, 20)
    const resultOp2 = await reservationReconciliationService.resolveReleaseTargets(linesOp2, 5)

    expect(resultOp1.materialNeeds.get(tuboAntigo.id)).toBe(20)
    expect(resultOp1.materialNeeds.has(tuboNovo.id)).toBe(false)
    expect(resultOp2.materialNeeds.get(tuboNovo.id)).toBe(15) // 3*5
    expect(resultOp2.materialNeeds.has(tuboAntigo.id)).toBe(false)
  })

  it('16. Reconciliação de um subconjunto reflete a revisão ATIVA dele no momento da chamada (não fica presa à revisão antiga)', async () => {
    const user = await createTestUser('reconcile-active-change')
    createdUserIds.push(user.id)
    const estrutura = await createTestProduct('reconcile-active-change-estrutura')
    createdProductIds.push(estrutura.id)
    const tuboAntigo = await createTestMaterial('reconcile-active-change-antigo')
    createdMaterialIds.push(tuboAntigo.id)
    const tuboNovo = await createTestMaterial('reconcile-active-change-novo')
    createdMaterialIds.push(tuboNovo.id)

    const revA = await releasedRevision(estrutura.id, user.id, 'A')
    await bomService.addLine(revA.id, { lineType: 'material', materialId: tuboAntigo.id, componentProductId: null, quantity: 2, unit: 'KG', scrapPct: 0, order: 0, notes: '' })
    await bomService.changeStatus(revA.id, 'released', user.id)

    // Linha de consumo do "nível 1" (a OP consumindo Estrutura como componente) não muda —
    // congelamento da RAIZ é responsabilidade do chamador (resolveConsumptionLines,
    // order.bomRevisionId), já garantido e testado na suíte do ADR-011, fora do escopo deste
    // serviço. O que este teste verifica é o nível ABAIXO da raiz (Estrutura em si).
    const lines = [{ lineType: 'component', materialId: null, componentProductId: estrutura.id, quantity: 1, scrapPct: 0 }]

    const resultBefore = await reservationReconciliationService.resolveReleaseTargets(lines, 10)
    expect(resultBefore.materialNeeds.get(tuboAntigo.id)).toBe(20) // 2*10

    // Nova revisão liberada para Estrutura DEPOIS da primeira chamada — passa a ser a ativa.
    const revB = await releasedRevision(estrutura.id, user.id, 'B')
    await bomService.addLine(revB.id, { lineType: 'material', materialId: tuboNovo.id, componentProductId: null, quantity: 5, unit: 'KG', scrapPct: 0, order: 0, notes: '' })
    await bomService.changeStatus(revB.id, 'released', user.id)

    const resultAfter = await reservationReconciliationService.resolveReleaseTargets(lines, 10)

    // Mesmo input (`lines` idêntico) — resultado muda porque Estrutura (sub-nível, não raiz)
    // sempre resolve pela revisão ATIVA agora, exatamente como a Reserva já faz hoje (ADR-006).
    expect(resultAfter.materialNeeds.get(tuboNovo.id)).toBe(50) // 5*10
    expect(resultAfter.materialNeeds.has(tuboAntigo.id)).toBe(false)
  })
})
