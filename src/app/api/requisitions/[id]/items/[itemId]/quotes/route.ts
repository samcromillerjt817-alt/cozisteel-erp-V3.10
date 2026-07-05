import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, unauthorized, ok, created, badRequest, notFound } from '@/lib/api-utils'
import { auditService } from '@/app/services/audit.service'

type RouteContext = { params: Promise<{ id: string; itemId: string }> }

/** Lists all supplier quotes (cotações) registered for a requisition item */
export async function GET(_req: NextRequest, ctx: RouteContext) {
  try {
    await requireAuth()
    const { itemId } = await ctx.params

    const quotes = await db.requisitionItemQuote.findMany({
      where: { requisitionItemId: itemId },
      include: { supplier: { select: { id: true, corporateName: true, tradeName: true } } },
      orderBy: { price: 'asc' },
    })

    return ok(quotes)
  } catch (error) {
    if (error instanceof Error && error.name === 'UnauthorizedError') return unauthorized()
    console.error('GET /api/requisitions/[id]/items/[itemId]/quotes error:', error)
    return badRequest('Erro ao buscar cotações')
  }
}

/** Registers a new supplier quote (cotação) for a requisition item */
export async function POST(req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requireAuth()
    const { id: requisitionId, itemId } = await ctx.params
    const body = await req.json()
    const { supplierId, price, leadTimeDays, notes } = body

    if (!supplierId) return badRequest('Fornecedor é obrigatório')
    if (typeof price !== 'number' || price <= 0) return badRequest('Preço deve ser maior que zero')

    const item = await db.requisitionItem.findUnique({ where: { id: itemId } })
    if (!item || item.requisitionId !== requisitionId) return notFound('Item de requisição não encontrado')

    const supplier = await db.supplier.findUnique({ where: { id: supplierId } })
    if (!supplier) return notFound('Fornecedor não encontrado')

    const quote = await db.requisitionItemQuote.create({
      data: {
        requisitionItemId: itemId,
        supplierId,
        price,
        leadTimeDays: leadTimeDays || 0,
        notes: notes || '',
      },
      include: { supplier: { select: { id: true, corporateName: true, tradeName: true } } },
    })

    await auditService.log({
      userId: user.id,
      action: 'CREATE',
      module: 'requisicoes',
      entityId: requisitionId,
      entityName: supplier.corporateName || supplier.tradeName,
      details: `Cotação registrada: "${supplier.corporateName || supplier.tradeName}" — R$ ${price.toFixed(2)}`,
    })

    return created(quote)
  } catch (error) {
    if (error instanceof Error && error.name === 'UnauthorizedError') return unauthorized()
    console.error('POST /api/requisitions/[id]/items/[itemId]/quotes error:', error)
    return badRequest('Erro ao registrar cotação')
  }
}
