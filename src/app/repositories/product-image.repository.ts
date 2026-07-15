import { db } from '@/lib/db'

/** ProductImage tem `id` simples (não composto), mas a ordenação/escopo por produto é específica
 *  o suficiente (isPrimary/order) que valeu a pena um repository dedicado em vez de usar BaseRepository. */
class ProductImageRepository {
  private readonly delegate = db.productImage

  findManyByProduct(productId: string) {
    return this.delegate.findMany({ where: { productId }, orderBy: [{ isPrimary: 'desc' }, { order: 'asc' }] })
  }

  countByProduct(productId: string) {
    return this.delegate.count({ where: { productId } })
  }

  findById(id: string) {
    return this.delegate.findUnique({ where: { id } })
  }

  create(data: { productId: string; url: string; isPrimary: boolean; order: number }) {
    return this.delegate.create({ data })
  }

  delete(id: string) {
    return this.delegate.delete({ where: { id } })
  }

  findFirstOrdered(productId: string) {
    return this.delegate.findFirst({ where: { productId }, orderBy: { order: 'asc' } })
  }

  setPrimary(id: string) {
    return this.delegate.update({ where: { id }, data: { isPrimary: true } })
  }

  unsetAllPrimaryForProduct(productId: string) {
    return this.delegate.updateMany({ where: { productId }, data: { isPrimary: false } })
  }
}

export const productImageRepository = new ProductImageRepository()
