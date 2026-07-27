import { NextRequest } from 'next/server'
import { requireModulePermission, ok, handleRouteError } from '@/lib/api-utils'
import { invoiceService } from '@/app/services/invoice.service'

type RouteContext = { params: Promise<{ id: string }> }

/** ADR-023 (Decisão #1) — só permitido enquanto a Conta a Receber vinculada ainda não teve nenhum
 * recebimento; `invoiceService.cancel` reaproveita a guarda de `cancelReceivable` para isso, sem
 * duplicar a regra aqui. */
export async function POST(_req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requireModulePermission('financeiro', 'update')
    const { id } = await ctx.params

    const cancelled = await invoiceService.cancel(id, user.id)
    return ok(cancelled)
  } catch (error) {
    return handleRouteError(error, 'Erro ao cancelar fatura')
  }
}
