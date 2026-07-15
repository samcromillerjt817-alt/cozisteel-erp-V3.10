import { describe, it, expect, afterAll } from 'vitest'
import { db } from '@/lib/db'

/**
 * Fase 4, Subetapa 2 (ADR-005): Product.productType — campo aditivo, sem exposição via API ainda
 * (decisão explícita). Estes testes confirmam só o que a subetapa entrega: o default seguro pra
 * produtos existentes/novos, e que os 4 valores propostos podem ser gravados e lidos normalmente.
 */
describe('Product.productType (Subetapa 2)', () => {
  const createdProductIds: string[] = []

  afterAll(async () => {
    await db.product.deleteMany({ where: { id: { in: createdProductIds } } })
  })

  it('todo produto novo recebe productType="finished" por padrão, sem precisar informar nada', async () => {
    const product = await db.product.create({ data: { name: 'Produto Teste Default' } })
    createdProductIds.push(product.id)

    expect(product.productType).toBe('finished')
  })

  it.each(['finished', 'subassembly', 'raw_material', 'service'])('aceita productType="%s"', async (productType) => {
    const product = await db.product.create({ data: { name: `Produto Teste ${productType}`, productType } })
    createdProductIds.push(product.id)

    const persisted = await db.product.findUnique({ where: { id: product.id } })
    expect(persisted?.productType).toBe(productType)
  })
})
