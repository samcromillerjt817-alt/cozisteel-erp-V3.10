import { materialRepository } from '@/app/repositories/material.repository'
import { auditService } from '@/app/services/audit.service'
import { BadRequestException, NotFoundException } from '@/app/exceptions'
import type { CreateMaterialDto } from '@/app/dto'

export interface ListMaterialsInput {
  search?: string
  active?: string | null
  categoryId?: string
  lowStock?: boolean
  paginate: boolean
  page: number
  limit: number
}

class MaterialService {
  private async assertUniqueName(name: string) {
    const existing = await materialRepository.findByName(name)
    if (existing) throw new BadRequestException('Já existe um material com este nome')
  }

  async list(input: ListMaterialsInput) {
    const where: Record<string, unknown> = {}
    if (input.search) {
      where.OR = [
        { name: { contains: input.search } },
        { internalCode: { contains: input.search } },
        { description: { contains: input.search } },
      ]
    }
    if (input.active !== null && input.active !== undefined && input.active !== '') {
      where.active = input.active === 'true'
    }
    if (input.categoryId) where.categoryId = input.categoryId

    if (!input.paginate) {
      // Compatível com o comportamento original: lista completa pra dropdowns/selects
      let materials = (await materialRepository.findAll(where)) as { stockQty: number; minStockQty: number }[]
      if (input.lowStock) materials = materials.filter((m) => m.stockQty <= m.minStockQty)
      return materials
    }

    const { data, total } = await materialRepository.findManyPaginated(where, (input.page - 1) * input.limit, input.limit)
    return { data, total, page: input.page, limit: input.limit, totalPages: Math.ceil(total / input.limit) }
  }

  async getById(id: string) {
    const material = await materialRepository.findByIdDetailed(id)
    if (!material) throw new NotFoundException('Matéria-prima não encontrada')
    return material
  }

  async create(data: CreateMaterialDto, userId: string) {
    await this.assertUniqueName(data.name)
    const material = (await materialRepository.create(data)) as { id: string; name: string }

    await auditService.log({
      userId,
      action: 'CREATE',
      module: 'materiais',
      entityId: material.id,
      entityName: material.name,
      details: `Matéria-prima "${material.name}" criada`,
    })

    return material
  }

  async update(id: string, body: Record<string, unknown>, userId: string) {
    const target = await materialRepository.findById(id)
    if (!target) throw new NotFoundException('Matéria-prima não encontrada')

    const newName = body.name as string | undefined
    if (newName && newName !== (target as { name: string }).name) {
      await this.assertUniqueName(newName)
    }

    const { _count, suppliers, productMaterials, products, category, createdAt, id: _id, ...updateData } = body
    const updated = await materialRepository.update(id, updateData)

    await auditService.log({
      userId,
      action: 'UPDATE',
      module: 'materiais',
      entityId: id,
      entityName: (updated as { name: string }).name,
      details: `Matéria-prima "${(updated as { name: string }).name}" atualizada`,
    })

    return updated
  }

  async delete(id: string, userId: string) {
    const material = await materialRepository.findByIdWithDependentCounts(id)
    if (!material) throw new NotFoundException('Matéria-prima não encontrada')
    const counts = (material as { _count: { products: number; productMaterials: number; materialBatches: number } })._count
    if (counts.products > 0 || counts.productMaterials > 0) {
      throw new BadRequestException('Não é possível excluir uma matéria-prima vinculada a produtos')
    }
    // Achado de integridade (verificação pós-Fase 12): `MaterialBatch.materialId` é uma FK obrigatória
    // sem cascade — sem esta checagem, excluir uma matéria-prima com lotes já recebidos (mesmo sem
    // nenhum vínculo a Produto) vazava um erro cru de FK do Prisma em vez de uma mensagem de negócio.
    if (counts.materialBatches > 0) {
      throw new BadRequestException('Não é possível excluir uma matéria-prima com lotes de recebimento já registrados')
    }

    await materialRepository.delete(id)

    await auditService.log({
      userId,
      action: 'DELETE',
      module: 'materiais',
      entityId: id,
      entityName: (material as { name: string }).name,
      details: `Matéria-prima "${(material as { name: string }).name}" excluída`,
    })

    return { success: true }
  }
}

export const materialService = new MaterialService()
