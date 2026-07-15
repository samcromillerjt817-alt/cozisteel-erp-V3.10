// Widgets nativos do perfil Financeiro (ADR-019, Subetapa 7.5) — primeiro widget realmente próprio do
// domínio (antes a aba Financeiro só reaproveitava widgets de Comercial/Compras, Hardening pós-11.5).
// Reaproveita `FinancialReportService.getAccountBalances()` (Fase 12, Subetapa 6) — zero recálculo de
// regra de negócio, o Dashboard só formata o que o Financeiro já expõe.

import { financialReportService } from '@/app/services/financial-report.service'
import { registerWidget } from '@/app/services/dashboard-widgets.service'
import { formatCurrency } from '@/lib/format'
import type { DashboardWidgetDTO } from '@/app/services/dashboard-types'

registerWidget({
  id: 'financeiro.saldo-liquido-em-aberto',
  sourceProfiles: ['financeiro'],
  expensive: false,
  compute: async (): Promise<DashboardWidgetDTO> => {
    const balances = await financialReportService.getAccountBalances()
    const saldoLiquido = balances.receivable.open - balances.payable.open
    return {
      id: 'financeiro.saldo-liquido-em-aberto',
      type: 'card',
      title: 'Saldo líquido em aberto',
      order: 10,
      data: {
        value: saldoLiquido,
        format: 'currency',
        hint: `A receber: ${formatCurrency(balances.receivable.open)} · A pagar: ${formatCurrency(balances.payable.open)}`,
      },
    }
  },
})
