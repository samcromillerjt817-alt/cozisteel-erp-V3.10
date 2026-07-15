import { NextRequest } from 'next/server'
import { requireAuth, requireModulePermission, ok, handleRouteError } from '@/lib/api-utils'
import { productService } from '@/app/services/product.service'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: RouteContext) {
  try {
    await requireAuth()
    const { id } = await ctx.params
    const product = await productService.getById(id)
    return ok(product)
  } catch (error) {
    return handleRouteError(error, 'Erro ao buscar produto')
  }
}

export async function PUT(req: NextRequest, ctx: RouteContext) {
  try {
    await requireModulePermission('produtos', 'update')
    const { id } = await ctx.params
    const body = await req.json()
    const updated = await productService.update(id, body)
    return ok(updated)
  } catch (error) {
    return handleRouteError(error, 'Erro ao atualizar produto')
  }
}

export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  try {
    await requireModulePermission('produtos', 'delete')
    const { id } = await ctx.params
    const result = await productService.deactivate(id)
    return ok(result)
  } catch (error) {
    return handleRouteError(error, 'Erro ao desativar produto')
  }
}
