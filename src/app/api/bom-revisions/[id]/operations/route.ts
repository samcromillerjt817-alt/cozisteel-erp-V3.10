import { NextRequest } from 'next/server'
import { requireAuth, requireModulePermission, ok, created, handleRouteError } from '@/lib/api-utils'
import { validateDto, productOperationSchema } from '@/app/dto'
import { bomService } from '@/app/services/bom.service'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: RouteContext) {
  try {
    await requireAuth()
    const { id } = await ctx.params
    const operations = await bomService.listOperations(id)
    return ok(operations)
  } catch (error) {
    return handleRouteError(error, 'Erro ao buscar operações da estrutura')
  }
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  try {
    await requireModulePermission('produtos', 'update')
    const { id } = await ctx.params
    const body = await req.json()
    const data = validateDto(productOperationSchema, body)

    const operation = await bomService.addOperation(id, data)
    return created(operation)
  } catch (error) {
    return handleRouteError(error, 'Erro ao adicionar operação à estrutura')
  }
}
