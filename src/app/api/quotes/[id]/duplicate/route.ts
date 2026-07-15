import { NextRequest } from 'next/server'
import { requireAuth, created, handleRouteError } from '@/lib/api-utils'
import { quoteService } from '@/app/services/quote.service'

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(_req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requireAuth()
    const { id } = await ctx.params

    const duplicated = await quoteService.duplicate(id, user.id)
    return created(duplicated)
  } catch (error) {
    return handleRouteError(error, 'Erro ao duplicar orçamento')
  }
}
