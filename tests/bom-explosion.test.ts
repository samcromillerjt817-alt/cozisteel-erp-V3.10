import { describe, it, expect, afterAll } from 'vitest'
import { db } from '@/lib/db'
import { bomService } from '@/app/services/bom.service'
import { bomExplosionService } from '@/app/services/bom-explosion.service'
import { createTestUser, createTestProduct, createTestMaterial } from './helpers/fixtures'

/**
 * Fase 5, Subetapa 2 (ADR-006): explosão recursiva de BOM, com atenção especial a detecção de
 * ciclos (diretos e indiretos) e comportamento em estruturas profundas/em losango.
 */
describe('Explosão de BOM (Subetapa 2)', () => {
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

  it('explode um único nível (só linhas de material)', async () => {
    const user = await createTestUser('explosion-flat')
    createdUserIds.push(user.id)
    const product = await createTestProduct('explosion-flat')
    createdProductIds.push(product.id)
    const materialA = await createTestMaterial('explosion-flat-a')
    createdMaterialIds.push(materialA.id)
    const materialB = await createTestMaterial('explosion-flat-b')
    createdMaterialIds.push(materialB.id)

    const revision = await releasedRevision(product.id, user.id, 'A')
    await bomService.addLine(revision.id, {
      lineType: 'material', materialId: materialA.id, componentProductId: null,
      quantity: 2, unit: 'KG', scrapPct: 10, order: 0, notes: '',
    })
    await bomService.addLine(revision.id, {
      lineType: 'material', materialId: materialB.id, componentProductId: null,
      quantity: 1, unit: 'UN', scrapPct: 0, order: 1, notes: '',
    })
    await bomService.changeStatus(revision.id, 'released', user.id)

    const result = await bomExplosionService.explode(product.id, 3)

    // materialA: 2 * (1 + 10/100) * 3 = 6.6 ; materialB: 1 * 1 * 3 = 3
    expect(result.materialNeeds.get(materialA.id)).toBeCloseTo(6.6)
    expect(result.materialNeeds.get(materialB.id)).toBe(3)
    expect(result.productNeeds.size).toBe(0)
  })

  it('explode múltiplos níveis (subconjunto com sua própria revisão)', async () => {
    const user = await createTestUser('explosion-nested')
    createdUserIds.push(user.id)
    const parent = await createTestProduct('explosion-nested-parent')
    createdProductIds.push(parent.id)
    const sub = await createTestProduct('explosion-nested-sub')
    createdProductIds.push(sub.id)
    const material = await createTestMaterial('explosion-nested')
    createdMaterialIds.push(material.id)

    const subRevision = await releasedRevision(sub.id, user.id, 'A')
    await bomService.addLine(subRevision.id, {
      lineType: 'material', materialId: material.id, componentProductId: null,
      quantity: 5, unit: 'KG', scrapPct: 0, order: 0, notes: '',
    })
    await bomService.changeStatus(subRevision.id, 'released', user.id)

    const parentRevision = await releasedRevision(parent.id, user.id, 'A')
    await bomService.addLine(parentRevision.id, {
      lineType: 'component', materialId: null, componentProductId: sub.id,
      quantity: 2, unit: 'UN', scrapPct: 0, order: 0, notes: '',
    })
    await bomService.changeStatus(parentRevision.id, 'released', user.id)

    const result = await bomExplosionService.explode(parent.id, 4)

    // sub necessário: 2 * 4 = 8 ; material dentro do sub: 5 * 8 = 40
    expect(result.materialNeeds.get(material.id)).toBe(40)
    expect(result.productNeeds.size).toBe(0)
  })

  it('trata componente sem revisão liberada como necessidade direta de produto', async () => {
    const user = await createTestUser('explosion-purchased')
    createdUserIds.push(user.id)
    const parent = await createTestProduct('explosion-purchased-parent')
    createdProductIds.push(parent.id)
    const purchasedComponent = await createTestProduct('explosion-purchased-component')
    createdProductIds.push(purchasedComponent.id)
    // purchasedComponent NUNCA recebe uma BomRevision — simula item comprado pronto

    const parentRevision = await releasedRevision(parent.id, user.id, 'A')
    await bomService.addLine(parentRevision.id, {
      lineType: 'component', materialId: null, componentProductId: purchasedComponent.id,
      quantity: 3, unit: 'UN', scrapPct: 0, order: 0, notes: '',
    })
    await bomService.changeStatus(parentRevision.id, 'released', user.id)

    const result = await bomExplosionService.explode(parent.id, 2)

    expect(result.productNeeds.get(purchasedComponent.id)).toBe(6)
    expect(result.materialNeeds.size).toBe(0)
  })

  it('detecta ciclo direto (defesa em profundidade — dado inserido diretamente, fora do BomService)', async () => {
    const user = await createTestUser('explosion-direct-cycle')
    createdUserIds.push(user.id)
    const product = await createTestProduct('explosion-direct-cycle')
    createdProductIds.push(product.id)

    const revision = await releasedRevision(product.id, user.id, 'A')
    // BomService.addLine bloqueia isso — inserido direto no banco pra testar a defesa da própria explosão
    const line = await db.bomLine.create({
      data: { bomRevisionId: revision.id, lineType: 'component', componentProductId: product.id, quantity: 1, unit: 'UN' },
    })
    createdLineIds.push(line.id)
    await bomService.changeStatus(revision.id, 'released', user.id)

    await expect(bomExplosionService.explode(product.id, 1)).rejects.toThrow(/Ciclo detectado/)
  })

  it('detecta ciclo indireto (A → B → A, construído pelo fluxo normal do BomService)', async () => {
    const user = await createTestUser('explosion-indirect-cycle')
    createdUserIds.push(user.id)
    const productA = await createTestProduct('explosion-indirect-a')
    createdProductIds.push(productA.id)
    const productB = await createTestProduct('explosion-indirect-b')
    createdProductIds.push(productB.id)

    const revisionA = await releasedRevision(productA.id, user.id, 'A')
    await bomService.addLine(revisionA.id, {
      lineType: 'component', materialId: null, componentProductId: productB.id,
      quantity: 1, unit: 'UN', scrapPct: 0, order: 0, notes: '',
    })
    await bomService.changeStatus(revisionA.id, 'released', user.id)

    const revisionB = await releasedRevision(productB.id, user.id, 'A')
    await bomService.addLine(revisionB.id, {
      lineType: 'component', materialId: null, componentProductId: productA.id,
      quantity: 1, unit: 'UN', scrapPct: 0, order: 0, notes: '',
    })
    await bomService.changeStatus(revisionB.id, 'released', user.id)

    await expect(bomExplosionService.explode(productA.id, 1)).rejects.toThrow(/Ciclo detectado/)
  })

  it('explode corretamente uma estrutura profunda (4 níveis encadeados)', async () => {
    const user = await createTestUser('explosion-deep')
    createdUserIds.push(user.id)
    const p1 = await createTestProduct('explosion-deep-1')
    createdProductIds.push(p1.id)
    const p2 = await createTestProduct('explosion-deep-2')
    createdProductIds.push(p2.id)
    const p3 = await createTestProduct('explosion-deep-3')
    createdProductIds.push(p3.id)
    const p4 = await createTestProduct('explosion-deep-4')
    createdProductIds.push(p4.id)
    const material = await createTestMaterial('explosion-deep')
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

    const rev1 = await releasedRevision(p1.id, user.id, 'A')
    await bomService.addLine(rev1.id, { lineType: 'component', materialId: null, componentProductId: p2.id, quantity: 2, unit: 'UN', scrapPct: 0, order: 0, notes: '' })
    await bomService.changeStatus(rev1.id, 'released', user.id)

    const result = await bomExplosionService.explode(p1.id, 1)

    // 2 (p1->p2) * 3 (p2->p3) * 2 (p3->p4) * 5 (p4->material) = 60
    expect(result.materialNeeds.get(material.id)).toBe(60)
  })

  it('estrutura em losango (mesmo componente em dois ramos) agrega corretamente, sem falso ciclo', async () => {
    const user = await createTestUser('explosion-diamond')
    createdUserIds.push(user.id)
    const top = await createTestProduct('explosion-diamond-top')
    createdProductIds.push(top.id)
    const branchX = await createTestProduct('explosion-diamond-x')
    createdProductIds.push(branchX.id)
    const branchY = await createTestProduct('explosion-diamond-y')
    createdProductIds.push(branchY.id)
    const shared = await createTestProduct('explosion-diamond-shared')
    createdProductIds.push(shared.id)
    const material = await createTestMaterial('explosion-diamond')
    createdMaterialIds.push(material.id)

    const sharedRevision = await releasedRevision(shared.id, user.id, 'A')
    await bomService.addLine(sharedRevision.id, { lineType: 'material', materialId: material.id, componentProductId: null, quantity: 5, unit: 'KG', scrapPct: 0, order: 0, notes: '' })
    await bomService.changeStatus(sharedRevision.id, 'released', user.id)

    const xRevision = await releasedRevision(branchX.id, user.id, 'A')
    await bomService.addLine(xRevision.id, { lineType: 'component', materialId: null, componentProductId: shared.id, quantity: 2, unit: 'UN', scrapPct: 0, order: 0, notes: '' })
    await bomService.changeStatus(xRevision.id, 'released', user.id)

    const yRevision = await releasedRevision(branchY.id, user.id, 'A')
    await bomService.addLine(yRevision.id, { lineType: 'component', materialId: null, componentProductId: shared.id, quantity: 3, unit: 'UN', scrapPct: 0, order: 0, notes: '' })
    await bomService.changeStatus(yRevision.id, 'released', user.id)

    const topRevision = await releasedRevision(top.id, user.id, 'A')
    await bomService.addLine(topRevision.id, { lineType: 'component', materialId: null, componentProductId: branchX.id, quantity: 1, unit: 'UN', scrapPct: 0, order: 0, notes: '' })
    await bomService.addLine(topRevision.id, { lineType: 'component', materialId: null, componentProductId: branchY.id, quantity: 1, unit: 'UN', scrapPct: 0, order: 1, notes: '' })
    await bomService.changeStatus(topRevision.id, 'released', user.id)

    const result = await bomExplosionService.explode(top.id, 1)

    // via X: shared=2, material=5*2=10 ; via Y: shared=3, material=5*3=15 ; total=25
    expect(result.materialNeeds.get(material.id)).toBe(25)
  })
})
