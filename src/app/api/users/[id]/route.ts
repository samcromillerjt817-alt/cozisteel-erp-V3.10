import { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { requireAuth, unauthorized, forbidden, ok, badRequest, notFound } from '@/lib/api-utils'
import { validateDto, createUserSchema } from '@/app/dto'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: RouteContext) {
  try {
    await requireAuth()
    const { id } = await ctx.params

    const user = await db.user.findUnique({
      where: { id },
      select: {
        id: true,
        username: true,
        name: true,
        email: true,
        role: true,
        active: true,
        avatar: true,
        lastLogin: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { quotes: true, auditLogs: true } },
      },
    })

    if (!user) return notFound('Usuário não encontrado')
    return ok(user)
  } catch (error) {
    if (error instanceof Error && error.name === 'UnauthorizedError') return unauthorized()
    console.error('GET /api/users/[id] error:', error)
    return badRequest('Erro ao buscar usuário')
  }
}

export async function PUT(req: NextRequest, ctx: RouteContext) {
  try {
    const currentUser = await requireAuth()
    const { id } = await ctx.params
    const body = await req.json()

    const target = await db.user.findUnique({ where: { id } })
    if (!target) return notFound('Usuário não encontrado')

    const updateData: Record<string, unknown> = {}
    if (body.name !== undefined) updateData.name = body.name
    if (body.email !== undefined) updateData.email = body.email
    if (body.role !== undefined) updateData.role = body.role
    if (body.active !== undefined) updateData.active = body.active
    if (body.avatar !== undefined) updateData.avatar = body.avatar
    if (body.username !== undefined) {
      if (body.username !== target.username) {
        const existing = await db.user.findUnique({ where: { username: body.username } })
        if (existing) return badRequest('Nome de usuário já existe')
      }
      updateData.username = body.username
    }
    if (body.password && body.password.trim() !== '') {
      updateData.password = await bcrypt.hash(body.password, 10)
    }

    const updated = await db.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        username: true,
        name: true,
        email: true,
        role: true,
        active: true,
        avatar: true,
        lastLogin: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    return ok(updated)
  } catch (error) {
    if (error instanceof Error && error.name === 'UnauthorizedError') return unauthorized()
    console.error('PUT /api/users/[id] error:', error)
    return badRequest('Erro ao atualizar usuário')
  }
}

export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  try {
    const currentUser = await requireAuth()
    const { id } = await ctx.params

    if (currentUser.id === id) {
      return badRequest('Você não pode excluir seu próprio usuário')
    }

    const target = await db.user.findUnique({ where: { id } })
    if (!target) return notFound('Usuário não encontrado')

    // Prevent deleting last admin
    if (target.role === 'admin') {
      const adminCount = await db.user.count({ where: { role: 'admin', active: true } })
      if (adminCount <= 1) {
        return badRequest('Não é possível excluir o último administrador')
      }
    }

    await db.user.delete({ where: { id } })
    return ok({ success: true })
  } catch (error) {
    if (error instanceof Error && error.name === 'UnauthorizedError') return unauthorized()
    console.error('DELETE /api/users/[id] error:', error)
    return badRequest('Erro ao excluir usuário')
  }
}