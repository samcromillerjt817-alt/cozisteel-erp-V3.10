import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { db } from '@/lib/db'
import { bomService } from '@/app/services/bom.service'
import { createTestUser, createTestProduct, createTestMaterial } from './helpers/fixtures'

/**
 * Integração da Fase 4, Subetapa 1 (ADR-005): BomRevision + BomLine. Chama o Service diretamente
 * (sem HTTP) contra o banco de teste dedicado — mesmo padrão da Fase 3.1.
 */
describe('Engenharia do Produto — BomRevision/BomLine (Subetapa 1)', () => {
  const createdUserIds: string[] = []
  const createdProductIds: string[] = []
  const createdMaterialIds: string[] = []
  const createdRevisionIds: string[] = []

  afterAll(async () => {
    await db.bomRevision.deleteMany({ where: { id: { in: createdRevisionIds } } })
    await db.material.deleteMany({ where: { id: { in: createdMaterialIds } } })
    await db.product.deleteMany({ where: { id: { in: createdProductIds } } })
    await db.statusHistory.deleteMany({ where: { userId: { in: createdUserIds } } })
    await db.user.deleteMany({ where: { id: { in: createdUserIds } } })
  })

  it('cria a primeira revisão de um produto em rascunho', async () => {
    const user = await createTestUser('bom-create')
    createdUserIds.push(user.id)
    const product = await createTestProduct('bom-create')
    createdProductIds.push(product.id)

    const revision = (await bomService.createRevision(product.id, { revisionCode: 'A', notes: '' }, user.id)) as {
      id: string
      status: string
      revisionCode: string
    }
    createdRevisionIds.push(revision.id)

    expect(revision.status).toBe('draft')
    expect(revision.revisionCode).toBe('A')
  })

  it('rejeita revisionCode duplicado para o mesmo produto', async () => {
    const user = await createTestUser('bom-dup')
    createdUserIds.push(user.id)
    const product = await createTestProduct('bom-dup')
    createdProductIds.push(product.id)

    const revision = (await bomService.createRevision(product.id, { revisionCode: 'A', notes: '' }, user.id)) as { id: string }
    createdRevisionIds.push(revision.id)

    await expect(bomService.createRevision(product.id, { revisionCode: 'A', notes: '' }, user.id)).rejects.toThrow(
      /Já existe uma revisão/
    )
  })

  it('adiciona linha de material e linha de componente (subconjunto) a uma revisão em rascunho', async () => {
    const user = await createTestUser('bom-lines')
    createdUserIds.push(user.id)
    const parent = await createTestProduct('bom-lines-parent')
    createdProductIds.push(parent.id)
    const component = await createTestProduct('bom-lines-component')
    createdProductIds.push(component.id)
    const material = await createTestMaterial('bom-lines')
    createdMaterialIds.push(material.id)

    const revision = (await bomService.createRevision(parent.id, { revisionCode: 'A', notes: '' }, user.id)) as { id: string }
    createdRevisionIds.push(revision.id)

    const materialLine = await bomService.addLine(revision.id, {
      lineType: 'material',
      materialId: material.id,
      componentProductId: null,
      quantity: 2,
      unit: 'KG',
      scrapPct: 5,
      order: 0,
      notes: '',
    })
    const componentLine = await bomService.addLine(revision.id, {
      lineType: 'component',
      materialId: null,
      componentProductId: component.id,
      quantity: 1,
      unit: 'UN',
      scrapPct: 0,
      order: 1,
      notes: '',
    })

    const lines = await bomService.listLines(revision.id)
    expect(lines).toHaveLength(2)
    expect((materialLine as { lineType: string }).lineType).toBe('material')
    expect((componentLine as { lineType: string }).lineType).toBe('component')
  })

  it('rejeita um produto como componente de si mesmo', async () => {
    const user = await createTestUser('bom-self')
    createdUserIds.push(user.id)
    const product = await createTestProduct('bom-self')
    createdProductIds.push(product.id)

    const revision = (await bomService.createRevision(product.id, { revisionCode: 'A', notes: '' }, user.id)) as { id: string }
    createdRevisionIds.push(revision.id)

    await expect(
      bomService.addLine(revision.id, {
        lineType: 'component',
        materialId: null,
        componentProductId: product.id,
        quantity: 1,
        unit: 'UN',
        scrapPct: 0,
        order: 0,
        notes: '',
      })
    ).rejects.toThrow(/não pode ser componente de si mesmo/)
  })

  it('libera uma revisão e obsoleta automaticamente a revisão ativa anterior do mesmo produto', async () => {
    const user = await createTestUser('bom-release')
    createdUserIds.push(user.id)
    const product = await createTestProduct('bom-release')
    createdProductIds.push(product.id)

    const revisionA = (await bomService.createRevision(product.id, { revisionCode: 'A', notes: '' }, user.id)) as { id: string }
    createdRevisionIds.push(revisionA.id)
    const revisionB = (await bomService.createRevision(product.id, { revisionCode: 'B', notes: '' }, user.id)) as { id: string }
    createdRevisionIds.push(revisionB.id)

    await bomService.changeStatus(revisionA.id, 'released', user.id)
    let refreshedA = await db.bomRevision.findUnique({ where: { id: revisionA.id } })
    expect(refreshedA?.status).toBe('released')

    await bomService.changeStatus(revisionB.id, 'released', user.id)
    refreshedA = await db.bomRevision.findUnique({ where: { id: revisionA.id } })
    const refreshedB = await db.bomRevision.findUnique({ where: { id: revisionB.id } })

    expect(refreshedA?.status).toBe('obsolete')
    expect(refreshedB?.status).toBe('released')
    expect(refreshedB?.releasedById).toBe(user.id)
  })

  it('rejeita transição inválida (obsolete → released) e bloqueia edição de estrutura fora de rascunho', async () => {
    const user = await createTestUser('bom-immutable')
    createdUserIds.push(user.id)
    const product = await createTestProduct('bom-immutable')
    createdProductIds.push(product.id)
    const material = await createTestMaterial('bom-immutable')
    createdMaterialIds.push(material.id)

    const revision = (await bomService.createRevision(product.id, { revisionCode: 'A', notes: '' }, user.id)) as { id: string }
    createdRevisionIds.push(revision.id)

    await bomService.changeStatus(revision.id, 'released', user.id)

    await expect(
      bomService.addLine(revision.id, {
        lineType: 'material',
        materialId: material.id,
        componentProductId: null,
        quantity: 1,
        unit: 'KG',
        scrapPct: 0,
        order: 0,
        notes: '',
      })
    ).rejects.toThrow(/só pode ser alterada enquanto a revisão está em rascunho/)

    await bomService.changeStatus(revision.id, 'obsolete', user.id)
    await expect(bomService.changeStatus(revision.id, 'released', user.id)).rejects.toThrow(
      /Não é possível mudar de "obsolete" para "released"/
    )
  })

  it('permite excluir revisão em rascunho, mas bloqueia exclusão de revisão liberada', async () => {
    const user = await createTestUser('bom-delete')
    createdUserIds.push(user.id)
    const product = await createTestProduct('bom-delete')
    createdProductIds.push(product.id)

    const draftRevision = (await bomService.createRevision(product.id, { revisionCode: 'A', notes: '' }, user.id)) as { id: string }
    const result = await bomService.deleteRevision(draftRevision.id)
    expect(result.success).toBe(true)

    const releasedRevision = (await bomService.createRevision(product.id, { revisionCode: 'B', notes: '' }, user.id)) as { id: string }
    createdRevisionIds.push(releasedRevision.id)
    await bomService.changeStatus(releasedRevision.id, 'released', user.id)

    await expect(bomService.deleteRevision(releasedRevision.id)).rejects.toThrow(/revisões liberadas ou obsoletas são histórico/)
  })
})
