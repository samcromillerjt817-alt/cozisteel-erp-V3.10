import { db } from '@/lib/db'

const MOVEMENT_INCLUDE = {
  material: { select: { id: true, name: true, unit: true } },
  product: { select: { id: true, name: true, unit: true } },
  user: { select: { id: true, name: true } },
}

class StockRepository {
  findMaterials(where?: Record<string, unknown>) {
    return db.material.findMany({ where, orderBy: { name: 'asc' } })
  }

  findProducts(where?: Record<string, unknown>) {
    return db.product.findMany({ where, orderBy: { name: 'asc' } })
  }

  createMovement(data: Record<string, unknown>) {
     
    return db.stockMovement.create({ data: data as any })
  }

  async findManyMovementsPaginated(where: Record<string, unknown>, skip: number, take: number) {
    const [data, total] = await Promise.all([
      db.stockMovement.findMany({ where, include: MOVEMENT_INCLUDE, orderBy: { createdAt: 'desc' }, skip, take }),
      db.stockMovement.count({ where }),
    ])
    return { data, total }
  }
}

export const stockRepository = new StockRepository()
