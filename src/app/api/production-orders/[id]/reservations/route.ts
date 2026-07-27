import { NextRequest } from 'next/server'
import { requireModulePermission, ok, handleRouteError } from '@/lib/api-utils'
import { materialReservationService } from '@/app/services/material-reservation.service'

type RouteContext = { params: Promise<{ id: string }> }

/** GET /api/production-orders/[id]/reservations — consulta somente-leitura da reserva de material
 * de uma OP (ADR-022, Fase UX-3, achado #06). `MaterialReservationService.listReservations()` já
 * existia desde o ADR-006 (Fase 5), mas nenhuma rota o expunha. */
export async function GET(_req: NextRequest, ctx: RouteContext) {
  try {
    await requireModulePermission('producao', 'read')
    const { id } = await ctx.params
    return ok(await materialReservationService.listReservations(id))
  } catch (error) {
    return handleRouteError(error, 'Erro ao buscar reserva de material')
  }
}
