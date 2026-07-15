import { NextRequest } from 'next/server'
import { requireModulePermission, ok, created, badRequest, handleRouteError } from '@/lib/api-utils'
import { productService } from '@/app/services/product.service'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: RouteContext) {
  try {
    await requireModulePermission('produtos', 'read')
    const { id: productId } = await ctx.params
    const images = await productService.listImages(productId)
    return ok(images)
  } catch (error) {
    return handleRouteError(error, 'Erro ao buscar imagens')
  }
}

/** POST multipart/form-data com campo "file" — envia uma nova foto para o produto. */
export async function POST(req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requireModulePermission('produtos', 'update')
    const { id: productId } = await ctx.params

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return badRequest('Nenhum arquivo enviado (campo "file")')

    const image = await productService.uploadImage(productId, file, user.id)
    return created(image)
  } catch (error) {
    return handleRouteError(error, 'Erro ao enviar imagem')
  }
}
