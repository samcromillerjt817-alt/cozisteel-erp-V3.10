import { db } from '@/lib/db'
import { BaseRepository } from './base.repository'

const LIST_INCLUDE = {
  createdBy: { select: { id: true, name: true } },
  releasedBy: { select: { id: true, name: true } },
  _count: { select: { lines: true } },
}
const DETAIL_INCLUDE = {
  createdBy: { select: { id: true, name: true } },
  releasedBy: { select: { id: true, name: true } },
  lines: {
    orderBy: { order: 'asc' as const },
    include: {
      material: { select: { id: true, name: true, unit: true } },
      componentProduct: { select: { id: true, name: true, internalCode: true, unit: true } },
    },
  },
}

class BomRevisionRepository extends BaseRepository<typeof db.bomRevision> {
  constructor() {
    super(db.bomRevision)
  }

  findManyByProduct(productId: string) {
    return this.delegate.findMany({ where: { productId }, include: LIST_INCLUDE, orderBy: { createdAt: 'desc' } })
  }

  findByIdDetailed(id: string) {
    return this.delegate.findUnique({ where: { id }, include: DETAIL_INCLUDE })
  }

  findByProductAndCode(productId: string, revisionCode: string) {
    return this.delegate.findUnique({ where: { productId_revisionCode: { productId, revisionCode } } })
  }

  findActiveByProduct(productId: string) {
    return this.delegate.findFirst({ where: { productId, status: 'released' } })
  }

  createDraft(data: Record<string, unknown>) {
     
    return this.delegate.create({ data: data as any, include: DETAIL_INCLUDE })
  }

  updateFields(id: string, data: Record<string, unknown>) {
    return this.delegate.update({ where: { id }, data, include: DETAIL_INCLUDE })
  }

  /**
   * Libera uma revisão como a única ativa do produto — obsoleta qualquer outra revisão
   * `released` do mesmo produto antes de ativar esta, numa única transação (ADR-001, princípio 3).
   */
  async release(id: string, productId: string, userId: string) {
    return db.$transaction(async (tx) => {
      await tx.bomRevision.updateMany({
        where: { productId, status: 'released', id: { not: id } },
        data: { status: 'obsolete' },
      })
      return tx.bomRevision.update({
        where: { id },
        data: { status: 'released', releasedById: userId, releasedAt: new Date() },
        include: DETAIL_INCLUDE,
      })
    })
  }
}

export const bomRevisionRepository = new BomRevisionRepository()
