import { NextRequest } from 'next/server'
import { requireAuth, ok, created, handleRouteError } from '@/lib/api-utils'
import { validateDto, supplierMaterialSchema } from '@/app/dto'
import { supplierService } from '@/app/services/supplier.service'

type RouteContext = { params: Promise<{ id: string }> }

/** Lists all materials (matérias-primas) linked to a supplier */
export async function GET(_req: NextRequest, ctx: RouteContext) {
  try {
    await requireAuth()
    const { id: supplierId } = await ctx.params
    const links = await supplierService.listLinkedMaterials(supplierId)
    return ok(links)
  } catch (error) {
    return handleRouteError(error, 'Erro ao buscar materiais do fornecedor')
  }
}

/** Links a raw material to a supplier (or updates the link if it already exists) */
export async function POST(req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requireAuth()
    const { id: supplierId } = await ctx.params
    const body = await req.json()
    const data = validateDto(supplierMaterialSchema, body)

    const link = await supplierService.linkMaterial(supplierId, data, user.id)
    return created(link)
  } catch (error) {
    return handleRouteError(error, 'Erro ao vincular matéria-prima ao fornecedor')
  }
}
