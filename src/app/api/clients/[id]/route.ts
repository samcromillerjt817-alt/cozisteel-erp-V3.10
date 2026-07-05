import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, unauthorized, ok, badRequest, notFound } from '@/lib/api-utils'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: RouteContext) {
  try {
    await requireAuth()
    const { id } = await ctx.params

    const client = await db.client.findUnique({
      where: { id },
      include: { _count: { select: { quotes: true } } },
    })

    if (!client) return notFound('Cliente não encontrado')
    return ok(client)
  } catch (error) {
    if (error instanceof Error && error.name === 'UnauthorizedError') return unauthorized()
    console.error('GET /api/clients/[id] error:', error)
    return badRequest('Erro ao buscar cliente')
  }
}

export async function PUT(req: NextRequest, ctx: RouteContext) {
  try {
    await requireAuth()
    const { id } = await ctx.params
    const body = await req.json()

    const target = await db.client.findUnique({ where: { id } })
    if (!target) return notFound('Cliente não encontrado')

    // Check duplicate CNPJ if changed
    if (body.cpfCnpj && body.cpfCnpj !== target.cpfCnpj) {
      const existing = await db.client.findFirst({ where: { cpfCnpj: body.cpfCnpj } })
      if (existing) return badRequest('Já existe um cliente com este CNPJ/CPF')
    }

    const { _count, quotes, createdAt, id: _, ...updateData } = body
    const updated = await db.client.update({ where: { id }, data: updateData })
    return ok(updated)
  } catch (error) {
    if (error instanceof Error && error.name === 'UnauthorizedError') return unauthorized()
    console.error('PUT /api/clients/[id] error:', error)
    return badRequest('Erro ao atualizar cliente')
  }
}

export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  try {
    await requireAuth()
    const { id } = await ctx.params

    const client = await db.client.findUnique({
      where: { id },
      include: { _count: { select: { quotes: true } } },
    })

    if (!client) return notFound('Cliente não encontrado')
    if (client._count.quotes > 0) {
      return badRequest('Não é possível excluir um cliente com orçamentos vinculados')
    }

    await db.client.delete({ where: { id } })
    return ok({ success: true })
  } catch (error) {
    if (error instanceof Error && error.name === 'UnauthorizedError') return unauthorized()
    console.error('DELETE /api/clients/[id] error:', error)
    return badRequest('Erro ao excluir cliente')
  }
}