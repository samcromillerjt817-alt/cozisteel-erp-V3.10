import { db } from '@/lib/db'
import { BaseRepository } from './base.repository'

const LIST_INCLUDE = { category: { select: { id: true, name: true } }, _count: { select: { products: true, suppliers: true } } }
const DETAIL_INCLUDE = {
  category: { select: { id: true, name: true } },
  suppliers: { include: { supplier: true }, orderBy: { isPreferred: 'desc' as const } },
  productMaterials: { include: { product: { select: { id: true, name: true, internalCode: true } } } },
  _count: { select: { products: true } },
}
const DEPENDENT_COUNT_INCLUDE = { _count: { select: { products: true, productMaterials: true, materialBatches: true } } }

class MaterialRepository extends BaseRepository<typeof db.material> {
  constructor() {
    super(db.material)
  }

  findByName(name: string) {
    return this.delegate.findUnique({ where: { name } })
  }

  findAll(where: Record<string, unknown>) {
    return this.delegate.findMany({ where, include: LIST_INCLUDE, orderBy: { name: 'asc' } })
  }

  async findManyPaginated(where: Record<string, unknown>, skip: number, take: number) {
    const [data, total] = await Promise.all([
      this.delegate.findMany({ where, include: LIST_INCLUDE, orderBy: { name: 'asc' }, skip, take }),
      this.delegate.count({ where }),
    ])
    return { data, total }
  }

  findByIdDetailed(id: string) {
    return this.delegate.findUnique({ where: { id }, include: DETAIL_INCLUDE })
  }

  findByIdWithDependentCounts(id: string) {
    return this.delegate.findUnique({ where: { id }, include: DEPENDENT_COUNT_INCLUDE })
  }
}

export const materialRepository = new MaterialRepository()
