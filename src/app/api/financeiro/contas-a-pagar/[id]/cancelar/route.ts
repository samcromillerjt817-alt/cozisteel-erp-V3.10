import { NextRequest } from 'next/server'
import { requireModulePermission, ok, handleRouteError } from '@/lib/api-utils'
import { financialAccountService } from '@/app/services/financial-account.service'

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(_req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requireModulePermission('financeiro', 'update')
    const { id } = await ctx.params

    const cancelled = await financialAccountService.cancelPayable(id, user.id)
    return ok(cancelled)
  } catch (error) {
    return handleRouteError(error, 'Erro ao cancelar título a pagar')
  }
}
