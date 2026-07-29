import { db } from '@/lib/db'
import { BaseRepository } from './base.repository'

const MATERIAL_INCLUDE = {
  material: { select: { id: true, name: true, unit: true } },
}

class BomLineSubstituteRepository extends BaseRepository<typeof db.bomLineSubstitute> {
  constructor() {
    super(db.bomLineSubstitute)
  }

  findManyByLine(bomLineId: string) {
    return this.delegate.findMany({ where: { bomLineId }, include: MATERIAL_INCLUDE, orderBy: { createdAt: 'asc' } })
  }

  findByLineAndMaterial(bomLineId: string, materialId: string) {
    return this.delegate.findUnique({ where: { bomLineId_materialId: { bomLineId, materialId } } })
  }

  createSubstitute(data: Record<string, unknown>) {

    return this.delegate.create({ data: data as any, include: MATERIAL_INCLUDE })
  }
}

export const bomLineSubstituteRepository = new BomLineSubstituteRepository()
