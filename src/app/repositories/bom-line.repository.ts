import { db } from '@/lib/db'
import { BaseRepository } from './base.repository'

const MUTATION_INCLUDE = {
  material: { select: { id: true, name: true, unit: true } },
  componentProduct: { select: { id: true, name: true, internalCode: true, unit: true } },
}

class BomLineRepository extends BaseRepository<typeof db.bomLine> {
  constructor() {
    super(db.bomLine)
  }

  findManyByRevision(bomRevisionId: string) {
    return this.delegate.findMany({ where: { bomRevisionId }, include: MUTATION_INCLUDE, orderBy: { order: 'asc' } })
  }

  createLine(data: Record<string, unknown>) {
     
    return this.delegate.create({ data: data as any, include: MUTATION_INCLUDE })
  }

  updateLine(id: string, data: Record<string, unknown>) {
    return this.delegate.update({ where: { id }, data, include: MUTATION_INCLUDE })
  }
}

export const bomLineRepository = new BomLineRepository()
