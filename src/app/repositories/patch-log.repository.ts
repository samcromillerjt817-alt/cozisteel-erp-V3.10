import { db } from '@/lib/db'
import { BaseRepository } from './base.repository'

class PatchLogRepository extends BaseRepository<typeof db.patchLog> {
  constructor() {
    super(db.patchLog)
  }

  findRecent(take: number) {
    return this.delegate.findMany({
      include: { user: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take,
    })
  }
}

export const patchLogRepository = new PatchLogRepository()
