import { NextRequest } from 'next/server'
import { requireModulePermission, ok, handleRouteError } from '@/lib/api-utils'
import { validateDto, changeShipmentStatusSchema } from '@/app/dto'
import { shipmentService } from '@/app/services/shipment.service'

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requireModulePermission('orcamentos', 'update')
    const { id } = await ctx.params
    const body = await req.json()
    const { status } = validateDto(changeShipmentStatusSchema, body)

    const shipment = await shipmentService.changeStatus(id, status, user.id)
    return ok(shipment)
  } catch (error) {
    return handleRouteError(error, 'Erro ao mudar status da expedição')
  }
}
