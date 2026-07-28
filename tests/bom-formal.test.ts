import { describe, it, expect, afterAll } from 'vitest'
import { db } from '@/lib/db'
import { bomService } from '@/app/services/bom.service'
import { createTestUser, createTestProduct, createTestMaterial } from './helpers/fixtures'

/**
 * ADR-023 (item 4, "completar a BOM formal") — as 4 lacunas identificadas no levantamento: status
 * "em aprovação" opcional, motivo de alteração em StatusHistory, diff entre revisões, materiais
 * substitutos. `bom-revision.test.ts` continua cobrindo o núcleo (Fase 4, ADR-005); este arquivo só
 * cobre o que esta rodada adicionou.
 */
describe('Engenharia do Produto — BOM formal (ADR-023, item 4)', () => {
  const createdUserIds: string[] = []
  const createdProductIds: string[] = []
  const createdMaterialIds: string[] = []
  const createdRevisionIds: string[] = []

  afterAll(async () => {
    await db.bomLineSubstitute.deleteMany({ where: { bomLine: { bomRevisionId: { in: createdRevisionIds } } } })
    await db.bomRevision.deleteMany({ where: { id: { in: createdRevisionIds } } })
    await db.material.deleteMany({ where: { id: { in: createdMaterialIds } } })
    await db.product.deleteMany({ where: { id: { in: createdProductIds } } })
    await db.statusHistory.deleteMany({ where: { userId: { in: createdUserIds } } })
    await db.user.deleteMany({ where: { id: { in: createdUserIds } } })
  })

  it('1. draft → pending_approval → released é permitido (status intermediário opcional)', async () => {
    const user = await createTestUser('bom-formal-approval')
    createdUserIds.push(user.id)
    const product = await createTestProduct('bom-formal-approval')
    createdProductIds.push(product.id)

    const revision = (await bomService.createRevision(product.id, { revisionCode: 'A', notes: '' }, user.id)) as { id: string }
    createdRevisionIds.push(revision.id)

    await bomService.changeStatus(revision.id, 'pending_approval', user.id, 'Pronta para revisão do engenheiro')
    let refreshed = await db.bomRevision.findUnique({ where: { id: revision.id } })
    expect(refreshed?.status).toBe('pending_approval')

    // Estrutura continua congelada durante a aprovação — mesma trava do draft-only.
    await expect(
      bomService.addLine(revision.id, { lineType: 'material', materialId: null, componentProductId: null, quantity: 1, unit: 'UN', scrapPct: 0, order: 0, notes: '' })
    ).rejects.toThrow(/só pode ser alterada enquanto a revisão está em rascunho/)

    await bomService.changeStatus(revision.id, 'released', user.id)
    refreshed = await db.bomRevision.findUnique({ where: { id: revision.id } })
    expect(refreshed?.status).toBe('released')
  })

  it('2. pending_approval → draft (devolvida para ajuste) é permitido, e volta a ser editável', async () => {
    const user = await createTestUser('bom-formal-revert')
    createdUserIds.push(user.id)
    const product = await createTestProduct('bom-formal-revert')
    createdProductIds.push(product.id)
    const material = await createTestMaterial('bom-formal-revert')
    createdMaterialIds.push(material.id)

    const revision = (await bomService.createRevision(product.id, { revisionCode: 'A', notes: '' }, user.id)) as { id: string }
    createdRevisionIds.push(revision.id)

    await bomService.changeStatus(revision.id, 'pending_approval', user.id)
    await bomService.changeStatus(revision.id, 'draft', user.id, 'Faltou uma matéria-prima')

    const line = await bomService.addLine(revision.id, {
      lineType: 'material', materialId: material.id, componentProductId: null, quantity: 1, unit: 'KG', scrapPct: 0, order: 0, notes: '',
    })
    expect((line as { id: string }).id).toBeTruthy()
  })

  it('3. Motivo da transição é gravado em StatusHistory e recuperável', async () => {
    const user = await createTestUser('bom-formal-reason')
    createdUserIds.push(user.id)
    const product = await createTestProduct('bom-formal-reason')
    createdProductIds.push(product.id)

    const revision = (await bomService.createRevision(product.id, { revisionCode: 'A', notes: '' }, user.id)) as { id: string }
    createdRevisionIds.push(revision.id)

    await bomService.changeStatus(revision.id, 'released', user.id, 'Estrutura validada com o cliente')

    const history = await db.statusHistory.findMany({ where: { entityType: 'bom_revision', entityId: revision.id } })
    const releaseEntry = history.find((h) => h.toStatus === 'released')
    expect(releaseEntry?.reason).toBe('Estrutura validada com o cliente')
  })

  it('4. Motivo é opcional — transição sem motivo grava string vazia, não quebra', async () => {
    const user = await createTestUser('bom-formal-no-reason')
    createdUserIds.push(user.id)
    const product = await createTestProduct('bom-formal-no-reason')
    createdProductIds.push(product.id)

    const revision = (await bomService.createRevision(product.id, { revisionCode: 'A', notes: '' }, user.id)) as { id: string }
    createdRevisionIds.push(revision.id)

    await bomService.changeStatus(revision.id, 'released', user.id)

    const history = await db.statusHistory.findMany({ where: { entityType: 'bom_revision', entityId: revision.id } })
    expect(history[0]?.reason).toBe('')
  })

  it('5. Diff entre revisões: detecta linha adicionada, removida e alterada', async () => {
    const user = await createTestUser('bom-formal-diff')
    createdUserIds.push(user.id)
    const product = await createTestProduct('bom-formal-diff')
    createdProductIds.push(product.id)
    const materialA = await createTestMaterial('bom-formal-diff-a')
    createdMaterialIds.push(materialA.id)
    const materialB = await createTestMaterial('bom-formal-diff-b')
    createdMaterialIds.push(materialB.id)
    const materialC = await createTestMaterial('bom-formal-diff-c')
    createdMaterialIds.push(materialC.id)

    const revisionA = (await bomService.createRevision(product.id, { revisionCode: 'A', notes: '' }, user.id)) as { id: string }
    createdRevisionIds.push(revisionA.id)
    await bomService.addLine(revisionA.id, { lineType: 'material', materialId: materialA.id, componentProductId: null, quantity: 2, unit: 'KG', scrapPct: 0, order: 0, notes: '' })
    await bomService.addLine(revisionA.id, { lineType: 'material', materialId: materialB.id, componentProductId: null, quantity: 1, unit: 'KG', scrapPct: 0, order: 1, notes: '' })

    const revisionB = (await bomService.createRevision(product.id, { revisionCode: 'B', notes: '' }, user.id)) as { id: string }
    createdRevisionIds.push(revisionB.id)
    await bomService.addLine(revisionB.id, { lineType: 'material', materialId: materialA.id, componentProductId: null, quantity: 5, unit: 'KG', scrapPct: 0, order: 0, notes: '' }) // alterada (2 -> 5)
    await bomService.addLine(revisionB.id, { lineType: 'material', materialId: materialC.id, componentProductId: null, quantity: 1, unit: 'UN', scrapPct: 0, order: 1, notes: '' }) // adicionada
    // materialB não entra em B -> removida

    const diff = await bomService.compareRevisions(revisionA.id, revisionB.id)

    expect(diff.added).toHaveLength(1)
    expect(diff.added[0].name).toBe(materialC.name)
    expect(diff.removed).toHaveLength(1)
    expect(diff.removed[0].name).toBe(materialB.name)
    expect(diff.changed).toHaveLength(1)
    expect(diff.changed[0].name).toBe(materialA.name)
    expect(diff.changed[0].quantityFrom).toBe(2)
    expect(diff.changed[0].quantityTo).toBe(5)
  })

  it('6. Diff recusa comparar revisões de produtos diferentes', async () => {
    const user = await createTestUser('bom-formal-diff-cross')
    createdUserIds.push(user.id)
    const productX = await createTestProduct('bom-formal-diff-cross-x')
    createdProductIds.push(productX.id)
    const productY = await createTestProduct('bom-formal-diff-cross-y')
    createdProductIds.push(productY.id)

    const revisionX = (await bomService.createRevision(productX.id, { revisionCode: 'A', notes: '' }, user.id)) as { id: string }
    createdRevisionIds.push(revisionX.id)
    const revisionY = (await bomService.createRevision(productY.id, { revisionCode: 'A', notes: '' }, user.id)) as { id: string }
    createdRevisionIds.push(revisionY.id)

    await expect(bomService.compareRevisions(revisionX.id, revisionY.id)).rejects.toThrow(/mesmo produto/)
  })

  it('7. Materiais substitutos: adiciona, lista e remove; recusa duplicado e o próprio material da linha', async () => {
    const user = await createTestUser('bom-formal-substitute')
    createdUserIds.push(user.id)
    const product = await createTestProduct('bom-formal-substitute')
    createdProductIds.push(product.id)
    const material = await createTestMaterial('bom-formal-substitute-main')
    createdMaterialIds.push(material.id)
    const substitute1 = await createTestMaterial('bom-formal-substitute-sub1')
    createdMaterialIds.push(substitute1.id)

    const revision = (await bomService.createRevision(product.id, { revisionCode: 'A', notes: '' }, user.id)) as { id: string }
    createdRevisionIds.push(revision.id)
    const line = (await bomService.addLine(revision.id, {
      lineType: 'material', materialId: material.id, componentProductId: null, quantity: 1, unit: 'KG', scrapPct: 0, order: 0, notes: '',
    })) as { id: string }

    await expect(bomService.addSubstitute(revision.id, line.id, material.id, '')).rejects.toThrow(/não pode ser o mesmo material/)

    const created = (await bomService.addSubstitute(revision.id, line.id, substitute1.id, 'Equivalente, mesma bitola')) as { id: string }
    expect(created.id).toBeTruthy()

    await expect(bomService.addSubstitute(revision.id, line.id, substitute1.id, '')).rejects.toThrow(/já está cadastrado/)

    const list = await bomService.listSubstitutes(revision.id, line.id)
    expect(list).toHaveLength(1)

    await bomService.removeSubstitute(revision.id, line.id, created.id)
    const listAfter = await bomService.listSubstitutes(revision.id, line.id)
    expect(listAfter).toHaveLength(0)
  })

  it('8. Materiais substitutos: recusa em linha de componente (subconjunto), só material é suportado', async () => {
    const user = await createTestUser('bom-formal-substitute-component')
    createdUserIds.push(user.id)
    const parent = await createTestProduct('bom-formal-substitute-component-parent')
    createdProductIds.push(parent.id)
    const component = await createTestProduct('bom-formal-substitute-component-child')
    createdProductIds.push(component.id)
    const someMaterial = await createTestMaterial('bom-formal-substitute-component')
    createdMaterialIds.push(someMaterial.id)

    const revision = (await bomService.createRevision(parent.id, { revisionCode: 'A', notes: '' }, user.id)) as { id: string }
    createdRevisionIds.push(revision.id)
    const line = (await bomService.addLine(revision.id, {
      lineType: 'component', materialId: null, componentProductId: component.id, quantity: 1, unit: 'UN', scrapPct: 0, order: 0, notes: '',
    })) as { id: string }

    await expect(bomService.addSubstitute(revision.id, line.id, someMaterial.id, '')).rejects.toThrow(/Só linhas de matéria-prima/)
  })

  it('9. Materiais substitutos só podem ser editados enquanto a revisão está em rascunho', async () => {
    const user = await createTestUser('bom-formal-substitute-locked')
    createdUserIds.push(user.id)
    const product = await createTestProduct('bom-formal-substitute-locked')
    createdProductIds.push(product.id)
    const material = await createTestMaterial('bom-formal-substitute-locked-main')
    createdMaterialIds.push(material.id)
    const substitute1 = await createTestMaterial('bom-formal-substitute-locked-sub')
    createdMaterialIds.push(substitute1.id)

    const revision = (await bomService.createRevision(product.id, { revisionCode: 'A', notes: '' }, user.id)) as { id: string }
    createdRevisionIds.push(revision.id)
    const line = (await bomService.addLine(revision.id, {
      lineType: 'material', materialId: material.id, componentProductId: null, quantity: 1, unit: 'KG', scrapPct: 0, order: 0, notes: '',
    })) as { id: string }

    await bomService.changeStatus(revision.id, 'released', user.id)

    await expect(bomService.addSubstitute(revision.id, line.id, substitute1.id, '')).rejects.toThrow(/só pode ser alterada enquanto a revisão está em rascunho/)
  })
})
