import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, unauthorized, created, badRequest, notFound } from '@/lib/api-utils'
import { numberingService } from '@/app/services/numbering.service'
import { auditService } from '@/app/services/audit.service'

type RouteContext = { params: Promise<{ id: string }> }

function getTodayDate(): string {
  const now = new Date()
  return `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`
}

export async function POST(_req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requireAuth()
    const { id } = await ctx.params

    const original = await db.quote.findUnique({
      where: { id },
      include: { items: { orderBy: { order: 'asc' } } },
    })

    if (!original) return notFound('Orçamento não encontrado')

    const newNumber = await numberingService.getNextNumber('orcamento')

    const duplicated = await db.quote.create({
      data: {
        number: newNumber,
        version: 1,
        status: 'draft',
        date: getTodayDate(),
        clientId: original.clientId,
        clientName: original.clientName,
        clientContact: original.clientContact,
        clientAddress: original.clientAddress,
        clientNeighborhood: original.clientNeighborhood,
        clientCep: original.clientCep,
        clientCnpj: original.clientCnpj,
        clientEmail: original.clientEmail,
        clientPhone: original.clientPhone,
        subtotal: original.subtotal,
        discountType: original.discountType,
        discountValue: original.discountValue,
        discountTotal: original.discountTotal,
        freightMode: original.freightMode,
        freightText: original.freightText,
        freightValue: original.freightValue,
        total: original.total,
        warranty: original.warranty,
        validity: original.validity,
        deliveryTime: original.deliveryTime,
        paymentTerms: original.paymentTerms,
        generalConditions: original.generalConditions,
        notes: original.notes,
        photoNote: original.photoNote,
        internalNotes: original.internalNotes,
        userId: user.id,
        items: {
          create: original.items.map((item) => ({
            productId: item.productId,
            code: item.code,
            description: item.description,
            quantity: item.quantity,
            unit: item.unit,
            unitPrice: item.unitPrice,
            total: item.total,
            weight: item.weight,
            width: item.width,
            height: item.height,
            length: item.length,
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
      entityId: duplicated.id,
      entityName: duplicated.number,
      details: `Orçamento ${duplicated.number} duplicado de ${original.number}`,
    })

    return created(duplicated)
  } catch (error) {
    if (error instanceof Error && error.name === 'UnauthorizedError') return unauthorized()
    console.error('POST /api/quotes/[id]/duplicate error:', error)
    return badRequest('Erro ao duplicar orçamento')
  }
}