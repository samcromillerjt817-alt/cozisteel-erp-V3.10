/**
 * Repository genérico e fino: só nomeia as operações Prisma que hoje já existem soltas nas rotas.
 * Nenhuma regra de negócio aqui — isso é responsabilidade do Service. "Prisma, por enquanto" (ADR-001,
 * princípio 1): o objetivo é ter um único lugar por entidade que fala com o banco, pra uma troca futura
 * de implementação (cache, outro ORM) não vazar pra dentro dos Services.
 */

 
type AnyDelegate = {
  findUnique: (args: any) => Promise<any>
  findMany: (args?: any) => Promise<any>
  count: (args?: any) => Promise<number>
  create: (args: any) => Promise<any>
  update: (args: any) => Promise<any>
  delete: (args: any) => Promise<any>
}

export abstract class BaseRepository<TDelegate extends AnyDelegate> {
  constructor(protected readonly delegate: TDelegate) {}

  findById(id: string, include?: Record<string, unknown>): Promise<unknown> {
    return this.delegate.findUnique({ where: { id }, ...(include ? { include } : {}) })
  }

  findMany(args: Record<string, unknown> = {}): Promise<unknown[]> {
    return this.delegate.findMany(args)
  }

  count(where: Record<string, unknown> = {}): Promise<number> {
    return this.delegate.count({ where })
  }

  create(data: Record<string, unknown>, include?: Record<string, unknown>): Promise<unknown> {
    return this.delegate.create({ data, ...(include ? { include } : {}) })
  }

  update(id: string, data: Record<string, unknown>, include?: Record<string, unknown>): Promise<unknown> {
    return this.delegate.update({ where: { id }, data, ...(include ? { include } : {}) })
  }

  delete(id: string): Promise<unknown> {
    return this.delegate.delete({ where: { id } })
  }
}
