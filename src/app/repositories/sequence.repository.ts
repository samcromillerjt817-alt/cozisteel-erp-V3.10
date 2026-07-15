import { db } from '@/lib/db'
import { BaseRepository } from './base.repository'

const WITH_USER_INCLUDE = { user: { select: { id: true, name: true } } }

class SequenceRepository extends BaseRepository<typeof db.numberSequence> {
  constructor() {
    super(db.numberSequence)
  }

  findAllWithUser() {
    return this.delegate.findMany({ include: WITH_USER_INCLUDE, orderBy: { documentType: 'asc' } })
  }

  updateWithUser(id: string, data: Record<string, unknown>) {
    return this.delegate.update({ where: { id }, data, include: WITH_USER_INCLUDE })
  }
}

export const sequenceRepository = new SequenceRepository()
