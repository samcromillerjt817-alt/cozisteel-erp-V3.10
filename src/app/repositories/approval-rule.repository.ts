import { db } from '@/lib/db'
import { BaseRepository } from './base.repository'

class ApprovalRuleRepository extends BaseRepository<typeof db.approvalRule> {
  constructor() {
    super(db.approvalRule)
  }

  findManyByType(documentType: string) {
    return this.delegate.findMany({ where: { documentType }, orderBy: { order: 'asc' } })
  }

  findManyAll() {
    return this.delegate.findMany({ orderBy: [{ documentType: 'asc' }, { order: 'asc' }] })
  }

  /** Regras ativas do tipo, cuja faixa de valor cobre `value`, na ordem de avaliação. */
  findApplicable(documentType: string, value: number) {
    return this.delegate.findMany({
      where: {
        documentType,
        active: true,
        AND: [
          { OR: [{ minValue: null }, { minValue: { lte: value } }] },
          { OR: [{ maxValue: null }, { maxValue: { gte: value } }] },
        ],
      },
      orderBy: { order: 'asc' },
    })
  }
}

export const approvalRuleRepository = new ApprovalRuleRepository()
