import { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { requireAuth, requireRole, unauthorized, forbidden, ok, created, badRequest, parsePagination } from '@/lib/api-utils'
import { validateDto, createUserSchema } from '@/app/dto'

export async function GET(req: NextRequest) {
  try {
    const user = await requireRole('admin', 'manager')
    const { searchParams } = new URL(req.url)
    const { page, limit } = parsePagination(searchParams)
    const search = searchParams.get('search') || ''

    const where: Record<string, unknown> = {}
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { username: { contains: search } },
      ]
    }

    const [data, total] = await Promise.all([
      db.user.findMany({
        where,
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
          _count: { select: { quotes: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.user.count({ where }),
    ])

    return ok({ data, total, page, limit, totalPages: Math.ceil(total / limit) })
  } catch (error) {
    if (error instanceof Error && error.name === 'UnauthorizedError') return unauthorized()
    if (error instanceof Error && error.name === 'ForbiddenError') return forbidden()
    console.error('GET /api/users error:', error)
    return badRequest('Erro ao buscar usuários')
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireRole('admin')
    const body = await req.json()
    const data = validateDto(createUserSchema, body)

    const existing = await db.user.findUnique({ where: { username: data.username } })
    if (existing) {
      return badRequest('Nome de usuário já existe')
    }

    const hashedPassword = await bcrypt.hash(data.password, 10)

    const newUser = await db.user.create({
      data: {
        username: data.username,
        name: data.name,
        email: data.email || '',
        password: hashedPassword,
        role: data.role,
        active: data.active,
      },
      select: {
        id: true,
        username: true,
        name: true,
        email: true,
        role: true,
        active: true,
        createdAt: true,
      },
    })

    return created(newUser)
  } catch (error) {
    if (error instanceof Error && error.name === 'UnauthorizedError') return unauthorized()
    if (error instanceof Error && error.name === 'ForbiddenError') return forbidden()
    console.error('POST /api/users error:', error)
    return badRequest('Erro ao criar usuário')
  }
}