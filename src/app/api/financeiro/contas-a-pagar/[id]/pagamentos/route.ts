import { NextRequest } from 'next/server'
import { requireModulePermission, ok, handleRouteError } from '@/lib/api-utils'
import { validateDto, registerPaymentSchema } from '@/app/dto'
import { financialAccountService } from '@/app/services/financial-account.service'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * POST /api/financeiro/contas-a-pagar/[id]/pagamentos
 *
 * Registra uma baixa (parcial ou total) num título a pagar. Suporta múltiplas
 * chamadas para o mesmo título — o status é recalculado a cada uma a partir
 * da soma de todos os pagamentos já registrados.
 */
export async function POST(req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requireModulePermission('financeiro', 'update')
    const { id } = await ctx.params
    const body = await req.json()
    const data = validateDto(registerPaymentSchema, body)

    const updated = await financialAccountService.registerPayment(id, data.amount, new Date(data.paidAt), data.notes, user.id)
    return ok(updated)
  } catch (error) {
    return handleRouteError(error, 'Erro ao registrar pagamento')
  }
}
