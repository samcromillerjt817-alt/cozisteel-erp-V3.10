import { NextRequest } from 'next/server'
import { requireAuth, requireModulePermission, ok, handleRouteError } from '@/lib/api-utils'
import { clientService } from '@/app/services/client.service'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: RouteContext) {
  try {
    await requireAuth()
    const { id } = await ctx.params
    const client = await clientService.getById(id)
    return ok(client)
  } catch (error) {
    return handleRouteError(error, 'Erro ao buscar cliente')
  }
}

export async function PUT(req: NextRequest, ctx: RouteContext) {
  try {
    await requireModulePermission('clientes', 'update')
    const { id } = await ctx.params
    const body = await req.json()
    const updated = await clientService.update(id, body)
    return ok(updated)
  } catch (error) {
    return handleRouteError(error, 'Erro ao atualizar cliente')
  }
}

export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  try {
    await requireModulePermission('clientes', 'delete')
    const { id } = await ctx.params
    const result = await clientService.delete(id)
    return ok(result)
  } catch (error) {
    return handleRouteError(error, 'Erro ao excluir cliente')
  }
}
