import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, requireModulePermission, unauthorized, forbidden, ok, badRequest, notFound } from '@/lib/api-utils'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: RouteContext) {
  try {
    await requireAuth()
    const { id } = await ctx.params

    const product = await db.product.findUnique({
      where: { id },
      include: {
        category: true,
        material: true,
        bomItems: {
          include: {
            component: {
              select: { id: true, name: true, internalCode: true, salePrice: true, unit: true },
            },
          },
        },
        materials: {
          include: { material: true },
        },
        images: { orderBy: [{ isPrimary: 'desc' }, { order: 'asc' }] },
        _count: { select: { quoteItems: true } },
      },
    })

    if (!product) return notFound('Produto não encontrado')
    return ok(product)
  } catch (error) {
    if (error instanceof Error && error.name === 'UnauthorizedError') return unauthorized()
    console.error('GET /api/products/[id] error:', error)
    return badRequest('Erro ao buscar produto')
  }
}

export async function PUT(req: NextRequest, ctx: RouteContext) {
  try {
    await requireModulePermission('produtos', 'update')
    const { id } = await ctx.params
    const body = await req.json()

    const target = await db.product.findUnique({ where: { id } })
    if (!target) return notFound('Produto não encontrado')

    const { category, material, bomItems, bomComponents, quoteItems, createdAt, updatedAt, id: _, ...updateData } = body as Record<string, unknown>

    // Recalculate volume
    const w = (updateData.width as number) ?? target.width
    const h = (updateData.height as number) ?? target.height
    const l = (updateData.length as number) ?? target.length
    if (updateData.width !== undefined || updateData.height !== undefined || updateData.length !== undefined) {
      updateData.volumeM3 = (w * h * l) / 1000000
    }

    const updated = await db.product.update({
      where: { id },
      data: updateData,
      include: {
        category: { select: { id: true, name: true } },
        material: { select: { id: true, name: true } },
      },
    })

    return ok(updated)
  } catch (error) {
    if (error instanceof Error && error.name === 'UnauthorizedError') return unauthorized()
    if (error instanceof Error && error.name === 'ForbiddenError') return forbidden(error.message)
    console.error('PUT /api/products/[id] error:', error)
    return badRequest('Erro ao atualizar produto')
  }
}

export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  try {
    await requireModulePermission('produtos', 'delete')
    const { id } = await ctx.params

    const product = await db.product.findUnique({ where: { id } })
    if (!product) return notFound('Produto não encontrado')

    // Soft delete
    await db.product.update({
      where: { id },
      data: { active: false },
    })

    return ok({ success: true })
  } catch (error) {
    if (error instanceof Error && error.name === 'UnauthorizedError') return unauthorized()
    if (error instanceof Error && error.name === 'ForbiddenError') return forbidden(error.message)
    console.error('DELETE /api/products/[id] error:', error)
    return badRequest('Erro ao desativar produto')
  }
}