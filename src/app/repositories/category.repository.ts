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
        _count: { select: { products: true, materials: true, children: true } },
      },
      orderBy: [{ order: 'asc' }, { name: 'asc' }],
    })
  }

  /** Usado pelo guard de exclusão — mesma forma de `findAllWithCounts()`, só que pra 1 categoria,
   * pra não buscar a lista inteira só pra checar se pode excluir. */
  findByIdWithCounts(id: string) {
    return this.delegate.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        slug: true,
        _count: { select: { products: true, materials: true, children: true } },
      },
    })
  }
}

export const categoryRepository = new CategoryRepository()
