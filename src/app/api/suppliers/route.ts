import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireModulePermission, unauthorized, ok, created, badRequest, forbidden, parsePagination } from '@/lib/api-utils'
import { validateDto, createSupplierSchema } from '@/app/dto'
import { auditService } from '@/app/services/audit.service'

export async function GET(req: NextRequest) {
  try {
    await requireAuth()
    const { searchParams } = new URL(req.url)
    const { page, limit } = parsePagination(searchParams)
    const search = searchParams.get('search') || ''
    const activeParam = searchParams.get('active')

    const where: Record<string, unknown> = {}
    if (search) {
      where.OR = [
        { corporateName: { contains: search } },
        { tradeName: { contains: search } },
        { cpfCnpj: { contains: search } },
        { contactName: { contains: search } },
        { internalCode: { contains: search } },
      ]
    }
    if (activeParam !== null && activeParam !== '') {
      where.active = activeParam === 'true'
    }

    const [data, total] = await Promise.all([
      db.supplier.findMany({
        where,
        include: { _count: { select: { materials: true, requisitionItems: true } } },
        orderBy: { corporateName: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.supplier.count({ where }),
    ])

    return ok({ data, total, page, limit, totalPages: Math.ceil(total / limit) })
  } catch (error) {
    if (error instanceof Error && error.name === 'UnauthorizedError') return unauthorized()
    console.error('GET /api/suppliers error:', error)
    return badRequest('Erro ao buscar fornecedores')
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireModulePermission('fornecedores', 'create')
    const body = await req.json()
    const data = validateDto(createSupplierSchema, body)

    if (data.cpfCnpj) {
      const existing = await db.supplier.findFirst({ where: { cpfCnpj: data.cpfCnpj } })
      if (existing) return badRequest('Já existe um fornecedor com este CNPJ/CPF')
    }

    const supplier = await db.supplier.create({ data })

    await auditService.log({
      userId: user.id,
      action: 'CREATE',
      module: 'fornecedores',
      entityId: supplier.id,
      entityName: supplier.corporateName || supplier.tradeName,
      details: `Fornecedor "${supplier.corporateName || supplier.tradeName}" criado`,
    })

    return created(supplier)
  } catch (error) {
    if (error instanceof Error && error.name === 'UnauthorizedError') return unauthorized()
    if (error instanceof Error && error.name === 'ForbiddenError') return forbidden(error.message)
    if (error instanceof Error && error.name === 'BadRequestException') return badRequest(error.message)
    console.error('POST /api/suppliers error:', error)
    return badRequest('Erro ao criar fornecedor')
  }
}
