import { categoryRepository } from '@/app/repositories/category.repository'
import { BadRequestException, NotFoundException } from '@/app/exceptions'

export interface CreateCategoryInput {
  name: string
  slug: string
  parentId?: string | null
  order?: number
  active?: boolean
}

export type UpdateCategoryInput = Partial<CreateCategoryInput>

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

  async update(id: string, input: UpdateCategoryInput) {
    const target = await categoryRepository.findById(id)
    if (!target) throw new NotFoundException('Categoria não encontrada')

    if (input.name !== undefined && !input.name.trim()) {
      throw new BadRequestException('Nome é obrigatório')
    }
    if (input.slug !== undefined) {
      if (!input.slug.trim()) throw new BadRequestException('Slug é obrigatório')
      const bySlug = await categoryRepository.findBySlug(input.slug)
      if (bySlug && bySlug.id !== id) throw new BadRequestException('Já existe uma categoria com este slug')
    }

    const data: Record<string, unknown> = {}
    if (input.name !== undefined) data.name = input.name
    if (input.slug !== undefined) data.slug = input.slug
    if (input.parentId !== undefined) data.parentId = input.parentId || null
    if (input.order !== undefined) data.order = input.order
    if (input.active !== undefined) data.active = input.active

    return categoryRepository.update(id, data)
  }

  /** Bloqueia exclusão quando ainda há produto, matéria-prima ou subcategoria vinculados (as 3
   * relações reais de `Category` no schema) — sem essa checagem o Prisma lançaria um erro cru de
   * violação de FK (P2003) em vez de uma mensagem que explica o motivo pro usuário. Não existe hoje
   * nenhuma regra de reatribuição automática desses vínculos, então a exclusão fica bloqueada até o
   * próprio usuário desvincular manualmente. */
  async remove(id: string) {
    const category = await categoryRepository.findByIdWithCounts(id)
    if (!category) throw new NotFoundException('Categoria não encontrada')

    const { products, materials, children } = category._count
    if (products > 0 || materials > 0 || children > 0) {
      const parts: string[] = []
      if (products > 0) parts.push(`${products} produto(s)`)
      if (materials > 0) parts.push(`${materials} matéria(s)-prima(s)`)
      if (children > 0) parts.push(`${children} subcategoria(s)`)
      throw new BadRequestException(
        `Não é possível excluir "${category.name}": ainda há ${parts.join(', ')} vinculado(s) a ela. Reatribua ou remova esses vínculos antes de excluir.`
      )
    }

    await categoryRepository.delete(id)
    return { success: true }
  }
}

export const categoryService = new CategoryService()
