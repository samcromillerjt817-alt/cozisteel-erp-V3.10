import { db } from '@/lib/db'
import { BaseRepository } from './base.repository'

const USER_INCLUDE = { user: { select: { id: true, name: true } } }

class ApprovalRecordRepository extends BaseRepository<typeof db.approvalRecord> {
  constructor() {
    super(db.approvalRecord)
  }

  findManyByDocument(documentType: string, documentId: string) {
    return this.delegate.findMany({ where: { documentType, documentId }, include: USER_INCLUDE, orderBy: { createdAt: 'asc' } })
  }

  findByRuleDocumentUser(approvalRuleId: string, documentId: string, userId: string) {
    return this.delegate.findFirst({ where: { approvalRuleId, documentId, userId } })
  }

  countByRuleAndDocument(approvalRuleId: string, documentId: string) {
    return this.delegate.count({ where: { approvalRuleId, documentId } })
  }
}

export const approvalRecordRepository = new ApprovalRecordRepository()
