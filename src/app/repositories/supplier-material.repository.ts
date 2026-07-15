import { db } from '@/lib/db'

/**
 * Repository da tabela de junção Fornecedor↔Matéria-prima. Não estende BaseRepository — a chave é
 * composta (supplierId+materialId), não um `id` único, então o contrato genérico não se aplica.
 */
class SupplierMaterialRepository {
  private readonly delegate = db.supplierMaterial

  findManyBySupplier(supplierId: string) {
    return this.delegate.findMany({ where: { supplierId }, include: { material: true }, orderBy: { updatedAt: 'desc' } })
  }

  findByCompositeKey(supplierId: string, materialId: string, include?: Record<string, unknown>) {
    return this.delegate.findUnique({ where: { supplierId_materialId: { supplierId, materialId } }, ...(include ? { include } : {}) })
  }

  /** Fornecedor preferencial de um material, quando existir (Fase 6, ADR-007 — enriquecimento de sugestão de compra). */
  findPreferredForMaterial(materialId: string) {
    return this.delegate.findFirst({ where: { materialId, isPreferred: true }, include: { supplier: true } })
  }

  unsetOtherPreferred(materialId: string, exceptSupplierId: string) {
    return this.delegate.updateMany({ where: { materialId, NOT: { supplierId: exceptSupplierId } }, data: { isPreferred: false } })
  }

  upsert(supplierId: string, materialId: string, data: { supplierCode: string; lastPrice: number; leadTimeDays: number; isPreferred: boolean; notes: string }) {
    return this.delegate.upsert({
      where: { supplierId_materialId: { supplierId, materialId } },
      update: data,
      create: { supplierId, materialId, ...data },
      include: { material: true },
    })
  }

  delete(supplierId: string, materialId: string) {
    return this.delegate.delete({ where: { supplierId_materialId: { supplierId, materialId } } })
  }
}

export const supplierMaterialRepository = new SupplierMaterialRepository()
