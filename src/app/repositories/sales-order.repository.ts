import { db } from '@/lib/db'
import { BaseRepository } from './base.repository'

const LIST_INCLUDE = {
  items: true,
  quote: { select: { id: true, number: true } },
  client: { select: { id: true, corporateName: true } },
  user: { select: { id: true, name: true } },
  productionOrders: { select: { id: true, number: true, status: true } },
}
const DETAIL_INCLUDE = {
  items: { include: { product: { select: { id: true, name: true, internalCode: true } } } },
  quote: { select: { id: true, number: true, status: true } },
  client: true,
  user: { select: { id: true, name: true } },
  productionOrders: { select: { id: true, number: true, status: true, productName: true, quantity: true } },
}
const MUTATION_INCLUDE = {
  items: true,
  quote: { select: { id: true, number: true } },
}

class SalesOrderRepository extends BaseRepository<typeof db.salesOrder> {
  constructor() {
    super(db.salesOrder)
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

  findByIdWithProductionOrders(id: string) {
    return this.delegate.findUnique({
      where: { id },
      include: { productionOrders: { select: { id: true, number: true, status: true } } },
    })
  }

  createWithItems(data: Record<string, unknown>) {
     
    return this.delegate.create({ data: data as any, include: MUTATION_INCLUDE })
  }

  updateStatus(id: string, status: string) {
    return this.delegate.update({ where: { id }, data: { status } })
  }
}

export const salesOrderRepository = new SalesOrderRepository()
