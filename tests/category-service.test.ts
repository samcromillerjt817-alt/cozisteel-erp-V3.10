import { describe, it, expect, afterAll } from 'vitest'
import { db } from '@/lib/db'
import { categoryService } from '@/app/services/category.service'
import { BadRequestException, NotFoundException } from '@/app/exceptions'

/**
 * "Gerenciar categorias" (achado do usuário: card "Cadastros auxiliares" embaixo da tabela de
 * Produtos obrigava rolar a página inteira pra cadastrar 1 categoria) — cobre update()/remove(),
 * que não existiam antes desta mudança (só create()/list()), e o guard de exclusão: bloqueia quando
 * há produto, matéria-prima ou subcategoria vinculada, com mensagem explicando o motivo.
 */
describe('CategoryService — update/remove (janela "Gerenciar categorias")', () => {
  const categoryIds: string[] = []
  const productIds: string[] = []
  const materialIds: string[] = []

  afterAll(async () => {
    await db.product.deleteMany({ where: { id: { in: productIds } } })
    await db.material.deleteMany({ where: { id: { in: materialIds } } })
    await db.category.deleteMany({ where: { id: { in: categoryIds } } })
  })

  it('1. update() altera nome e slug', async () => {
    const cat = await db.category.create({ data: { name: `Cat Update ${Date.now()}`, slug: `cat-update-${Date.now()}` } })
    categoryIds.push(cat.id)

    const updated = (await categoryService.update(cat.id, { name: 'Nome Novo', slug: `novo-slug-${Date.now()}` })) as { name: string; slug: string }
    expect(updated.name).toBe('Nome Novo')

    const fetched = await db.category.findUnique({ where: { id: cat.id } })
    expect(fetched?.name).toBe('Nome Novo')
  })

  it('2. update() rejeita slug já usado por outra categoria', async () => {
    const suffix = Date.now()
    const catA = await db.category.create({ data: { name: `Cat A ${suffix}`, slug: `cat-a-${suffix}` } })
    const catB = await db.category.create({ data: { name: `Cat B ${suffix}`, slug: `cat-b-${suffix}` } })
    categoryIds.push(catA.id, catB.id)

    await expect(categoryService.update(catB.id, { slug: `cat-a-${suffix}` })).rejects.toThrow(BadRequestException)
  })

  it('3. update() permite manter o próprio slug (não conflita consigo mesma)', async () => {
    const suffix = Date.now()
    const cat = await db.category.create({ data: { name: `Cat Self ${suffix}`, slug: `cat-self-${suffix}` } })
    categoryIds.push(cat.id)

    const updated = (await categoryService.update(cat.id, { name: 'Renomeada', slug: `cat-self-${suffix}` })) as { name: string }
    expect(updated.name).toBe('Renomeada')
  })

  it('4. update() lança NotFoundException para id inexistente', async () => {
    await expect(categoryService.update('id-inexistente', { name: 'X' })).rejects.toThrow(NotFoundException)
  })

  it('5. remove() exclui categoria sem nenhum vínculo', async () => {
    const cat = await db.category.create({ data: { name: `Cat Remove ${Date.now()}`, slug: `cat-remove-${Date.now()}` } })
    const result = (await categoryService.remove(cat.id)) as { success: boolean }
    expect(result.success).toBe(true)

    const fetched = await db.category.findUnique({ where: { id: cat.id } })
    expect(fetched).toBeNull()
  })

  it('6. remove() bloqueia quando há produto vinculado, com mensagem explicando o motivo', async () => {
    const cat = await db.category.create({ data: { name: `Cat Com Produto ${Date.now()}`, slug: `cat-com-produto-${Date.now()}` } })
    categoryIds.push(cat.id)
    const product = await db.product.create({ data: { name: `Produto Vinculado ${Date.now()}`, categoryId: cat.id } })
    productIds.push(product.id)

    await expect(categoryService.remove(cat.id)).rejects.toThrow(BadRequestException)
    await expect(categoryService.remove(cat.id)).rejects.toThrow(/1 produto\(s\)/)

    const fetched = await db.category.findUnique({ where: { id: cat.id } })
    expect(fetched).not.toBeNull() // nunca chega a excluir
  })

  it('7. remove() bloqueia quando há matéria-prima vinculada', async () => {
    const cat = await db.category.create({ data: { name: `Cat Com Material ${Date.now()}`, slug: `cat-com-material-${Date.now()}` } })
    categoryIds.push(cat.id)
    const material = await db.material.create({ data: { name: `Material Vinculado ${Date.now()}`, categoryId: cat.id } })
    materialIds.push(material.id)

    await expect(categoryService.remove(cat.id)).rejects.toThrow(/matéria/)
  })

  it('8. remove() bloqueia quando há subcategoria vinculada', async () => {
    const suffix = Date.now()
    const parent = await db.category.create({ data: { name: `Cat Pai ${suffix}`, slug: `cat-pai-${suffix}` } })
    const child = await db.category.create({ data: { name: `Cat Filha ${suffix}`, slug: `cat-filha-${suffix}`, parentId: parent.id } })
    categoryIds.push(parent.id, child.id)

    await expect(categoryService.remove(parent.id)).rejects.toThrow(/subcategoria/)
  })

  it('9. remove() lança NotFoundException para id inexistente', async () => {
    await expect(categoryService.remove('id-inexistente')).rejects.toThrow(NotFoundException)
  })

  it('10. list() traz _count de products/materials/children', async () => {
    const cat = await db.category.create({ data: { name: `Cat Count ${Date.now()}`, slug: `cat-count-${Date.now()}` } })
    categoryIds.push(cat.id)
    const product = await db.product.create({ data: { name: `Produto Count ${Date.now()}`, categoryId: cat.id } })
    productIds.push(product.id)

    const list = (await categoryService.list()) as Array<{ id: string; _count: { products: number; materials: number; children: number } }>
    const found = list.find((c) => c.id === cat.id)
    expect(found?._count.products).toBe(1)
    expect(found?._count.materials).toBe(0)
    expect(found?._count.children).toBe(0)
  })
})
