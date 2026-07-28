import { NextRequest } from 'next/server'
import { requireModulePermission, ok, handleRouteError } from '@/lib/api-utils'
import { validateDto, periodReopenSchema } from '@/app/dto'
import { periodClosingService } from '@/app/services/period-closing.service'

type RouteContext = { params: Promise<{ period: string }> }

export async function POST(req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requireModulePermission('financeiro', 'manage')
    const { period } = await ctx.params
    const body = await req.json()
    const { reason } = validateDto(periodReopenSchema, body)

    const closing = await periodClosingService.reopen(period, user.id, reason)
    return ok(closing)
  } catch (error) {
    return handleRouteError(error, 'Erro ao reabrir competência')
  }
}
