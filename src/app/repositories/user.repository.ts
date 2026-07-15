import { db } from '@/lib/db'
import { BaseRepository } from './base.repository'

const LIST_SELECT = {
  id: true, username: true, name: true, email: true, role: true, active: true,
  avatar: true, lastLogin: true, createdAt: true,
  _count: { select: { quotes: true } },
}
const DETAIL_SELECT = {
  id: true, username: true, name: true, email: true, role: true, active: true,
  avatar: true, lastLogin: true, createdAt: true, updatedAt: true,
  _count: { select: { quotes: true, auditLogs: true } },
}
const MUTATION_SELECT = {
  id: true, username: true, name: true, email: true, role: true, active: true,
  avatar: true, lastLogin: true, createdAt: true, updatedAt: true,
}

class UserRepository extends BaseRepository<typeof db.user> {
  constructor() {
    super(db.user)
  }

  findByUsername(username: string) {
    return this.delegate.findUnique({ where: { username } })
  }

  async findManyPaginated(where: Record<string, unknown>, skip: number, take: number) {
    const [data, total] = await Promise.all([
      this.delegate.findMany({ where, select: LIST_SELECT, orderBy: { createdAt: 'desc' }, skip, take }),
      this.delegate.count({ where }),
    ])
    return { data, total }
  }

  findByIdDetailed(id: string) {
    return this.delegate.findUnique({ where: { id }, select: DETAIL_SELECT })
  }

   
  createWithSelect(data: Record<string, unknown>) {
    return this.delegate.create({ data: data as any, select: MUTATION_SELECT })
  }

   
  updateWithSelect(id: string, data: Record<string, unknown>) {
    return this.delegate.update({ where: { id }, data: data as any, select: MUTATION_SELECT })
  }

  countActiveAdmins() {
    return this.delegate.count({ where: { role: 'admin', active: true } })
  }
}

export const userRepository = new UserRepository()
