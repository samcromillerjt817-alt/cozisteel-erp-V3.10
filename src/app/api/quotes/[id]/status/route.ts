import { NextRequest } from 'next/server'
import { requireModulePermission, ok, handleRouteError } from '@/lib/api-utils'
import { quoteService } from '@/app/services/quote.service'

type RouteContext = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requireModulePermission('orcamentos', 'update')
    const { id } = await ctx.params
    const { status } = await req.json()

    const result = await quoteService.changeStatus(id, status, user.id)
    return ok(result)
  } catch (error) {
    return handleRouteError(error, 'Erro ao alterar status')
  }
}
