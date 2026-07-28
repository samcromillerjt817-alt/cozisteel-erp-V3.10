import { NextRequest } from 'next/server'
import { requireAuth, requireModulePermission, ok, handleRouteError } from '@/lib/api-utils'
import { bomService } from '@/app/services/bom.service'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: RouteContext) {
  try {
    await requireAuth()
    const { id } = await ctx.params
    const revision = await bomService.getRevision(id)
    return ok(revision)
  } catch (error) {
    return handleRouteError(error, 'Erro ao buscar revisão de engenharia')
  }
}

export async function PUT(req: NextRequest, ctx: RouteContext) {
  try {
    await requireModulePermission('produtos', 'update')
    const { id } = await ctx.params
    const body = await req.json()
    const revision = await bomService.updateRevision(id, {
      notes: body.notes,
      effectiveFrom: body.effectiveFrom ? new Date(body.effectiveFrom) : body.effectiveFrom === null ? null : undefined,
    })
    return ok(revision)
  } catch (error) {
    return handleRouteError(error, 'Erro ao atualizar revisão de engenharia')
  }
}

export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  try {
    await requireModulePermission('produtos', 'delete')
    const { id } = await ctx.params
    const result = await bomService.deleteRevision(id)
    return ok(result)
  } catch (error) {
    return handleRouteError(error, 'Erro ao excluir revisão de engenharia')
  }
}
