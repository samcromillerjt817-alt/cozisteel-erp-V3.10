import { NextRequest } from 'next/server'
import { requireAuth, ok, handleRouteError } from '@/lib/api-utils'
import { financialAccountService } from '@/app/services/financial-account.service'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: RouteContext) {
  try {
    await requireAuth()
    const { id } = await ctx.params

    const account = await financialAccountService.getPayableById(id)
    return ok(account)
  } catch (error) {
    return handleRouteError(error, 'Erro ao buscar título a pagar')
  }
}
