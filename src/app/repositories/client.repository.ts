import { db } from '@/lib/db'
import { BaseRepository } from './base.repository'

const QUOTE_COUNT_INCLUDE = { _count: { select: { quotes: true } } }

class ClientRepository extends BaseRepository<typeof db.client> {
  constructor() {
    super(db.client)
  }

  findByCpfCnpj(cpfCnpj: string) {
    return this.delegate.findFirst({ where: { cpfCnpj } })
  }

  findByIdWithQuoteCount(id: string) {
    return this.delegate.findUnique({ where: { id }, include: QUOTE_COUNT_INCLUDE })
  }

  async findManyPaginated(where: Record<string, unknown>, skip: number, take: number) {
    const [data, total] = await Promise.all([
      this.delegate.findMany({ where, include: QUOTE_COUNT_INCLUDE, orderBy: { corporateName: 'asc' }, skip, take }),
      this.delegate.count({ where }),
    ])
    return { data, total }
  }
}

export const clientRepository = new ClientRepository()
