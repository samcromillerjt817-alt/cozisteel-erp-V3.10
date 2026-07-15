import { db } from '@/lib/db'
import { BaseRepository } from './base.repository'

const LIST_INCLUDE = {
  client: { select: { id: true, corporateName: true, tradeName: true, cpfCnpj: true } },
  user: { select: { id: true, name: true, username: true } },
  salesOrder: { select: { id: true, number: true } },
  _count: { select: { items: true } },
}
const DETAIL_INCLUDE = {
  items: { orderBy: { order: 'asc' as const }, include: { product: { select: { id: true, name: true, internalCode: true } } } },
  client: true,
  user: { select: { id: true, name: true, username: true } },
}
const MUTATION_INCLUDE = {
  items: { orderBy: { order: 'asc' as const } },
  client: { select: { id: true, corporateName: true } },
  user: { select: { id: true, name: true } },
}
const STATUS_INCLUDE = { client: { select: { id: true, corporateName: true } }, user: { select: { id: true, name: true } } }

class QuoteRepository extends BaseRepository<typeof db.quote> {
  constructor() {
    super(db.quote)
  }

  async findManyPaginated(where: Record<string, unknown>, skip: number, take: number) {
    const [data, total] = await Promise.all([
      this.delegate.findMany({ where, include: LIST_INCLUDE, orderBy: { createdAt: 'desc' }, skip, take }),
      this.delegate.count({ where }),
    ])
    return { data, total }
  }

  findByIdDetailed(id: string) {
    return this.delegate.findUnique({ where: { id }, include: DETAIL_INCLUDE })
  }

  findByIdWithItemsAndSalesOrder(id: string) {
    return this.delegate.findUnique({ where: { id }, include: { items: true, salesOrder: true } })
  }

  findByIdWithItemsOrdered(id: string) {
    return this.delegate.findUnique({ where: { id }, include: { items: { orderBy: { order: 'asc' } } } })
  }

  findItemsWithProduct(id: string) {
    return this.delegate.findUnique({ where: { id }, include: { items: { where: { productId: { not: null } } } } })
  }

   
  createWithItems(data: Record<string, unknown>) {
    return this.delegate.create({ data: data as any, include: MUTATION_INCLUDE })
  }

  deleteAllItems(quoteId: string) {
    return db.quoteItem.deleteMany({ where: { quoteId } })
  }

  updateWithItems(id: string, data: Record<string, unknown>, items: Record<string, unknown>[]) {
    return this.delegate.update({
      where: { id },
       
      data: { ...data, items: { create: items } } as any,
      include: MUTATION_INCLUDE,
    })
  }

  updateStatus(id: string, data: Record<string, unknown>) {
    return this.delegate.update({ where: { id }, data, include: STATUS_INCLUDE })
  }
}

export const quoteRepository = new QuoteRepository()
