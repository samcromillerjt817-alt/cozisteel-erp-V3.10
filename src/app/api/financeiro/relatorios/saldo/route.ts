import { requireAuth, ok, handleRouteError } from '@/lib/api-utils'
import { financialReportService } from '@/app/services/financial-report.service'

export async function GET() {
  try {
    await requireAuth()
    const balances = await financialReportService.getAccountBalances()
    return ok(balances)
  } catch (error) {
    return handleRouteError(error, 'Erro ao buscar saldo de contas a pagar/receber')
  }
}
