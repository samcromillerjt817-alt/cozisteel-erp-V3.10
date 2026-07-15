import { NextRequest } from 'next/server'
import { requireAuth, ok, handleRouteError } from '@/lib/api-utils'
import { productService } from '@/app/services/product.service'

type RouteContext = { params: Promise<{ id: string; materialId: string }> }

export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requireAuth()
    const { id: productId, materialId } = await ctx.params
    const result = await productService.unlinkMaterial(productId, materialId, user.id)
    return ok(result)
  } catch (error) {
    return handleRouteError(error, 'Erro ao remover vínculo')
  }
}
