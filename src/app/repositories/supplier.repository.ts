import { db } from '@/lib/db'
import { BaseRepository } from './base.repository'

const LIST_INCLUDE = { _count: { select: { materials: true, requisitionItems: true } } }
const DETAIL_INCLUDE = {
  materials: { include: { material: { select: { id: true, name: true, unit: true, internalCode: true } } } },
  _count: { select: { requisitionItems: true } },
}
const REQUISITION_COUNT_INCLUDE = { _count: { select: { requisitionItems: true, itemQuotes: true, purchaseOrders: true } } }

class SupplierRepository extends BaseRepository<typeof db.supplier> {
  constructor() {
    super(db.supplier)
  }

  findByCpfCnpj(cpfCnpj: string) {
    return this.delegate.findFirst({ where: { cpfCnpj } })
  }

  async findManyPaginated(where: Record<string, unknown>, skip: number, take: number) {
    const [data, total] = await Promise.all([
      this.delegate.findMany({ where, include: LIST_INCLUDE, orderBy: { corporateName: 'asc' }, skip, take }),
      this.delegate.count({ where }),
    ])
    return { data, total }
  }

  findByIdDetailed(id: string) {
    return this.delegate.findUnique({ where: { id }, include: DETAIL_INCLUDE })
  }

  findByIdWithRequisitionCount(id: string) {
    return this.delegate.findUnique({ where: { id }, include: REQUISITION_COUNT_INCLUDE })
  }
}

export const supplierRepository = new SupplierRepository()
