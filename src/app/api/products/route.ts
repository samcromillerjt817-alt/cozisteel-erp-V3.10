import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireModulePermission, unauthorized, forbidden, ok, created, badRequest, parsePagination } from '@/lib/api-utils'
import { validateDto, createProductSchema } from '@/app/dto'

export async function GET(req: NextRequest) {
  try {
    await requireAuth()
    const { searchParams } = new URL(req.url)
    const { page, limit } = parsePagination(searchParams)
    const search = searchParams.get('search') || ''
    const categoryId = searchParams.get('categoryId') || ''
    const activeParam = searchParams.get('active')

    const where: Record<string, unknown> = {}
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { internalCode: { contains: search } },
        { sku: { contains: search } },
        { description: { contains: search } },
      ]
    }
    if (categoryId) where.categoryId = categoryId
    if (activeParam !== null && activeParam !== '') {
      where.active = activeParam === 'true'
    }

    const [data, total] = await Promise.all([
      db.product.findMany({
        where,
        include: {
          category: { select: { id: true, name: true, slug: true } },
          material: { select: { id: true, name: true, density: true } },
          images: { where: { isPrimary: true }, take: 1 },
        },
        orderBy: { name: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.product.count({ where }),
    ])

    return ok({ data, total, page, limit, totalPages: Math.ceil(total / limit) })
  } catch (error) {
    if (error instanceof Error && error.name === 'UnauthorizedError') return unauthorized()
    console.error('GET /api/products error:', error)
    return badRequest('Erro ao buscar produtos')
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireModulePermission('produtos', 'create')
    const body = await req.json()
    const data = validateDto(createProductSchema, body)

    // Calculate volume in m³: width(cm) * height(cm) * length(cm) / 1,000,000
    const volumeM3 = (data.width * data.height * data.length) / 1000000

    const product = await db.product.create({
      data: {
        internalCode: data.internalCode,
        sku: data.sku,
        barcode: data.barcode,
        name: data.name,
        description: data.description,
        categoryId: data.categoryId || null,
        materialId: data.materialId || null,
        unit: data.unit,
        costPrice: data.costPrice,
        salePrice: data.salePrice,
        width: data.width,
        height: data.height,
        length: data.length,
        thickness: data.thickness,
        weight: data.weight,
        volumeM3,
        ncm: data.ncm,
        ipi: data.ipi,
        icms: data.icms,
        finish: data.finish,
        family: data.family,
        line: data.line,
        notes: data.notes,
      },
      include: {
        category: { select: { id: true, name: true } },
        material: { select: { id: true, name: true } },
      },
    })

    return created(product)
  } catch (error) {
    if (error instanceof Error && error.name === 'UnauthorizedError') return unauthorized()
    if (error instanceof Error && error.name === 'ForbiddenError') return forbidden(error.message)
    console.error('POST /api/products error:', error)
    return badRequest('Erro ao criar produto')
  }
}