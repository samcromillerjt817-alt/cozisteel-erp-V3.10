import { db } from '@/lib/db'
import { BaseRepository } from './base.repository'

class MrpSuggestionRepository extends BaseRepository<typeof db.mrpSuggestion> {
  constructor() {
    super(db.mrpSuggestion)
  }

  findByIdWithMaterial(id: string) {
    return this.delegate.findUnique({ where: { id }, include: { material: true } })
  }
}

export const mrpSuggestionRepository = new MrpSuggestionRepository()
