import { NextRequest } from 'next/server'
import { requireAuth, requireModulePermission, unauthorized, forbidden, notFound, badRequest, ok, handleRouteError, UnauthorizedError, ForbiddenError } from '@/lib/api-utils'
import { NotFoundException } from '@/app/exceptions'
import { quoteService } from '@/app/services/quote.service'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: RouteContext) {
  try {
    await requireAuth()
    const { id } = await ctx.params

    const quote = await quoteService.getById(id)
    return ok(quote)
  } catch (error) {
    return handleRouteError(error, 'Erro ao buscar orçamento')
  }
}

export async function PUT(req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requireModulePermission('orcamentos', 'update')
    const { id } = await ctx.params
    const body = await req.json()

    const updated = await quoteService.update(id, body, user.id)
    return ok(updated)
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorized()
    if (error instanceof ForbiddenError) return forbidden(error.message)
    if (error instanceof NotFoundException) return notFound(error.message)
    console.error('PUT /api/quotes/[id] error:', error)
    // Em desenvolvimento/depuração, devolve a mensagem real do erro em vez de um texto genérico
    const message = error instanceof Error ? error.message : 'Erro ao atualizar orçamento'
    return badRequest(message)
  }
}

export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requireModulePermission('orcamentos', 'delete')
    const { id } = await ctx.params

    const result = await quoteService.delete(id, user.id)
    return ok(result)
  } catch (error) {
    return handleRouteError(error, 'Erro ao excluir orçamento')
  }
}
