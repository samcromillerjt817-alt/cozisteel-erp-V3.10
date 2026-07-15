import { NextRequest } from 'next/server'
import { requireAuth, ok, handleRouteError } from '@/lib/api-utils'
import { financialReportService } from '@/app/services/financial-report.service'

/** GET /api/financeiro/relatorios/fluxo-caixa?daysAhead=90 */
export async function GET(req: NextRequest) {
  try {
    await requireAuth()
    const { searchParams } = new URL(req.url)
    const daysAhead = parseInt(searchParams.get('daysAhead') || '90', 10) || 90

    const cashFlow = await financialReportService.getProjectedCashFlow(daysAhead)
    return ok(cashFlow)
  } catch (error) {
    return handleRouteError(error, 'Erro ao buscar fluxo de caixa projetado')
  }
}
