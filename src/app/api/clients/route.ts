import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, unauthorized, ok, created, badRequest, parsePagination } from '@/lib/api-utils'
import { validateDto, createClientSchema } from '@/app/dto'

export async function GET(req: NextRequest) {
  try {
    await requireAuth()
    const { searchParams } = new URL(req.url)
    const { page, limit } = parsePagination(searchParams)
    const search = searchParams.get('search') || ''

    const where: Record<string, unknown> = {}
    if (search) {
      where.OR = [
        { corporateName: { contains: search } },
        { tradeName: { contains: search } },
        { cpfCnpj: { contains: search } },
        { contactName: { contains: search } },
      ]
    }

    const [data, total] = await Promise.all([
      db.client.findMany({
        where,
        include: { _count: { select: { quotes: true } } },
        orderBy: { corporateName: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.client.count({ where }),
    ])

    return ok({ data, total, page, limit, totalPages: Math.ceil(total / limit) })
  } catch (error) {
    if (error instanceof Error && error.name === 'UnauthorizedError') return unauthorized()
    console.error('GET /api/clients error:', error)
    return badRequest('Erro ao buscar clientes')
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth()
    const body = await req.json()
    const data = validateDto(createClientSchema, body)

    // Check for duplicate CNPJ
    if (data.cpfCnpj) {
      const existing = await db.client.findFirst({ where: { cpfCnpj: data.cpfCnpj } })
      if (existing) {
        return badRequest('Já existe um cliente com este CNPJ/CPF')
      }
    }

    const client = await db.client.create({ data })
    return created(client)
  } catch (error) {
    if (error instanceof Error && error.name === 'UnauthorizedError') return unauthorized()
    console.error('POST /api/clients error:', error)
    return badRequest('Erro ao criar cliente')
  }
}