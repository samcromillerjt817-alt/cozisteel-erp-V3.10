import { NextRequest } from 'next/server'
import { requireAuth, ok, handleRouteError } from '@/lib/api-utils'
import { financialReportService } from '@/app/services/financial-report.service'

type RouteContext = { params: Promise<{ productId: string }> }

export async function GET(_req: NextRequest, ctx: RouteContext) {
  try {
    await requireAuth()
    const { productId } = await ctx.params

    const history = await financialReportService.getMaterialCostHistory(productId)
    return ok(history)
  } catch (error) {
    return handleRouteError(error, 'Erro ao buscar histórico de custo do produto')
  }
}
