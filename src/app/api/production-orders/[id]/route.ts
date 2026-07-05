import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, unauthorized, ok, badRequest, notFound } from '@/lib/api-utils'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: RouteContext) {
  try {
    await requireAuth()
    const { id } = await ctx.params

    const order = await db.productionOrder.findUnique({
      where: { id },
      include: {
        product: { include: { materials: { include: { material: true } } } },
        user: { select: { id: true, name: true } },
        requisitions: { select: { id: true, number: true, status: true } },
      },
    })

    if (!order) return notFound('Ordem de produção não encontrada')
    return ok(order)
  } catch (error) {
    if (error instanceof Error && error.name === 'UnauthorizedError') return unauthorized()
    console.error('GET /api/production-orders/[id] error:', error)
    return badRequest('Erro ao buscar ordem de produção')
  }
}

export async function PUT(req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requireAuth()
    const { id } = await ctx.params
    const body = await req.json()

    const target = await db.productionOrder.findUnique({
      where: { id },
      include: { product: { include: { materials: { include: { material: true } } } } },
    })
    if (!target) return notFound('Ordem de produção não encontrada')

    const newStatus = body.status || target.status
    // Só dispara a baixa de estoque na TRANSIÇÃO para "completed" (evita duplicar se já estava concluída)
    const isCompletingNow = newStatus === 'completed' && target.status !== 'completed'

    const updated = await db.productionOrder.update({
      where: { id },
      data: {
        status: newStatus,
        date: body.date || target.date,
        dueDate: body.dueDate || target.dueDate,
        productId: body.productId ?? target.productId,
        productName: body.productName || target.productName,
        quantity: Number(body.quantity ?? target.quantity),
        unit: body.unit || target.unit,
        priority: body.priority || target.priority,
        description: body.description || target.description,
        notes: body.notes || target.notes,
      },
      include: {
        product: { select: { id: true, name: true, internalCode: true } },
        user: { select: { id: true, name: true } },
      },
    })

    let stockConsumed = false
    if (isCompletingNow && target.product) {
      // Baixa automática da matéria-prima consumida, conforme a receita (ProductMaterial) do produto
      for (const pm of target.product.materials) {
        const consumedQty = pm.quantity * target.quantity * (1 + pm.scrapPct / 100)
        const material = await db.material.update({
          where: { id: pm.materialId },
          data: { stockQty: { decrement: consumedQty } },
        })
        await db.stockMovement.create({
          data: {
            itemType: 'material', materialId: pm.materialId, type: 'OUT',
            quantity: consumedQty, balanceAfter: material.stockQty,
            reason: `Consumo na OP ${target.number}`, referenceType: 'production_order', referenceId: target.id,
            userId: user.id,
          },
        })
      }
      // Entrada automática do produto acabado no estoque
      if (target.productId) {
        const product = await db.product.update({
          where: { id: target.productId },
          data: { stockQty: { increment: target.quantity } },
        })
        await db.stockMovement.create({
          data: {
            itemType: 'product', productId: target.productId, type: 'IN',
            quantity: target.quantity, balanceAfter: product.stockQty,
            reason: `Produção concluída — OP ${target.number}`, referenceType: 'production_order', referenceId: target.id,
            userId: user.id,
          },
        })
      }
      stockConsumed = true
    }

    return ok({ ...updated, stockConsumed })
  } catch (error) {
    if (error instanceof Error && error.name === 'UnauthorizedError') return unauthorized()
    console.error('PUT /api/production-orders/[id] error:', error)
    return badRequest('Erro ao atualizar ordem de produção')
  }
}

export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  try {
    await requireAuth()
    const { id } = await ctx.params

    const order = await db.productionOrder.findUnique({ where: { id } })
    if (!order) return notFound('Ordem de produção não encontrada')

    await db.productionOrder.delete({ where: { id } })
    return ok({ success: true })
  } catch (error) {
    if (error instanceof Error && error.name === 'UnauthorizedError') return unauthorized()
    console.error('DELETE /api/production-orders/[id] error:', error)
    return badRequest('Erro ao excluir ordem de produção')
  }
}
