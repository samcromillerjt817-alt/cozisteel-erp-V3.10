import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireModulePermission, unauthorized, forbidden, ok, created, badRequest, parsePagination } from '@/lib/api-utils'
import { numberingService } from '@/app/services/numbering.service'

export async function GET(req: NextRequest) {
  try {
    await requireAuth()
    const { searchParams } = new URL(req.url)
    const { page, limit } = parsePagination(searchParams)
    const status = searchParams.get('status') || ''
    const search = searchParams.get('search') || ''

    const where: Record<string, unknown> = {}
    if (status) where.status = status
    if (search) {
      where.OR = [
        { number: { contains: search } },
        { productName: { contains: search } },
        { description: { contains: search } },
      ]
    }

    const [data, total] = await Promise.all([
      db.productionOrder.findMany({
        where,
        include: {
          product: { select: { id: true, name: true, internalCode: true } },
          user: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.productionOrder.count({ where }),
    ])

    return ok({ data, total, page, limit, totalPages: Math.ceil(total / limit) })
  } catch (error) {
    if (error instanceof Error && error.name === 'UnauthorizedError') return unauthorized()
    console.error('GET /api/production-orders error:', error)
    return badRequest('Erro ao buscar ordens de produção')
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireModulePermission('producao', 'create')
    const body = await req.json()

    const number = await numberingService.getNextNumber('op')

    const order = await db.productionOrder.create({
      data: {
        number,
        status: body.status || 'planned',
        date: body.date || new Date().toLocaleDateString('pt-BR'),
        dueDate: body.dueDate || '',
        productId: body.productId || null,
        productName: body.productName || '',
        quantity: Number(body.quantity || 1),
        unit: body.unit || 'UN',
        priority: body.priority || 'normal',
        description: body.description || '',
        notes: body.notes || '',
        userId: user.id,
        salesOrderId: body.salesOrderId || null,
      },
      include: {
        product: { select: { id: true, name: true, internalCode: true } },
        user: { select: { id: true, name: true } },
        salesOrder: { select: { id: true, number: true } },
      },
    })

    return created(order)
  } catch (error) {
    if (error instanceof Error && error.name === 'UnauthorizedError') return unauthorized()
    if (error instanceof Error && error.name === 'ForbiddenError') return forbidden(error.message)
    console.error('POST /api/production-orders error:', error)
    return badRequest('Erro ao criar ordem de produção')
  }
}
