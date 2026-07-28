import { NextRequest } from 'next/server'
import { requireModulePermission, ok, created, handleRouteError } from '@/lib/api-utils'
import { validateDto, createShipmentSchema } from '@/app/dto'
import { shipmentService } from '@/app/services/shipment.service'

type RouteContext = { params: Promise<{ id: string }> }

/** ADR-023 (item 6, Decisão #3, Expedição) — GET devolve o saldo expedível por item junto com o
 * histórico de expedições do pedido, mesmo padrão já usado em Faturamento (Decisão #2). */
export async function GET(_req: NextRequest, ctx: RouteContext) {
  try {
    await requireModulePermission('orcamentos', 'read')
    const { id } = await ctx.params
    const [balance, shipments] = await Promise.all([
      shipmentService.getShippableBalance(id),
      shipmentService.list(id),
    ])
    return ok({ balance, shipments })
  } catch (error) {
    return handleRouteError(error, 'Erro ao buscar expedições do pedido de venda')
  }
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requireModulePermission('orcamentos', 'update')
    const { id } = await ctx.params
    const body = await req.json()
    const data = validateDto(createShipmentSchema, body)

    const shipment = await shipmentService.create(id, data, user.id)
    return created(shipment)
  } catch (error) {
    return handleRouteError(error, 'Erro ao criar expedição')
  }
}
