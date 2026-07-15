import { db } from '@/lib/db'
import { BaseRepository } from './base.repository'

class SystemInfoRepository extends BaseRepository<typeof db.systemInfo> {
  constructor() {
    super(db.systemInfo)
  }

  findMain() {
    return this.delegate.findUnique({ where: { id: 'main' } })
  }

  createMain() {
    return this.delegate.create({ data: { id: 'main' } })
  }
}

export const systemInfoRepository = new SystemInfoRepository()
