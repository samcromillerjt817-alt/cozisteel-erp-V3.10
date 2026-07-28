import { db } from '@/lib/db'
import { BaseRepository } from './base.repository'

const LIST_INCLUDE = {
  category: { select: { id: true, name: true, slug: true } },
  material: { select: { id: true, name: true, density: true } },
  images: { where: { isPrimary: true }, take: 1 },
}
const DETAIL_INCLUDE = {
  category: true,
  material: true,
  bomItems: { include: { component: { select: { id: true, name: true, internalCode: true, salePrice: true, unit: true } } } },
  materials: { include: { material: true } },
  images: { orderBy: [{ isPrimary: 'desc' as const }, { order: 'asc' as const }] },
  _count: { select: { quoteItems: true } },
}
const MUTATION_INCLUDE = { category: { select: { id: true, name: true } }, material: { select: { id: true, name: true } } }

// Catálogo Digital Público (ADR-026) — só campos "voltados pro cliente", nunca costPrice/estoque/BOM.
const CATALOG_PUBLIC_SELECT = {
  id: true,
  internalCode: true,
  name: true,
  catalogDescription: true,
  categoryId: true,
  category: { select: { id: true, name: true, slug: true } },
  material: { select: { id: true, name: true } },
  unit: true,
  width: true,
  height: true,
  length: true,
  thickness: true,
  weight: true,
  finish: true,
  family: true,
  line: true,
  catalogFeatured: true,
  catalogPriceMode: true,
  catalogAllowCustomization: true,
  salePrice: true,
  images: {
    orderBy: [{ isPrimary: 'desc' as const }, { order: 'asc' as const }],
    select: { id: true, url: true, isPrimary: true, order: true },
  },
}

class ProductRepository extends BaseRepository<typeof db.product> {
  constructor() {
    super(db.product)
  }

  async findManyPaginated(where: Record<string, unknown>, skip: number, take: number) {
    const [data, total] = await Promise.all([
      this.delegate.findMany({ where, include: LIST_INCLUDE, orderBy: { name: 'asc' }, skip, take }),
      this.delegate.count({ where }),
    ])
    return { data, total }
  }

  findByIdDetailed(id: string) {
    return this.delegate.findUnique({ where: { id }, include: DETAIL_INCLUDE })
  }

  async findManyPublicCatalog(
    where: Record<string, unknown>,
    orderBy: Record<string, unknown>[],
    skip: number,
    take: number
  ) {
    const catalogWhere = { ...where, showInCatalog: true, active: true }
    const [data, total] = await Promise.all([
      this.delegate.findMany({ where: catalogWhere, select: CATALOG_PUBLIC_SELECT, orderBy, skip, take }),
      this.delegate.count({ where: catalogWhere }),
    ])
    return { data, total }
  }

  findPublicDetailById(id: string) {
    return this.delegate.findFirst({ where: { id, showInCatalog: true, active: true }, select: CATALOG_PUBLIC_SELECT })
  }

  /** Só ids/nomes de Category com pelo menos 1 produto visível no catálogo — evita mostrar filtro vazio. */
  async findCatalogCategories() {
    return db.category.findMany({
      where: { active: true, products: { some: { showInCatalog: true, active: true } } },
      select: { id: true, name: true, slug: true },
      orderBy: { name: 'asc' },
    })
  }

  /** Verifica se um Product está marcado pro catálogo público — usado pela rota de imagem pública
   *  (Parte 2 do ADR-026) pra não servir imagem de produto não habilitado, mesmo sabendo o path exato. */
  async isPubliclyVisible(productId: string): Promise<boolean> {
    const product = await this.delegate.findFirst({ where: { id: productId, showInCatalog: true, active: true }, select: { id: true } })
    return product !== null
  }

  createWithMutationInclude(data: Record<string, unknown>) {
     
    return this.delegate.create({ data: data as any, include: MUTATION_INCLUDE })
  }

  updateWithMutationInclude(id: string, data: Record<string, unknown>) {
     
    return this.delegate.update({ where: { id }, data: data as any, include: MUTATION_INCLUDE })
  }
}

export const productRepository = new ProductRepository()
