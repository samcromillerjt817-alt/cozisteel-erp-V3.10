import { describe, it, expect, afterAll } from 'vitest'
import { db } from '@/lib/db'
import { getReportData } from '@/app/services/report.service'
import { createTestUser, createTestProduct, createTestMaterial, createTestSupplier } from './helpers/fixtures'

/**
 * ADR-022 (Fase UX-7, achado #13) — `getReportData` passou a filtrar o período na query (antes
 * carregava a tabela inteira e filtrava em JS). O filtro usa uma reordenação via SQL bruto (`date` é
 * `String` dd/mm/aaaa no schema, não `DateTime`) — sem nenhum teste cobrindo `report.service.ts` antes
 * desta mudança, então este arquivo cobre especificamente a correção de intervalo de data (limites
 * inclusive/exclusive, cruzando ano) nos 3 tipos que usam data: sales, production, purchases.
 */
describe('Relatórios — getReportData filtra período na query (Fase UX-7)', () => {
  const createdUserIds: string[] = []
  const createdQuoteIds: string[] = []
  const createdOrderIds: string[] = []
  const createdRequisitionIds: string[] = []
  const createdMaterialIds: string[] = []
  const createdSupplierIds: string[] = []
  const createdProductIds: string[] = []

  afterAll(async () => {
    await db.requisitionItem.deleteMany({ where: { requisitionId: { in: createdRequisitionIds } } })
    await db.requisition.deleteMany({ where: { id: { in: createdRequisitionIds } } })
    await db.productionOrder.deleteMany({ where: { id: { in: createdOrderIds } } })
    await db.quote.deleteMany({ where: { id: { in: createdQuoteIds } } })
    await db.supplier.deleteMany({ where: { id: { in: createdSupplierIds } } })
    await db.material.deleteMany({ where: { id: { in: createdMaterialIds } } })
    await db.product.deleteMany({ where: { id: { in: createdProductIds } } })
    await db.user.deleteMany({ where: { id: { in: createdUserIds } } })
  })

  it('1. sales: inclui só orçamentos dentro do intervalo, limites inclusive, cruzando virada de ano', async () => {
    const user = await createTestUser('report-date-sales')
    createdUserIds.push(user.id)

    const before = await db.quote.create({ data: { number: 'RPT-SALES-BEFORE', date: '30/12/2025', userId: user.id, total: 10 } })
    const atFrom = await db.quote.create({ data: { number: 'RPT-SALES-AT-FROM', date: '31/12/2025', userId: user.id, total: 20 } })
    const inside = await db.quote.create({ data: { number: 'RPT-SALES-INSIDE', date: '05/01/2026', userId: user.id, total: 30 } })
    const atTo = await db.quote.create({ data: { number: 'RPT-SALES-AT-TO', date: '10/01/2026', userId: user.id, total: 40 } })
    const after = await db.quote.create({ data: { number: 'RPT-SALES-AFTER', date: '11/01/2026', userId: user.id, total: 50 } })
    createdQuoteIds.push(before.id, atFrom.id, inside.id, atTo.id, after.id)

    const result = await getReportData('sales', '31/12/2025', '10/01/2026', '')
    const numbers = (result!.rows as { Numero: string }[]).map((r) => r.Numero).sort()

    expect(numbers).toEqual(['RPT-SALES-AT-FROM', 'RPT-SALES-AT-TO', 'RPT-SALES-INSIDE'].sort())
    expect(result!.summary.totalValue).toBe(20 + 30 + 40)
  })

  it('2. sales: combina filtro de data com status', async () => {
    const user = await createTestUser('report-date-sales-status')
    createdUserIds.push(user.id)

    const draft = await db.quote.create({ data: { number: 'RPT-STATUS-DRAFT', date: '15/03/2026', status: 'draft', userId: user.id, total: 100 } })
    const approved = await db.quote.create({ data: { number: 'RPT-STATUS-APPROVED', date: '16/03/2026', status: 'approved', userId: user.id, total: 200 } })
    createdQuoteIds.push(draft.id, approved.id)

    const result = await getReportData('sales', '01/03/2026', '31/03/2026', 'approved')
    const numbers = (result!.rows as { Numero: string }[]).map((r) => r.Numero)

    expect(numbers).toEqual(['RPT-STATUS-APPROVED'])
  })

  it('3. production: filtra ProductionOrder por período', async () => {
    const user = await createTestUser('report-date-production')
    createdUserIds.push(user.id)
    const product = await createTestProduct('report-date-production')
    createdProductIds.push(product.id)

    const outside = await db.productionOrder.create({ data: { number: 'RPT-PROD-OUT', date: '01/02/2026', userId: user.id, productId: product.id } })
    const inside = await db.productionOrder.create({ data: { number: 'RPT-PROD-IN', date: '15/02/2026', userId: user.id, productId: product.id } })
    createdOrderIds.push(outside.id, inside.id)

    const result = await getReportData('production', '10/02/2026', '20/02/2026', '')
    const numbers = (result!.rows as { Numero: string }[]).map((r) => r.Numero)

    expect(numbers).toEqual(['RPT-PROD-IN'])
  })

  it('4. purchases: filtra Requisition por período, resolvendo itens da requisição correta', async () => {
    const user = await createTestUser('report-date-purchases')
    createdUserIds.push(user.id)
    const material = await createTestMaterial('report-date-purchases')
    createdMaterialIds.push(material.id)
    const supplier = await createTestSupplier('report-date-purchases')
    createdSupplierIds.push(supplier.id)

    const outside = await db.requisition.create({
      data: {
        number: 'RPT-REQ-OUT', date: '01/04/2026', userId: user.id,
        items: { create: [{ materialId: material.id, supplierId: supplier.id, quantity: 5, estimatedPrice: 2 }] },
      },
    })
    const inside = await db.requisition.create({
      data: {
        number: 'RPT-REQ-IN', date: '15/04/2026', userId: user.id,
        items: { create: [{ materialId: material.id, supplierId: supplier.id, quantity: 3, estimatedPrice: 4 }] },
      },
    })
    createdRequisitionIds.push(outside.id, inside.id)

    const result = await getReportData('purchases', '10/04/2026', '20/04/2026', '')
    const requisicoes = (result!.rows as { Requisicao: string }[]).map((r) => r.Requisicao)

    expect(requisicoes).toEqual(['RPT-REQ-IN'])
    expect(result!.summary.totalRequisitions).toBe(1)
  })
})
