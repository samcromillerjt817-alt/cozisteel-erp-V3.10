import { categoryRepository } from '@/app/repositories/category.repository'
import { BadRequestException } from '@/app/exceptions'

export interface CreateCategoryInput {
  name: string
  slug: string
  parentId?: string | null
  order?: number
  active?: boolean
}

class CategoryService {
  async list() {
    return categoryRepository.findAllWithCounts()
  }

  async create(input: CreateCategoryInput) {
    if (!input.name || !input.slug) {
      throw new BadRequestException('Nome e slug são obrigatórios')
    }
    const existing = await categoryRepository.findBySlug(input.slug)
    if (existing) {
      throw new BadRequestException('Já existe uma categoria com este slug')
    }
    return categoryRepository.create({
      name: input.name,
      slug: input.slug,
      parentId: input.parentId || null,
      order: input.order ?? 0,
      active: input.active ?? true,
    })
  }
}

export const categoryService = new CategoryService()
