import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireModulePermission, unauthorized, forbidden, ok, created, badRequest, parsePagination } from '@/lib/api-utils'
import { validateDto, createQuoteSchema, type CreateQuoteDto } from '@/app/dto'
import { numberingService } from '@/app/services/numbering.service'
import { auditService } from '@/app/services/audit.service'

function calculateQuoteTotals(items: CreateQuoteDto['items'], discountType: string, discountValue: number) {
  let subtotal = 0
  const calculatedItems = (items || []).map((item, idx) => {
    const itemTotal = item.quantity * item.unitPrice
    subtotal += itemTotal
    return {
      ...item,
      total: itemTotal,
      order: item.order ?? idx,
    }
  })

  let discountTotal = 0
  if (discountType === 'percent') {
    discountTotal = subtotal * (discountValue / 100)
  } else {
    discountTotal = discountValue
  }

  const total = subtotal - discountTotal

  return { subtotal, discountTotal, total, items: calculatedItems }
}

function getTodayDate(): string {
  const now = new Date()
  return `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth()
    const { searchParams } = new URL(req.url)
    const { page, limit } = parsePagination(searchParams)
    const status = searchParams.get('status') || ''
    const search = searchParams.get('search') || ''

    const where: Record<string, unknown> = {}
    if (status) where.status = status
    if (search) {
      where.OR = [
        { number: { contains: search } },
        { clientName: { contains: search } },
        { clientCnpj: { contains: search } },
      ]
    }

    const [data, total] = await Promise.all([
      db.quote.findMany({
        where,
        include: {
          client: { select: { id: true, corporateName: true, tradeName: true, cpfCnpj: true } },
          user: { select: { id: true, name: true, username: true } },
          _count: { select: { items: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.quote.count({ where }),
    ])

    return ok({ data, total, page, limit, totalPages: Math.ceil(total / limit) })
  } catch (error) {
    if (error instanceof Error && error.name === 'UnauthorizedError') return unauthorized()
    console.error('GET /api/quotes error:', error)
    return badRequest('Erro ao buscar orçamentos')
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireModulePermission('orcamentos', 'create')
    const body = await req.json()
    const data = validateDto(createQuoteSchema, body)

    // If client is provided, populate client snapshot
    if (data.clientId) {
      const client = await db.client.findUnique({ where: { id: data.clientId } })
      if (client) {
        data.clientName = client.corporateName || client.tradeName
        data.clientCnpj = client.cpfCnpj
        data.clientAddress = client.address
        data.clientNeighborhood = client.neighborhood
        data.clientCep = client.zipCode
        data.clientEmail = client.email
        data.clientPhone = client.phone
        data.clientContact = client.contactName
      }
    }

    const { subtotal, discountTotal, total, items: calculatedItems } = calculateQuoteTotals(
      data.items,
      data.discountType,
      data.discountValue
    )

    const quoteNumber = await numberingService.getNextNumber('orcamento')

    const quote = await db.quote.create({
      data: {
        number: quoteNumber,
        date: getTodayDate(),
        status: data.status || 'draft',
        validUntil: data.validUntil || '',
        clientId: data.clientId || null,
        clientName: data.clientName,
        clientContact: data.clientContact,
        clientAddress: data.clientAddress,
        clientNeighborhood: data.clientNeighborhood,
        clientCep: data.clientCep,
        clientCnpj: data.clientCnpj,
        clientEmail: data.clientEmail,
        clientPhone: data.clientPhone,
        subtotal,
        discountType: data.discountType,
        discountValue: data.discountValue,
        discountTotal,
        freightMode: data.freightMode,
        freightText: data.freightText,
        freightValue: data.freightValue,
        total,
        warranty: data.warranty,
        validity: data.validity,
        deliveryTime: data.deliveryTime,
        paymentTerms: data.paymentTerms,
        generalConditions: data.generalConditions,
        notes: data.notes,
        photoNote: data.photoNote,
        internalNotes: data.internalNotes,
        userId: user.id,
        items: {
          create: calculatedItems.map((item) => ({
            productId: item.productId || null,
            code: item.code,
            description: item.description,
            quantity: item.quantity,
            unit: item.unit,
            unitPrice: item.unitPrice,
            total: item.total,
            order: item.order,
            notes: item.notes,
          })),
        },
      },
      include: {
        items: { orderBy: { order: 'asc' } },
        client: { select: { id: true, corporateName: true } },
        user: { select: { id: true, name: true } },
      },
    })

    await auditService.log({
      userId: user.id,
      action: 'CREATE',
      module: 'orcamentos',
      entityId: quote.id,
      entityName: quote.number,
      details: `Orçamento ${quote.number} criado com ${calculatedItems.length} itens - Total: R$ ${total.toFixed(2)}`,
    })

    return created(quote)
  } catch (error) {
    if (error instanceof Error && error.name === 'UnauthorizedError') return unauthorized()
    if (error instanceof Error && error.name === 'ForbiddenError') return forbidden(error.message)
    console.error('POST /api/quotes error:', error)
    return badRequest('Erro ao criar orçamento')
  }
}