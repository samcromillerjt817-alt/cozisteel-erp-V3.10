import { NextRequest } from 'next/server'
import { requireModulePermission, ok, handleRouteError } from '@/lib/api-utils'
import { validateDto, productOperationSchema } from '@/app/dto'
import { bomService } from '@/app/services/bom.service'

type RouteContext = { params: Promise<{ id: string; operationId: string }> }

export async function PUT(req: NextRequest, ctx: RouteContext) {
  try {
    await requireModulePermission('produtos', 'update')
    const { id, operationId } = await ctx.params
    const body = await req.json()
    const data = validateDto(productOperationSchema, body)

    const operation = await bomService.updateOperation(id, operationId, data)
    return ok(operation)
  } catch (error) {
    return handleRouteError(error, 'Erro ao atualizar operação da estrutura')
  }
}

export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  try {
    await requireModulePermission('produtos', 'update')
    const { id, operationId } = await ctx.params
    const result = await bomService.removeOperation(id, operationId)
    return ok(result)
  } catch (error) {
    return handleRouteError(error, 'Erro ao remover operação da estrutura')
  }
}
