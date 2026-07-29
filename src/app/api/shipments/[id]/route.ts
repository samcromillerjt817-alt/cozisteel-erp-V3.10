import { NextRequest } from 'next/server'
import { requireModulePermission, ok, handleRouteError } from '@/lib/api-utils'
import { validateDto, updateShipmentSchema } from '@/app/dto'
import { shipmentService } from '@/app/services/shipment.service'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: RouteContext) {
  try {
    await requireModulePermission('orcamentos', 'read')
    const { id } = await ctx.params
    const shipment = await shipmentService.getById(id)
    return ok(shipment)
  } catch (error) {
    return handleRouteError(error, 'Erro ao buscar expedição')
  }
}

export async function PUT(req: NextRequest, ctx: RouteContext) {
  try {
    await requireModulePermission('orcamentos', 'update')
    const { id } = await ctx.params
    const body = await req.json()
    const data = validateDto(updateShipmentSchema, body)

    const shipment = await shipmentService.update(id, data)
    return ok(shipment)
  } catch (error) {
    return handleRouteError(error, 'Erro ao atualizar expedição')
  }
}
