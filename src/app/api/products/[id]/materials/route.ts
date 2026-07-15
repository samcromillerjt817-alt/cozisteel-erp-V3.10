import { NextRequest } from 'next/server'
import { requireAuth, ok, created, handleRouteError } from '@/lib/api-utils'
import { validateDto, productMaterialSchema } from '@/app/dto'
import { productService } from '@/app/services/product.service'

type RouteContext = { params: Promise<{ id: string }> }

/** Lists the raw materials (matérias-primas) consumed by a product */
export async function GET(_req: NextRequest, ctx: RouteContext) {
  try {
    await requireAuth()
    const { id: productId } = await ctx.params
    const items = await productService.listLinkedMaterials(productId)
    return ok(items)
  } catch (error) {
    return handleRouteError(error, 'Erro ao buscar matérias-primas do produto')
  }
}

/** Adds (or updates) a raw-material consumption entry for a product */
export async function POST(req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requireAuth()
    const { id: productId } = await ctx.params
    const body = await req.json()
    const data = validateDto(productMaterialSchema, body)

    const link = await productService.linkMaterial(productId, data, user.id)
    return created(link)
  } catch (error) {
    return handleRouteError(error, 'Erro ao vincular matéria-prima ao produto')
  }
}
