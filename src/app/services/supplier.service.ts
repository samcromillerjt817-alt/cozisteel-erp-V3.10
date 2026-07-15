import { Prisma } from '@prisma/client'
import { supplierRepository } from '@/app/repositories/supplier.repository'
import { supplierMaterialRepository } from '@/app/repositories/supplier-material.repository'
import { materialRepository } from '@/app/repositories/material.repository'
import { auditService } from '@/app/services/audit.service'
import { BadRequestException, NotFoundException } from '@/app/exceptions'
import type { CreateSupplierDto, SupplierMaterialDto } from '@/app/dto'

export interface ListSuppliersInput {
  search?: string
  active?: string | null
  page: number
  limit: number
}

function displayName(entity: { corporateName: string; tradeName: string }) {
  return entity.corporateName || entity.tradeName
}

class SupplierService {
  private async assertUniqueCpfCnpj(cpfCnpj: string | null | undefined) {
    if (!cpfCnpj) return
    const existing = await supplierRepository.findByCpfCnpj(cpfCnpj)
    if (existing) throw new BadRequestException('Já existe um fornecedor com este CNPJ/CPF')
  }

  // Mesmo raciocínio de `ClientService` — a constraint `@unique` do schema fecha a janela de corrida
  // que o check-then-write sozinho deixa aberta; isso só traduz a violação dela na mesma mensagem.
  private rethrowIfDuplicateCpfCnpj(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new BadRequestException('Já existe um fornecedor com este CNPJ/CPF')
    }
    throw error
  }

  async list(input: ListSuppliersInput) {
    const where: Record<string, unknown> = {}
    if (input.search) {
      where.OR = [
        { corporateName: { contains: input.search } },
        { tradeName: { contains: input.search } },
        { cpfCnpj: { contains: input.search } },
        { contactName: { contains: input.search } },
        { internalCode: { contains: input.search } },
      ]
    }
    if (input.active !== null && input.active !== undefined && input.active !== '') {
      where.active = input.active === 'true'
    }
    const { data, total } = await supplierRepository.findManyPaginated(where, (input.page - 1) * input.limit, input.limit)
    return { data, total, page: input.page, limit: input.limit, totalPages: Math.ceil(total / input.limit) }
  }

  async getById(id: string) {
    const supplier = await supplierRepository.findByIdDetailed(id)
    if (!supplier) throw new NotFoundException('Fornecedor não encontrado')
    return supplier
  }

  async create(data: CreateSupplierDto, userId: string) {
    const cpfCnpj = data.cpfCnpj?.trim() || null
    await this.assertUniqueCpfCnpj(cpfCnpj)
    let supplier: { id: string; corporateName: string; tradeName: string }
    try {
      supplier = (await supplierRepository.create({ ...data, cpfCnpj })) as { id: string; corporateName: string; tradeName: string }
    } catch (error) {
      this.rethrowIfDuplicateCpfCnpj(error)
    }

    await auditService.log({
      userId,
      action: 'CREATE',
      module: 'fornecedores',
      entityId: supplier.id,
      entityName: displayName(supplier),
      details: `Fornecedor "${displayName(supplier)}" criado`,
    })

    return supplier
  }

  async update(id: string, body: Record<string, unknown>, userId: string) {
    const target = await supplierRepository.findById(id)
    if (!target) throw new NotFoundException('Fornecedor não encontrado')

    const currentCpfCnpj = (target as { cpfCnpj: string | null }).cpfCnpj
    const newCpfCnpj = typeof body.cpfCnpj === 'string' ? body.cpfCnpj.trim() || null : currentCpfCnpj
    if (newCpfCnpj && newCpfCnpj !== currentCpfCnpj) {
      await this.assertUniqueCpfCnpj(newCpfCnpj)
    }

    const { _count, materials, requisitionItems, createdAt, id: _id, ...updateData } = body
    let updated: unknown
    try {
      updated = await supplierRepository.update(id, { ...updateData, cpfCnpj: newCpfCnpj })
    } catch (error) {
      this.rethrowIfDuplicateCpfCnpj(error)
    }

    await auditService.log({
      userId,
      action: 'UPDATE',
      module: 'fornecedores',
      entityId: id,
      entityName: displayName(updated as { corporateName: string; tradeName: string }),
      details: `Fornecedor "${displayName(updated as { corporateName: string; tradeName: string })}" atualizado`,
    })

    return updated
  }

  async delete(id: string, userId: string) {
    const supplier = await supplierRepository.findByIdWithRequisitionCount(id)
    if (!supplier) throw new NotFoundException('Fornecedor não encontrado')
    const counts = (supplier as { _count: { requisitionItems: number; itemQuotes: number; purchaseOrders: number } })._count
    if (counts.requisitionItems > 0) {
      throw new BadRequestException('Não é possível excluir um fornecedor com requisições vinculadas')
    }
    // Achado de integridade (verificação pós-Fase 12): `RequisitionItemQuote.supplierId` e
    // `PurchaseOrder.supplierId` são FKs obrigatórias sem cascade — sem esta checagem, um fornecedor
    // já cotado ou já com Pedido de Compra vazava um erro cru de FK do Prisma em vez de uma mensagem
    // de negócio (mesma classe de achado já corrigida em `quoteService.delete()`).
    if (counts.itemQuotes > 0) {
      throw new BadRequestException('Não é possível excluir um fornecedor com cotações de requisição vinculadas')
    }
    if (counts.purchaseOrders > 0) {
      throw new BadRequestException('Não é possível excluir um fornecedor com pedidos de compra vinculados')
    }

    await supplierRepository.delete(id)

    await auditService.log({
      userId,
      action: 'DELETE',
      module: 'fornecedores',
      entityId: id,
      entityName: displayName(supplier as { corporateName: string; tradeName: string }),
      details: `Fornecedor "${displayName(supplier as { corporateName: string; tradeName: string })}" excluído`,
    })

    return { success: true }
  }

  // ── Vínculo Fornecedor ↔ Matéria-prima ──

  async listLinkedMaterials(supplierId: string) {
    return supplierMaterialRepository.findManyBySupplier(supplierId)
  }

  async linkMaterial(supplierId: string, data: SupplierMaterialDto, userId: string) {
    const supplier = await supplierRepository.findById(supplierId)
    if (!supplier) throw new NotFoundException('Fornecedor não encontrado')

    const material = await materialRepository.findById(data.materialId)
    if (!material) throw new NotFoundException('Matéria-prima não encontrada')

    if (data.isPreferred) {
      await supplierMaterialRepository.unsetOtherPreferred(data.materialId, supplierId)
    }

    const link = await supplierMaterialRepository.upsert(supplierId, data.materialId, {
      supplierCode: data.supplierCode,
      lastPrice: data.lastPrice,
      leadTimeDays: data.leadTimeDays,
      isPreferred: data.isPreferred,
      notes: data.notes,
    })

    await auditService.log({
      userId,
      action: 'UPDATE',
      module: 'fornecedores',
      entityId: supplierId,
      entityName: displayName(supplier as { corporateName: string; tradeName: string }),
      details: `Vínculo com matéria-prima "${(material as { name: string }).name}" atualizado (preço R$ ${data.lastPrice.toFixed(2)})`,
    })

    return link
  }

  async unlinkMaterial(supplierId: string, materialId: string, userId: string) {
    const link = await supplierMaterialRepository.findByCompositeKey(supplierId, materialId, { material: true, supplier: true })
    if (!link) throw new NotFoundException('Vínculo não encontrado')

    await supplierMaterialRepository.delete(supplierId, materialId)

    const linked = link as unknown as { material: { name: string }; supplier: { corporateName: string; tradeName: string } }
    await auditService.log({
      userId,
      action: 'DELETE',
      module: 'fornecedores',
      entityId: supplierId,
      entityName: displayName(linked.supplier),
      details: `Vínculo com matéria-prima "${linked.material.name}" removido`,
    })

    return { success: true }
  }
}

export const supplierService = new SupplierService()
