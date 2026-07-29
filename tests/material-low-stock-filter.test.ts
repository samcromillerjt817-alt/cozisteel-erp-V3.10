import { describe, it, expect, afterAll } from 'vitest'
import { db } from '@/lib/db'
import { materialService } from '@/app/services/material.service'

/**
 * Achado real (usuário relatou "Só estoque baixo" não funcionando na lista de Matérias-Primas) —
 * `stockQty <= minStockQty` é uma comparação coluna-com-coluna da mesma linha, que o `where`
 * declarativo do Prisma não expressa. O filtro só estava aplicado no ramo `!paginate` (usado por
 * dropdowns/selects) — a tela principal, sempre paginada (`page` presente na URL), ignorava a
 * marcação do checkbox silenciosamente.
 */
describe('MaterialService.list — filtro "Só estoque baixo" (lowStock) na lista paginada', () => {
  const createdIds: string[] = []
  const suffix = `low-stock-filter-${Date.now()}`

  afterAll(async () => {
    await db.material.deleteMany({ where: { id: { in: createdIds } } })
  })

  async function createMaterial(name: string, stockQty: number, minStockQty: number) {
    const m = await db.material.create({ data: { name: `${name} ${suffix}`, stockQty, minStockQty } })
    createdIds.push(m.id)
    return m
  }

  it('1. lista paginada com lowStock=true só devolve materiais com stockQty <= minStockQty', async () => {
    await createMaterial('Baixo A', 5, 10)
    await createMaterial('Baixo B', 10, 10) // igual ao mínimo também conta como baixo
    await createMaterial('Normal A', 50, 10)
    await createMaterial('Normal B', 100, 10)

    const result = await materialService.list({
      search: suffix,
      active: null,
      categoryId: '',
      lowStock: true,
      paginate: true,
      page: 1,
      limit: 20,
    }) as unknown as { data: Array<{ name: string; stockQty: number; minStockQty: number }>; total: number }

    expect(result.total).toBe(2)
    expect(result.data.every((m) => m.stockQty <= m.minStockQty)).toBe(true)
    expect(result.data.map((m) => m.name).sort()).toEqual([`Baixo A ${suffix}`, `Baixo B ${suffix}`].sort())
  })

  it('2. lista paginada SEM lowStock devolve todos os materiais (comportamento normal preservado)', async () => {
    const result = await materialService.list({
      search: suffix,
      active: null,
      categoryId: '',
      lowStock: false,
      paginate: true,
      page: 1,
      limit: 20,
    }) as unknown as { data: unknown[]; total: number }

    expect(result.total).toBe(4)
  })

  it('3. paginação funciona corretamente sobre o resultado JÁ filtrado (não sobre o total da tabela)', async () => {
    const page1 = await materialService.list({
      search: suffix, active: null, categoryId: '', lowStock: true, paginate: true, page: 1, limit: 1,
    }) as unknown as { data: Array<{ name: string }>; total: number; totalPages: number }

    expect(page1.total).toBe(2) // total é o total FILTRADO (2 materiais baixos), não os 4 da tabela
    expect(page1.totalPages).toBe(2)
    expect(page1.data.length).toBe(1)

    const page2 = await materialService.list({
      search: suffix, active: null, categoryId: '', lowStock: true, paginate: true, page: 2, limit: 1,
    }) as unknown as { data: Array<{ name: string }> }

    expect(page2.data.length).toBe(1)
    expect(page2.data[0].name).not.toBe(page1.data[0].name) // páginas diferentes, itens diferentes
  })
})
