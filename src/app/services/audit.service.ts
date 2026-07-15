import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'

export interface CreateAuditLogInput {
  userId?: string
  action: string
  module: string
  entityId?: string
  entityName?: string
  details?: string
  ip?: string
  userAgent?: string
  /** Só os campos efetivamente alterados — nunca um snapshot completo do registro (Fase 5.9). */
  beforeValue?: Record<string, unknown>
  /** Mesmas chaves de beforeValue, com o valor novo. */
  afterValue?: Record<string, unknown>
}

class AuditService {
  async log(input: CreateAuditLogInput) {
    return db.auditLog.create({
      data: {
        userId: input.userId,
        action: input.action,
        module: input.module,
        entityId: input.entityId,
        entityName: input.entityName,
        details: input.details || '',
        ip: input.ip || '',
        userAgent: input.userAgent || '',
        beforeValue: input.beforeValue as Prisma.InputJsonValue ?? Prisma.JsonNull,
        afterValue: input.afterValue as Prisma.InputJsonValue ?? Prisma.JsonNull,
      },
    })
  }

  async list(params: {
    module?: string
    userId?: string
    action?: string
    from?: string
    to?: string
    page?: number
    limit?: number
  }) {
    const { module, userId, action, from, to, page = 1, limit = 20 } = params

    const where: Record<string, unknown> = {}
    if (module) where.module = module
    if (userId) where.userId = userId
    if (action) where.action = action
    if (from || to) {
      const createdAt: Record<string, unknown> = {}
      if (from) createdAt.gte = new Date(from)
      if (to) createdAt.lte = new Date(to)
      where.createdAt = createdAt
    }

    const [data, total] = await Promise.all([
      db.auditLog.findMany({
        where,
        include: { user: { select: { name: true, username: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.auditLog.count({ where }),
    ])

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) }
  }
}

export const auditService = new AuditService()