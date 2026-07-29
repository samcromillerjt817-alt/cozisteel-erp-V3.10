import { NextRequest } from 'next/server'
import { requireModulePermission, ok, handleRouteError } from '@/lib/api-utils'
import { mrpSuggestionService } from '@/app/services/mrp-suggestion.service'

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(_req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requireModulePermission('producao', 'update')
    const { id } = await ctx.params
    const result = await mrpSuggestionService.approve(id, user.id)
    return ok(result)
  } catch (error) {
    return handleRouteError(error, 'Erro ao aprovar sugestão do MRP')
  }
}
