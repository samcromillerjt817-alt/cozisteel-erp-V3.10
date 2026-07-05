import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, unauthorized, ok, created, badRequest } from '@/lib/api-utils'

export async function GET(_req: NextRequest) {
  try {
    await requireAuth()

    const categories = await db.category.findMany({
      select: {
        id: true,
        name: true,
        slug: true,
        parentId: true,
        order: true,
        active: true,
        _count: { select: { products: true, children: true } },
      },
      orderBy: [{ order: 'asc' }, { name: 'asc' }],
    })

    return ok(categories)
  } catch (error) {
    if (error instanceof Error && error.name === 'UnauthorizedError') return unauthorized()
    console.error('GET /api/categories error:', error)
    return badRequest('Erro ao buscar categorias')
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAuth()
    const body = await req.json()

    if (!body.name || !body.slug) {
      return badRequest('Nome e slug são obrigatórios')
    }

    const existing = await db.category.findUnique({ where: { slug: body.slug } })
    if (existing) {
      return badRequest('Já existe uma categoria com este slug')
    }

    const category = await db.category.create({
      data: {
        name: body.name,
        slug: body.slug,
        parentId: body.parentId || null,
        order: body.order ?? 0,
        active: body.active ?? true,
      },
    })

    return created(category)
  } catch (error) {
    if (error instanceof Error && error.name === 'UnauthorizedError') return unauthorized()
    console.error('POST /api/categories error:', error)
    return badRequest('Erro ao criar categoria')
  }
}