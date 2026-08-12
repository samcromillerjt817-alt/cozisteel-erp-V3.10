import { NextRequest } from 'next/server'
import { requireModulePermission, ok, handleRouteError } from '@/lib/api-utils'
import { categoryService } from '@/app/services/category.service'

type RouteContext = { params: Promise<{ id: string }> }

export async function PUT(req: NextRequest, ctx: RouteContext) {
  try {
    await requireModulePermission('categorias', 'update')
    const { id } = await ctx.params
    const body = await req.json()
    const updated = await categoryService.update(id, body)
    return ok(updated)
  } catch (error) {
    return handleRouteError(error, 'Erro ao atualizar categoria')
  }
}

export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  try {
    await requireModulePermission('categorias', 'delete')
    const { id } = await ctx.params
    const result = await categoryService.remove(id)
    return ok(result)
  } catch (error) {
    return handleRouteError(error, 'Erro ao excluir categoria')
  }
}
