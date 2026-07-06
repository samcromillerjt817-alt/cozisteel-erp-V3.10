import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireModulePermission, unauthorized, forbidden, ok, badRequest, notFound } from '@/lib/api-utils'
import { auditService } from '@/app/services/audit.service'
import type { CreateQuoteDto } from '@/app/dto'

type RouteContext = { params: Promise<{ id: string }> }

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

export async function GET(_req: NextRequest, ctx: RouteContext) {
  try {
    await requireAuth()
    const { id } = await ctx.params

    const quote = await db.quote.findUnique({
      where: { id },
      include: {
        items: { orderBy: { order: 'asc' }, include: { product: { select: { id: true, name: true, internalCode: true } } } },
        client: true,
        user: { select: { id: true, name: true, username: true } },
      },
    })

    if (!quote) return notFound('Orçamento não encontrado')
    return ok(quote)
  } catch (error) {
    if (error instanceof Error && error.name === 'UnauthorizedError') return unauthorized()
    console.error('GET /api/quotes/[id] error:', error)
    return badRequest('Erro ao buscar orçamento')
  }
}

export async function PUT(req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requireModulePermission('orcamentos', 'update')
    const { id } = await ctx.params
    const body = await req.json()

    const quote = await db.quote.findUnique({ where: { id } })
    if (!quote) return notFound('Orçamento não encontrado')

    // Campos permitidos explicitamente — evita que qualquer chave inesperada
    // vinda do front-end quebre o update com "Unknown argument" do Prisma.
    const allowedFields = [
      'clientId', 'clientName', 'clientCnpj', 'clientContact', 'clientPhone', 'clientEmail',
      'clientAddress', 'clientNeighborhood', 'clientCep', 'status', 'validUntil',
      'discountType', 'discountValue', 'freightMode', 'freightValue', 'freightText',
      'warranty', 'validity', 'deliveryTime', 'paymentTerms', 'generalConditions',
      'notes', 'photoNote', 'internalNotes',
    ] as const

    // If client is provided, refresh snapshot
    if (body.clientId) {
      const client = await db.client.findUnique({ where: { id: body.clientId } })
      if (client) {
        body.clientName = client.corporateName || client.tradeName
        body.clientCnpj = client.cpfCnpj
        body.clientAddress = client.address
        body.clientNeighborhood = client.neighborhood
        body.clientCep = client.zipCode
        body.clientEmail = client.email
        body.clientPhone = client.phone
        body.clientContact = client.contactName
      }
    }

    const items = body.items || []
    const discountType = body.discountType ?? quote.discountType
    const discountValue = body.discountValue ?? quote.discountValue
    const { subtotal, discountTotal, total, items: calculatedItems } = calculateQuoteTotals(items, discountType, discountValue)

    const updateData: Record<string, unknown> = {}
    for (const key of allowedFields) {
      if (body[key] !== undefined) updateData[key] = body[key]
    }

    // Replace all items
    await db.quoteItem.deleteMany({ where: { quoteId: id } })

    const updated = await db.quote.update({
      where: { id },
      data: {
        ...updateData,
        subtotal,
        discountTotal,
        total,
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
      action: 'UPDATE',
      module: 'orcamentos',
      entityId: updated.id,
      entityName: updated.number,
      details: `Orçamento ${updated.number} atualizado`,
    })

    return ok(updated)
  } catch (error) {
    if (error instanceof Error && error.name === 'UnauthorizedError') return unauthorized()
    if (error instanceof Error && error.name === 'ForbiddenError') return forbidden(error.message)
    console.error('PUT /api/quotes/[id] error:', error)
    // Em desenvolvimento/depuração, devolve a mensagem real do erro em vez de um texto genérico
    const message = error instanceof Error ? error.message : 'Erro ao atualizar orçamento'
    return badRequest(message)
  }
}

export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requireModulePermission('orcamentos', 'delete')
    const { id } = await ctx.params

    const quote = await db.quote.findUnique({ where: { id } })
    if (!quote) return notFound('Orçamento não encontrado')

    await db.quote.delete({ where: { id } })

    await auditService.log({
      userId: user.id,
      action: 'DELETE',
      module: 'orcamentos',
      entityId: id,
      entityName: quote.number,
      details: `Orçamento ${quote.number} excluído`,
    })

    return ok({ success: true })
  } catch (error) {
    if (error instanceof Error && error.name === 'UnauthorizedError') return unauthorized()
    if (error instanceof Error && error.name === 'ForbiddenError') return forbidden(error.message)
    console.error('DELETE /api/quotes/[id] error:', error)
    return badRequest('Erro ao excluir orçamento')
  }
}