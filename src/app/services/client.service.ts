import { Prisma } from '@prisma/client'
import { clientRepository } from '@/app/repositories/client.repository'
import { BadRequestException, NotFoundException } from '@/app/exceptions'
import type { CreateClientDto } from '@/app/dto'

export interface ListClientsInput {
  search?: string
  page: number
  limit: number
  // Default (undefined/false) esconde clientes inativados — ADR-022 (Fase UX-6, achado #24): a lista
  // não deve poluir o dia a dia com clientes que o usuário já marcou como inativo, mas o filtro
  // "Mostrar inativos" no frontend permite trazê-los de volta quando necessário.
  includeInactive?: boolean
}

class ClientService {
  private async assertUniqueCpfCnpj(cpfCnpj: string | null | undefined) {
    if (!cpfCnpj) return
    const existing = await clientRepository.findByCpfCnpj(cpfCnpj)
    if (existing) throw new BadRequestException('Já existe um cliente com este CNPJ/CPF')
  }

  // `assertUniqueCpfCnpj` sozinho tem uma janela de corrida (check-then-write sem transação) — a
  // constraint `@unique` do schema é quem garante a integridade de fato; isso só traduz a violação
  // dela na mesma mensagem amigável, em vez de vazar um erro genérico de banco.
  private rethrowIfDuplicateCpfCnpj(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new BadRequestException('Já existe um cliente com este CNPJ/CPF')
    }
    throw error
  }

  async list({ search, page, limit, includeInactive }: ListClientsInput) {
    const where: Record<string, unknown> = {}
    if (!includeInactive) where.active = true
    if (search) {
      where.OR = [
        { corporateName: { contains: search } },
        { tradeName: { contains: search } },
        { cpfCnpj: { contains: search } },
        { contactName: { contains: search } },
      ]
    }
    const { data, total } = await clientRepository.findManyPaginated(where, (page - 1) * limit, limit)
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) }
  }

  async getById(id: string) {
    const client = await clientRepository.findByIdWithQuoteCount(id)
    if (!client) throw new NotFoundException('Cliente não encontrado')
    return client
  }

  async create(data: CreateClientDto) {
    const cpfCnpj = data.cpfCnpj?.trim() || null
    await this.assertUniqueCpfCnpj(cpfCnpj)
    try {
      return await clientRepository.create({ ...data, cpfCnpj })
    } catch (error) {
      this.rethrowIfDuplicateCpfCnpj(error)
    }
  }

  async update(id: string, body: Record<string, unknown>) {
    const target = await clientRepository.findById(id)
    if (!target) throw new NotFoundException('Cliente não encontrado')

    const currentCpfCnpj = (target as { cpfCnpj: string | null }).cpfCnpj
    const newCpfCnpj = typeof body.cpfCnpj === 'string' ? body.cpfCnpj.trim() || null : currentCpfCnpj
    if (newCpfCnpj && newCpfCnpj !== currentCpfCnpj) {
      await this.assertUniqueCpfCnpj(newCpfCnpj)
    }

    const { _count, quotes, createdAt, id: _id, ...updateData } = body
    try {
      return await clientRepository.update(id, { ...updateData, cpfCnpj: newCpfCnpj })
    } catch (error) {
      this.rethrowIfDuplicateCpfCnpj(error)
    }
  }

  async delete(id: string) {
    const client = await clientRepository.findByIdWithQuoteCount(id)
    if (!client) throw new NotFoundException('Cliente não encontrado')
    if ((client as { _count: { quotes: number } })._count.quotes > 0) {
      throw new BadRequestException('Não é possível excluir um cliente com orçamentos vinculados')
    }
    await clientRepository.delete(id)
    return { success: true }
  }
}

export const clientService = new ClientService()
