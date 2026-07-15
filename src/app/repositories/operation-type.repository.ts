import { db } from '@/lib/db'
import { BaseRepository } from './base.repository'

class OperationTypeRepository extends BaseRepository<typeof db.operationType> {
  constructor() {
    super(db.operationType)
  }

  findByName(name: string) {
    return this.delegate.findUnique({ where: { name } })
  }

  findManyActive() {
    return this.delegate.findMany({ where: { active: true }, orderBy: { name: 'asc' } })
  }
}

export const operationTypeRepository = new OperationTypeRepository()
