import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireModulePermission, unauthorized, forbidden, ok, created, badRequest, parsePagination } from '@/lib/api-utils'
import { validateDto, createRequisitionSchema } from '@/app/dto'
import { numberingService } from '@/app/services/numbering.service'
import { auditService } from '@/app/services/audit.service'

function getTodayDate(): string {
  const now = new Date()
  return `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`
}

export async function GET(req: NextRequest) {
  try {
    await requireAuth()
    const { searchParams } = new URL(req.url)
    const { page, limit } = parsePagination(searchParams)
    const status = searchParams.get('status') || ''
    const search = searchParams.get('search') || ''
    const productionOrderId = searchParams.get('productionOrderId') || ''

    const where: Record<string, unknown> = {}
    if (status) where.status = status
    if (productionOrderId) where.productionOrderId = productionOrderId
    if (search) {
      where.OR = [
        { number: { contains: search } },
        { notes: { contains: search } },
      ]
    }

    const [data, total] = await Promise.all([
      db.requisition.findMany({
        where,
        include: {
          items: { include: { material: { select: { id: true, name: true, unit: true } }, supplier: { select: { id: true, corporateName: true, tradeName: true } } } },
          productionOrder: { select: { id: true, number: true, productName: true } },
          user: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.requisition.count({ where }),
    ])

    return ok({ data, total, page, limit, totalPages: Math.ceil(total / limit) })
  } catch (error) {
    if (error instanceof Error && error.name === 'UnauthorizedError') return unauthorized()
    console.error('GET /api/requisitions error:', error)
    return badRequest('Erro ao buscar requisições')
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireModulePermission('requisicoes', 'create')
    const body = await req.json()
    const data = validateDto(createRequisitionSchema, body)

    if (data.productionOrderId) {
      const po = await db.productionOrder.findUnique({ where: { id: data.productionOrderId } })
      if (!po) return badRequest('Ordem de produção informada não existe')
    }

    for (const item of data.items) {
      const material = await db.material.findUnique({ where: { id: item.materialId } })
      if (!material) return badRequest(`Matéria-prima ${item.materialId} não encontrada`)
    }

    const number = await numberingService.getNextNumber('requisicao')

    const requisition = await db.requisition.create({
      data: {
        number,
        status: 'draft',
        originModule: data.originModule,
        productionOrderId: data.productionOrderId || null,
        date: getTodayDate(),
        neededBy: data.neededBy,
        notes: data.notes,
        userId: user.id,
        items: {
          create: data.items.map((item) => ({
            materialId: item.materialId,
            supplierId: item.supplierId || null,
            quantity: item.quantity,
            unit: item.unit,
            estimatedPrice: item.estimatedPrice,
            notes: item.notes,
          })),
        },
      },
      include: {
        items: { include: { material: true, supplier: true } },
        productionOrder: { select: { id: true, number: true } },
        user: { select: { id: true, name: true } },
      },
    })

    await auditService.log({
      userId: user.id,
      action: 'CREATE',
      module: 'requisicoes',
      entityId: requisition.id,
      entityName: requisition.number,
      details: `Requisição ${requisition.number} criada com ${data.items.length} item(ns) de matéria-prima`,
    })

    return created(requisition)
  } catch (error) {
    if (error instanceof Error && error.name === 'UnauthorizedError') return unauthorized()
    if (error instanceof Error && error.name === 'ForbiddenError') return forbidden(error.message)
    if (error instanceof Error && error.name === 'BadRequestException') return badRequest(error.message)
    console.error('POST /api/requisitions error:', error)
    return badRequest('Erro ao criar requisição')
  }
}
