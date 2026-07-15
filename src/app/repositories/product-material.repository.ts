import { db } from '@/lib/db'

/** Repository da tabela de junção Produto↔Matéria-prima (receita/BOM simples). Chave composta,
 *  não estende BaseRepository pelo mesmo motivo de SupplierMaterialRepository. */
class ProductMaterialRepository {
  private readonly delegate = db.productMaterial

  findManyByProduct(productId: string) {
    return this.delegate.findMany({ where: { productId }, include: { material: true }, orderBy: { createdAt: 'asc' } })
  }

  findByCompositeKey(productId: string, materialId: string, include?: Record<string, unknown>) {
    return this.delegate.findUnique({ where: { productId_materialId: { productId, materialId } }, ...(include ? { include } : {}) })
  }

  upsert(productId: string, materialId: string, data: { quantity: number; unit: string; scrapPct: number; notes: string }) {
    return this.delegate.upsert({
      where: { productId_materialId: { productId, materialId } },
      update: data,
      create: { productId, materialId, ...data },
      include: { material: true },
    })
  }

  delete(productId: string, materialId: string) {
    return this.delegate.delete({ where: { productId_materialId: { productId, materialId } } })
  }
}

export const productMaterialRepository = new ProductMaterialRepository()
