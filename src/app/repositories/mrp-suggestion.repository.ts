import { db } from '@/lib/db'
import { BaseRepository } from './base.repository'

class MrpSuggestionRepository extends BaseRepository<typeof db.mrpSuggestion> {
  constructor() {
    super(db.mrpSuggestion)
  }

  findByIdWithMaterial(id: string) {
    return this.delegate.findUnique({ where: { id }, include: { material: true } })
  }

  findManyByStatus(status: string) {
    return this.delegate.findMany({
      where: { status },
      include: { material: true, product: true, supplier: true },
      orderBy: [{ isLate: 'desc' }, { neededByDate: 'asc' }, { createdAt: 'desc' }],
    })
  }
}

export const mrpSuggestionRepository = new MrpSuggestionRepository()
