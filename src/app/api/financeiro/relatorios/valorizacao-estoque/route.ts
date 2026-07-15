import { requireAuth, ok, handleRouteError } from '@/lib/api-utils'
import { financialReportService } from '@/app/services/financial-report.service'

export async function GET() {
  try {
    await requireAuth()
    const valuation = await financialReportService.getStockValuation()
    return ok(valuation)
  } catch (error) {
    return handleRouteError(error, 'Erro ao buscar valorização de estoque')
  }
}
