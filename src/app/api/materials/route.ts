import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, unauthorized, ok, created, badRequest, parsePagination } from '@/lib/api-utils'
import { validateDto, createMaterialSchema } from '@/app/dto'
import { auditService } from '@/app/services/audit.service'

export async function GET(req: NextRequest) {
  try {
    await requireAuth()
    const { searchParams } = new URL(req.url)
    const search = searchParams.get('search') || ''
    const activeParam = searchParams.get('active')
    const categoryId = searchParams.get('categoryId') || ''
    const lowStock = searchParams.get('lowStock') === 'true'
    const paginate = searchParams.get('page') !== null

    const where: Record<string, unknown> = {}
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { internalCode: { contains: search } },
        { description: { contains: search } },
      ]
    }
    if (activeParam !== null && activeParam !== '') {
      where.active = activeParam === 'true'
    }
    if (categoryId) where.categoryId = categoryId

    if (!paginate) {
      // Backward-compatible: full list for dropdowns/selects (as the original endpoint returned)
      let materials = await db.material.findMany({
        where,
        include: { category: { select: { id: true, name: true } }, _count: { select: { products: true, suppliers: true } } },
        orderBy: { name: 'asc' },
      })
      if (lowStock) materials = materials.filter((m) => m.stockQty <= m.minStockQty)
      return ok(materials)
    }

    const { page, limit } = parsePagination(searchParams)
    const [data, total] = await Promise.all([
      db.material.findMany({
        where,
        include: { category: { select: { id: true, name: true } }, _count: { select: { products: true, suppliers: true } } },
        orderBy: { name: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.material.count({ where }),
    ])

    return ok({ data, total, page, limit, totalPages: Math.ceil(total / limit) })
  } catch (error) {
    if (error instanceof Error && error.name === 'UnauthorizedError') return unauthorized()
    console.error('GET /api/materials error:', error)
    return badRequest('Erro ao buscar materiais')
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth()
    const body = await req.json()
    const data = validateDto(createMaterialSchema, body)

    const existing = await db.material.findUnique({ where: { name: data.name } })
    if (existing) {
      return badRequest('Já existe um material com este nome')
    }

    const material = await db.material.create({ data })

    await auditService.log({
      userId: user.id,
      action: 'CREATE',
      module: 'materiais',
      entityId: material.id,
      entityName: material.name,
      details: `Matéria-prima "${material.name}" criada`,
    })

    return created(material)
  } catch (error) {
    if (error instanceof Error && error.name === 'UnauthorizedError') return unauthorized()
    if (error instanceof Error && error.name === 'BadRequestException') return badRequest(error.message)
    console.error('POST /api/materials error:', error)
    return badRequest('Erro ao criar material')
  }
}
