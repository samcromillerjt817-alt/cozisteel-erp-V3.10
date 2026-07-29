import { NextRequest } from 'next/server'
import { requireAuth, requireModulePermission, ok, created, handleRouteError } from '@/lib/api-utils'
import { validateDto, bomLineSchema } from '@/app/dto'
import { bomService } from '@/app/services/bom.service'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: RouteContext) {
  try {
    await requireAuth()
    const { id } = await ctx.params
    const lines = await bomService.listLines(id)
    return ok(lines)
  } catch (error) {
    return handleRouteError(error, 'Erro ao buscar linhas da estrutura')
  }
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  try {
    await requireModulePermission('produtos', 'update')
    const { id } = await ctx.params
    const body = await req.json()
    const data = validateDto(bomLineSchema, body)

    const line = await bomService.addLine(id, data)
    return created(line)
  } catch (error) {
    return handleRouteError(error, 'Erro ao adicionar linha à estrutura')
  }
}
