import bcrypt from 'bcryptjs'
import { Prisma } from '@prisma/client'
import { userRepository } from '@/app/repositories/user.repository'
import { BadRequestException, NotFoundException } from '@/app/exceptions'
import type { CreateUserDto } from '@/app/dto'

export interface ListUsersInput {
  search?: string
  page: number
  limit: number
}

class UserService {
  private async assertUsernameAvailable(username: string) {
    const existing = await userRepository.findByUsername(username)
    if (existing) throw new BadRequestException('Nome de usuário já existe')
  }

  async list(input: ListUsersInput) {
    const where: Record<string, unknown> = {}
    if (input.search) {
      where.OR = [{ name: { contains: input.search } }, { username: { contains: input.search } }]
    }
    const { data, total } = await userRepository.findManyPaginated(where, (input.page - 1) * input.limit, input.limit)
    return { data, total, page: input.page, limit: input.limit, totalPages: Math.ceil(total / input.limit) }
  }

  async getById(id: string) {
    const user = await userRepository.findByIdDetailed(id)
    if (!user) throw new NotFoundException('Usuário não encontrado')
    return user
  }

  async create(data: CreateUserDto) {
    await this.assertUsernameAvailable(data.username)
    const hashedPassword = await bcrypt.hash(data.password, 10)

    return userRepository.createWithSelect({
      username: data.username,
      name: data.name,
      email: data.email || '',
      password: hashedPassword,
      role: data.role,
      active: data.active,
    })
  }

  async update(id: string, body: Record<string, unknown>) {
    const target = await userRepository.findById(id)
    if (!target) throw new NotFoundException('Usuário não encontrado')

    const updateData: Record<string, unknown> = {}
    if (body.name !== undefined) updateData.name = body.name
    if (body.email !== undefined) updateData.email = body.email
    if (body.role !== undefined) updateData.role = body.role
    if (body.active !== undefined) updateData.active = body.active
    if (body.avatar !== undefined) updateData.avatar = body.avatar
    if (body.username !== undefined) {
      if (body.username !== (target as { username: string }).username) {
        await this.assertUsernameAvailable(body.username as string)
      }
      updateData.username = body.username
    }
    if (typeof body.password === 'string' && body.password.trim() !== '') {
      updateData.password = await bcrypt.hash(body.password, 10)
    }

    return userRepository.updateWithSelect(id, updateData)
  }

  async delete(id: string, currentUserId: string) {
    if (currentUserId === id) {
      throw new BadRequestException('Você não pode excluir seu próprio usuário')
    }

    const target = await userRepository.findById(id)
    if (!target) throw new NotFoundException('Usuário não encontrado')

    if ((target as { role: string }).role === 'admin') {
      const adminCount = await userRepository.countActiveAdmins()
      if (adminCount <= 1) {
        throw new BadRequestException('Não é possível excluir o último administrador')
      }
    }

    try {
      await userRepository.delete(id)
    } catch (error) {
      this.rethrowIfLinkedRecords(error)
    }
    return { success: true }
  }

  // Achado de integridade (verificação pós-Fase 12): usuário é referenciado por FK obrigatória em
  // dezenas de tabelas do sistema (Orçamentos, Pedidos, Requisições, OPs, Contas a Pagar/Receber,
  // etc.) — enumerar cada uma aqui seria frágil (cresce a cada módulo novo). Mesmo padrão já usado em
  // `client.service.ts`/`supplier.service.ts` para traduzir a violação de constraint do Prisma numa
  // mensagem de negócio, em vez de vazar o erro cru — só que aqui pelo código genérico de FK (P2003),
  // já que a lista de tabelas não é enumerável de forma estável.
  private rethrowIfLinkedRecords(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
      throw new BadRequestException('Não é possível excluir: este usuário possui registros vinculados no sistema. Desative o usuário em vez de excluí-lo.')
    }
    throw error
  }
}

export const userService = new UserService()
