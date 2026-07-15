import { NextRequest } from 'next/server'
import { requireModulePermission, ok, handleRouteError } from '@/lib/api-utils'
import { productService } from '@/app/services/product.service'

type RouteContext = { params: Promise<{ id: string; imageId: string }> }

export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requireModulePermission('produtos', 'update')
    const { id: productId, imageId } = await ctx.params
    const result = await productService.deleteImage(productId, imageId, user.id)
    return ok(result)
  } catch (error) {
    return handleRouteError(error, 'Erro ao remover imagem')
  }
}

/** PATCH { isPrimary: true } — define esta imagem como a foto principal do produto. */
export async function PATCH(req: NextRequest, ctx: RouteContext) {
  try {
    await requireModulePermission('produtos', 'update')
    const { id: productId, imageId } = await ctx.params
    const body = await req.json()
    const result = await productService.setPrimaryImage(productId, imageId, Boolean(body.isPrimary))
    return ok(result)
  } catch (error) {
    return handleRouteError(error, 'Erro ao atualizar imagem')
  }
}
