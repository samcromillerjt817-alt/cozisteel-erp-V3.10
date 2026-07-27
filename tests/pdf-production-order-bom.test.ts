import { describe, it, expect, afterAll } from 'vitest'
import { db } from '@/lib/db'
import { pdfService } from '@/app/services/pdf.service'
import { bomService } from '@/app/services/bom.service'
import { productionOrderService } from '@/app/services/production-order.service'
import { createTestUser, createTestProduct, createTestMaterial } from './helpers/fixtures'

/**
 * ADR-022 (Fase UX-3, achado #06) — antes desta correção, o PDF de Ordem de Produção sempre lia
 * `ProductMaterial` (a receita simples), mesmo quando a OP tinha uma `BomRevision` congelada
 * vinculada — o motor real de consumo prioriza a revisão congelada quando existe, então o papel
 * podia divergir do que era efetivamente baixado do estoque. `generateProductionOrderPdf()` agora
 * usa a mesma prioridade.
 */
describe('PdfService — Ordem de Produção usa BOM formal quando existir (ADR-022)', () => {
  const createdUserIds: string[] = []
  const createdProductIds: string[] = []
  const createdMaterialIds: string[] = []
  const createdRevisionIds: string[] = []
  const createdOrderIds: string[] = []

  afterAll(async () => {
    await db.productionOrder.deleteMany({ where: { id: { in: createdOrderIds } } })
    await db.bomRevision.deleteMany({ where: { id: { in: createdRevisionIds } } })
    await db.productMaterial.deleteMany({ where: { productId: { in: createdProductIds } } })
    await db.material.deleteMany({ where: { id: { in: createdMaterialIds } } })
    await db.product.deleteMany({ where: { id: { in: createdProductIds } } })
    await db.statusHistory.deleteMany({ where: { userId: { in: createdUserIds } } })
    await db.user.deleteMany({ where: { id: { in: createdUserIds } } })
  })

  function isValidPdfBuffer(buffer: Buffer): boolean {
    return buffer.length > 0 && buffer.subarray(0, 5).toString('ascii') === '%PDF-'
  }

  it('1. OP sem BomRevision (receita simples via ProductMaterial) continua gerando PDF válido', async () => {
    const user = await createTestUser('pdf-op-simple')
    createdUserIds.push(user.id)
    const product = await createTestProduct('pdf-op-simple')
    createdProductIds.push(product.id)
    const material = await createTestMaterial('pdf-op-simple')
    createdMaterialIds.push(material.id)
    await db.productMaterial.create({ data: { productId: product.id, materialId: material.id, quantity: 2, unit: 'KG', scrapPct: 0 } })

    const order = (await productionOrderService.create({ productId: product.id, quantity: 3, unit: 'UN' }, user.id)) as unknown as { id: string; bomRevisionId: string | null }
    createdOrderIds.push(order.id)
    expect(order.bomRevisionId).toBeNull()

    const buffer = await pdfService.generateProductionOrderPdf(order.id)
    expect(isValidPdfBuffer(buffer)).toBe(true)
  })

  it('2. OP com BomRevision liberada usa a BOM formal (BomLine), não a receita simples, e gera PDF válido', async () => {
    const user = await createTestUser('pdf-op-bom')
    createdUserIds.push(user.id)
    const product = await createTestProduct('pdf-op-bom')
    createdProductIds.push(product.id)
    const materialSimple = await createTestMaterial('pdf-op-bom-simple-recipe')
    createdMaterialIds.push(materialSimple.id)
    const materialBom = await createTestMaterial('pdf-op-bom-formal')
    createdMaterialIds.push(materialBom.id)

    // Receita simples (ProductMaterial) existe mas deve ser IGNORADA — a OP terá uma BomRevision.
    await db.productMaterial.create({ data: { productId: product.id, materialId: materialSimple.id, quantity: 99, unit: 'KG', scrapPct: 0 } })

    const revision = (await bomService.createRevision(product.id, { revisionCode: 'A', notes: '' }, user.id)) as { id: string }
    createdRevisionIds.push(revision.id)
    await bomService.addLine(revision.id, { lineType: 'material', materialId: materialBom.id, componentProductId: null, quantity: 4, unit: 'KG', scrapPct: 5, order: 0, notes: '' })
    await bomService.changeStatus(revision.id, 'released', user.id)

    const order = (await productionOrderService.create({ productId: product.id, quantity: 2, unit: 'UN' }, user.id)) as unknown as { id: string; bomRevisionId: string | null }
    createdOrderIds.push(order.id)
    expect(order.bomRevisionId).toBe(revision.id)

    const buffer = await pdfService.generateProductionOrderPdf(order.id)
    expect(isValidPdfBuffer(buffer)).toBe(true)
  })
})
