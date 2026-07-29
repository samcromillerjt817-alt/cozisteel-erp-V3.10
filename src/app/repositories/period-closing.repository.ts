import { db } from '@/lib/db'
import { BaseRepository } from './base.repository'

const DETAIL_INCLUDE = {
  closedBy: { select: { id: true, name: true } },
  reopenedBy: { select: { id: true, name: true } },
}

class PeriodClosingRepository extends BaseRepository<typeof db.periodClosing> {
  constructor() {
    super(db.periodClosing)
  }

  findByPeriod(period: string) {
    return this.delegate.findUnique({ where: { period }, include: DETAIL_INCLUDE })
  }

  findManyAll() {
    return this.delegate.findMany({ include: DETAIL_INCLUDE, orderBy: { period: 'desc' } })
  }

  createClosed(data: Record<string, unknown>) {
    return this.delegate.create({ data: data as any, include: DETAIL_INCLUDE })
  }

  updateDetailed(id: string, data: Record<string, unknown>) {
    return this.delegate.update({ where: { id }, data, include: DETAIL_INCLUDE })
  }
}

export const periodClosingRepository = new PeriodClosingRepository()
