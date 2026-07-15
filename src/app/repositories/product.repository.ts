import { db } from '@/lib/db'
import { BaseRepository } from './base.repository'

const LIST_INCLUDE = {
  category: { select: { id: true, name: true, slug: true } },
  material: { select: { id: true, name: true, density: true } },
  images: { where: { isPrimary: true }, take: 1 },
}
const DETAIL_INCLUDE = {
  category: true,
  material: true,
  bomItems: { include: { component: { select: { id: true, name: true, internalCode: true, salePrice: true, unit: true } } } },
  materials: { include: { material: true } },
  images: { orderBy: [{ isPrimary: 'desc' as const }, { order: 'asc' as const }] },
  _count: { select: { quoteItems: true } },
}
const MUTATION_INCLUDE = { category: { select: { id: true, name: true } }, material: { select: { id: true, name: true } } }

class ProductRepository extends BaseRepository<typeof db.product> {
  constructor() {
    super(db.product)
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

  createWithMutationInclude(data: Record<string, unknown>) {
     
    return this.delegate.create({ data: data as any, include: MUTATION_INCLUDE })
  }

  updateWithMutationInclude(id: string, data: Record<string, unknown>) {
     
    return this.delegate.update({ where: { id }, data: data as any, include: MUTATION_INCLUDE })
  }
}

export const productRepository = new ProductRepository()
