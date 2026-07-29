import { productRepository } from '@/app/repositories/product.repository'
import { NotFoundException } from '@/app/exceptions'

export interface ListCatalogInput {
  search?: string
  categoryId?: string
  sort?: 'name_asc' | 'name_desc' | 'destaque'
  page: number
  limit: number
}

interface CatalogProductRecord {
  id: string
  internalCode: string
  name: string
  catalogDescription: string
  categoryId: string | null
  category: { id: string; name: string; slug: string } | null
  material: { id: string; name: string } | null
  unit: string
  width: number
  height: number
  length: number
  thickness: number
  weight: number
  finish: string
  family: string
  line: string
  catalogFeatured: boolean
  catalogPriceMode: string
  catalogAllowCustomization: boolean
  salePrice: number
  images: Array<{ id: string; url: string; isPrimary: boolean; order: number }>
}

/**
 * Serialização pública (ADR-026, Parte 8) — allowlist explícita de campos "voltados pro cliente",
 * nunca costPrice/estoque/BOM/margem. `salePrice` só é exposto quando `catalogPriceMode === 'exibir'`
 * (v1: todo produto começa em "sob_consulta", então price nunca aparece por padrão — decisão do
 * usuário, Parte 16).
 */
function toPublicProduct(product: CatalogProductRecord) {
  return {
    id: product.id,
    code: product.internalCode || undefined,
    name: product.name,
    description: product.catalogDescription,
    category: product.category,
    material: product.material?.name || '',
    unit: product.unit,
    dimensions: { width: product.width, height: product.height, length: product.length, thickness: product.thickness, weight: product.weight },
    finish: product.finish,
    family: product.family,
    line: product.line,
    featured: product.catalogFeatured,
    allowsCustomization: product.catalogAllowCustomization,
    priceMode: product.catalogPriceMode,
    price: product.catalogPriceMode === 'exibir' ? product.salePrice : null,
    images: product.images.map((img) => ({ id: img.id, url: `/api/public/uploads/${img.url}`, isPrimary: img.isPrimary })),
  }
}

const SORT_ORDER_BY: Record<NonNullable<ListCatalogInput['sort']>, Record<string, unknown>[]> = {
  name_asc: [{ name: 'asc' }],
  name_desc: [{ name: 'desc' }],
  destaque: [{ catalogFeatured: 'desc' }, { catalogOrder: 'asc' }, { name: 'asc' }],
}

class CatalogPublicService {
  async listProducts({ search, categoryId, sort, page, limit }: ListCatalogInput) {
    const where: Record<string, unknown> = {}
    if (categoryId) where.categoryId = categoryId
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { catalogDescription: { contains: search } },
        { internalCode: { contains: search } },
      ]
    }
    const orderBy = SORT_ORDER_BY[sort || 'destaque']

    const { data, total } = await productRepository.findManyPublicCatalog(where, orderBy, (page - 1) * limit, limit)
    return {
      data: (data as unknown as CatalogProductRecord[]).map(toPublicProduct),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    }
  }

  async getProductDetail(id: string) {
    const product = await productRepository.findPublicDetailById(id)
    if (!product) throw new NotFoundException('Produto não encontrado')
    return toPublicProduct(product as unknown as CatalogProductRecord)
  }

  async listCategories() {
    return productRepository.findCatalogCategories()
  }
}

export const catalogPublicService = new CatalogPublicService()
