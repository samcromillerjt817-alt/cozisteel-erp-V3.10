import { NextRequest } from 'next/server'
import { requireModulePermission, ok, handleRouteError } from '@/lib/api-utils'
import { quoteService } from '@/app/services/quote.service'

type RouteContext = { params: Promise<{ id: string }> }

/**
 * Cria (ou vincula, se já existir) um Cliente formal a partir dos dados de um Orçamento sem
 * cliente — pra manter o registro de um lead (ex.: vindo do Catálogo Digital, ADR-026) sem precisar
 * re-digitar os dados em Clientes e depois vincular manualmente.
 */
export async function POST(_req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requireModulePermission('orcamentos', 'update')
    const { id } = await ctx.params
    const result = await quoteService.promoteToClient(id, user.id)
    return ok(result)
  } catch (error) {
    return handleRouteError(error, 'Erro ao criar cliente a partir do orçamento')
  }
}
