import { db } from '@/lib/db'
import { BaseRepository } from './base.repository'

const MUTATION_INCLUDE = {
  operationType: { select: { id: true, name: true } },
}

class ProductOperationRepository extends BaseRepository<typeof db.productOperation> {
  constructor() {
    super(db.productOperation)
  }

  findManyByRevision(bomRevisionId: string) {
    return this.delegate.findMany({ where: { bomRevisionId }, include: MUTATION_INCLUDE, orderBy: { sequenceOrder: 'asc' } })
  }

  /** Maior sequenceOrder já usado nesta revisão, ou null se ainda não há operação nenhuma. */
  async findMaxSequenceOrder(bomRevisionId: string): Promise<number | null> {
    const last = await this.delegate.findFirst({ where: { bomRevisionId }, orderBy: { sequenceOrder: 'desc' } })
    return last ? (last as { sequenceOrder: number }).sequenceOrder : null
  }

  createOperation(data: Record<string, unknown>) {
     
    return this.delegate.create({ data: data as any, include: MUTATION_INCLUDE })
  }

  updateOperation(id: string, data: Record<string, unknown>) {
    return this.delegate.update({ where: { id }, data, include: MUTATION_INCLUDE })
  }
}

export const productOperationRepository = new ProductOperationRepository()
