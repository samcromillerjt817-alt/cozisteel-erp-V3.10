import { NextRequest } from 'next/server'
import { requireAuth, ok, badRequest, handleRouteError } from '@/lib/api-utils'
import { financialReportService } from '@/app/services/financial-report.service'

/**
 * GET /api/financeiro/relatorios/margem?from=2026-01-01&to=2026-01-31
 *
 * Estimativa agregada de margem bruta do período — ver a limitação estrutural
 * documentada em `FinancialReportService.getGrossMarginEstimate` (sem vínculo
 * `SalesOrderItem`→`ProductBatch` no schema, `costCoveragePercent` expõe a
 * confiabilidade do número).
 */
export async function GET(req: NextRequest) {
  try {
    await requireAuth()
    const { searchParams } = new URL(req.url)
    const from = new Date(searchParams.get('from') || '')
    const to = new Date(searchParams.get('to') || '')
    if (isNaN(from.getTime()) || isNaN(to.getTime())) {
      return badRequest('Informe from e to em formato de data válido (ex: 2026-01-01)')
    }

    const margin = await financialReportService.getGrossMarginEstimate(from, to)
    return ok(margin)
  } catch (error) {
    return handleRouteError(error, 'Erro ao calcular margem bruta estimada')
  }
}
