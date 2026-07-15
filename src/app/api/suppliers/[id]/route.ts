import { NextRequest } from 'next/server'
import { requireAuth, requireModulePermission, ok, handleRouteError } from '@/lib/api-utils'
import { supplierService } from '@/app/services/supplier.service'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: RouteContext) {
  try {
    await requireAuth()
    const { id } = await ctx.params
    const supplier = await supplierService.getById(id)
    return ok(supplier)
  } catch (error) {
    return handleRouteError(error, 'Erro ao buscar fornecedor')
  }
}

export async function PUT(req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requireModulePermission('fornecedores', 'update')
    const { id } = await ctx.params
    const body = await req.json()
    const updated = await supplierService.update(id, body, user.id)
    return ok(updated)
  } catch (error) {
    return handleRouteError(error, 'Erro ao atualizar fornecedor')
  }
}

export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requireModulePermission('fornecedores', 'delete')
    const { id } = await ctx.params
    const result = await supplierService.delete(id, user.id)
    return ok(result)
  } catch (error) {
    return handleRouteError(error, 'Erro ao excluir fornecedor')
  }
}
