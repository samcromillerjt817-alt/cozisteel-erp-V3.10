import { NextRequest } from 'next/server'
import { requireModulePermission, ok, handleRouteError } from '@/lib/api-utils'
import { validateDto, approvalRuleSchema } from '@/app/dto'
import { approvalService } from '@/app/services/approval.service'

type RouteContext = { params: Promise<{ id: string }> }

export async function PUT(req: NextRequest, ctx: RouteContext) {
  try {
    await requireModulePermission('sistema', 'manage')
    const { id } = await ctx.params
    const body = await req.json()
    const data = validateDto(approvalRuleSchema, body)

    const rule = await approvalService.updateRule(id, data)
    return ok(rule)
  } catch (error) {
    return handleRouteError(error, 'Erro ao atualizar regra de alçada')
  }
}

export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  try {
    await requireModulePermission('sistema', 'manage')
    const { id } = await ctx.params
    const result = await approvalService.deleteRule(id)
    return ok(result)
  } catch (error) {
    return handleRouteError(error, 'Erro ao excluir regra de alçada')
  }
}
