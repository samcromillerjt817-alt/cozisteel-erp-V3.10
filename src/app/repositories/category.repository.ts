import { db } from '@/lib/db'
import { BaseRepository } from './base.repository'

class CategoryRepository extends BaseRepository<typeof db.category> {
  constructor() {
    super(db.category)
  }

  findBySlug(slug: string) {
    return this.delegate.findUnique({ where: { slug } })
  }

  findAllWithCounts() {
    return this.delegate.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        parentId: true,
        order: true,
        active: true,
        _count: { select: { products: true, children: true } },
      },
      orderBy: [{ order: 'asc' }, { name: 'asc' }],
    })
  }
}

export const categoryRepository = new CategoryRepository()
