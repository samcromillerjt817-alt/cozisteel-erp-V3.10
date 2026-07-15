import { NextRequest } from 'next/server'
import { requireAuth, requireModulePermission, ok, handleRouteError } from '@/lib/api-utils'
import { materialService } from '@/app/services/material.service'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: RouteContext) {
  try {
    await requireAuth()
    const { id } = await ctx.params
    const material = await materialService.getById(id)
    return ok(material)
  } catch (error) {
    return handleRouteError(error, 'Erro ao buscar matéria-prima')
  }
}

export async function PUT(req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requireModulePermission('materiais', 'update')
    const { id } = await ctx.params
    const body = await req.json()
    const updated = await materialService.update(id, body, user.id)
    return ok(updated)
  } catch (error) {
    return handleRouteError(error, 'Erro ao atualizar matéria-prima')
  }
}

export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requireModulePermission('materiais', 'delete')
    const { id } = await ctx.params
    const result = await materialService.delete(id, user.id)
    return ok(result)
  } catch (error) {
    return handleRouteError(error, 'Erro ao excluir matéria-prima')
  }
}
