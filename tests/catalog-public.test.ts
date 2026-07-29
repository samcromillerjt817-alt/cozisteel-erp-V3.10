import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { db } from '@/lib/db'
import { catalogPublicService } from '@/app/services/catalog-public.service'
import { NotFoundException } from '@/app/exceptions'

/**
 * ADR-026, Fase 2 — catálogo público só-leitura. Cobre exatamente o que esta fase introduziu:
 * filtragem por showInCatalog/active, busca, categoria, ordenação, e a serialização pública
 * (allowlist explícita, nunca costPrice/estoque/BOM, price só quando catalogPriceMode = "exibir").
 */
describe('Catálogo Digital Público — leitura (ADR-026, Fase 2)', () => {
  const productIds: string[] = []
  let categoryId: string
  let visibleId: string
  let hiddenFlagId: string
  let inactiveId: string
  let featuredId: string
  let priceVisibleId: string

  beforeAll(async () => {
    const category = await db.category.create({ data: { name: `Cat Catálogo ${Date.now()}`, slug: `cat-catalogo-${Date.now()}` } })
    categoryId = category.id

    const visible = await db.product.create({
      data: { name: `Visível ${Date.now()}`, showInCatalog: true, active: true, categoryId, catalogDescription: 'Descrição pública do produto visível' },
    })
    visibleId = visible.id

    const hiddenFlag = await db.product.create({ data: { name: `Oculto ${Date.now()}`, showInCatalog: false, active: true, categoryId } })
    hiddenFlagId = hiddenFlag.id

    const inactive = await db.product.create({ data: { name: `Inativo ${Date.now()}`, showInCatalog: true, active: false, categoryId } })
    inactiveId = inactive.id

    const featured = await db.product.create({ data: { name: `AAA Destaque ${Date.now()}`, showInCatalog: true, active: true, categoryId, catalogFeatured: true } })
    featuredId = featured.id

    const priceVisible = await db.product.create({
      data: { name: `Com preço ${Date.now()}`, showInCatalog: true, active: true, categoryId, catalogPriceMode: 'exibir', salePrice: 999 },
    })
    priceVisibleId = priceVisible.id

    productIds.push(visibleId, hiddenFlagId, inactiveId, featuredId, priceVisibleId)
  })

  afterAll(async () => {
    await db.product.deleteMany({ where: { id: { in: productIds } } })
    await db.category.delete({ where: { id: categoryId } })
  })

  it('1. listProducts só devolve produtos com showInCatalog=true E active=true', async () => {
    const result = await catalogPublicService.listProducts({ page: 1, limit: 50, categoryId })
    const ids = result.data.map((p) => p.id)
    expect(ids).toContain(visibleId)
    expect(ids).not.toContain(hiddenFlagId)
    expect(ids).not.toContain(inactiveId)
  })

  it('2. busca filtra por nome/descrição/código', async () => {
    const result = await catalogPublicService.listProducts({ page: 1, limit: 50, search: 'Descrição pública do produto visível' })
    expect(result.data.map((p) => p.id)).toContain(visibleId)
    expect(result.data.map((p) => p.id)).not.toContain(featuredId)
  })

  it('3. filtro por categoryId restringe aos produtos daquela categoria', async () => {
    const otherCategory = await db.category.create({ data: { name: `Outra Cat ${Date.now()}`, slug: `outra-cat-${Date.now()}` } })
    const other = await db.product.create({ data: { name: `Outro ${Date.now()}`, showInCatalog: true, active: true, categoryId: otherCategory.id } })

    const result = await catalogPublicService.listProducts({ page: 1, limit: 50, categoryId })
    expect(result.data.map((p) => p.id)).not.toContain(other.id)

    await db.product.delete({ where: { id: other.id } })
    await db.category.delete({ where: { id: otherCategory.id } })
  })

  it('4. ordenação "destaque" traz catalogFeatured=true primeiro', async () => {
    const result = await catalogPublicService.listProducts({ page: 1, limit: 50, categoryId, sort: 'destaque' })
    const featuredIndex = result.data.findIndex((p) => p.id === featuredId)
    const visibleIndex = result.data.findIndex((p) => p.id === visibleId)
    expect(featuredIndex).toBeGreaterThanOrEqual(0)
    expect(featuredIndex).toBeLessThan(visibleIndex)
  })

  it('5. getProductDetail lança NotFoundException para produto oculto, inativo ou inexistente', async () => {
    await expect(catalogPublicService.getProductDetail(hiddenFlagId)).rejects.toThrow(NotFoundException)
    await expect(catalogPublicService.getProductDetail(inactiveId)).rejects.toThrow(NotFoundException)
    await expect(catalogPublicService.getProductDetail('id-que-nao-existe')).rejects.toThrow(NotFoundException)
  })

  it('6. price só aparece quando catalogPriceMode = "exibir" — nunca em "sob_consulta"', async () => {
    const soConsulta = await catalogPublicService.getProductDetail(visibleId)
    expect(soConsulta.priceMode).toBe('sob_consulta')
    expect(soConsulta.price).toBeNull()

    const comPreco = await catalogPublicService.getProductDetail(priceVisibleId)
    expect(comPreco.priceMode).toBe('exibir')
    expect(comPreco.price).toBe(999)
  })

  it('7. serialização pública nunca inclui campo interno (costPrice/estoque/BOM)', async () => {
    const product = await catalogPublicService.getProductDetail(visibleId)
    const keys = Object.keys(product)
    expect(keys).not.toContain('costPrice')
    expect(keys).not.toContain('stockQty')
    expect(keys).not.toContain('reservedQty')
    expect(keys).not.toContain('bomItems')
    expect(keys).not.toContain('internalCode') // só exposto como `code`, nunca com o nome interno do campo
  })

  it('8. listCategories só devolve categorias com pelo menos 1 produto visível', async () => {
    const emptyCategory = await db.category.create({ data: { name: `Vazia ${Date.now()}`, slug: `vazia-${Date.now()}` } })

    const categories = await catalogPublicService.listCategories()
    expect(categories.map((c) => c.id)).toContain(categoryId)
    expect(categories.map((c) => c.id)).not.toContain(emptyCategory.id)

    await db.category.delete({ where: { id: emptyCategory.id } })
  })
})
