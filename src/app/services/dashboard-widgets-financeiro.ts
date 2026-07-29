// Widgets nativos do perfil Financeiro (ADR-019, Subetapa 7.5) — primeiro widget realmente próprio do
// domínio (antes a aba Financeiro só reaproveitava widgets de Comercial/Compras, Hardening pós-11.5).
// Reaproveita `FinancialReportService.getAccountBalances()` (Fase 12, Subetapa 6) — zero recálculo de
// regra de negócio, o Dashboard só formata o que o Financeiro já expõe.

import { financialReportService } from '@/app/services/financial-report.service'
import { registerWidget } from '@/app/services/dashboard-widgets.service'
import { accountReceivableRepository } from '@/app/repositories/account-receivable.repository'
import { accountPayableRepository } from '@/app/repositories/account-payable.repository'
import { formatCurrency } from '@/lib/format'
import type { DashboardWidgetDTO } from '@/app/services/dashboard-types'

const CONTAS_VENCIDAS_CRITICAL_COUNT = 10

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

// ADR-024 (Centro de Operações, Fase 1) — mesma definição de "vencido" de `getAccountBalances()`
// (dueDate < agora, título ainda em aberto), aqui como CONTAGEM de títulos em vez de soma monetária
// (a soma já existe no KPI acima; a contagem é o que o Centro de Operações precisa mostrar).
registerWidget({
  id: 'financeiro.contas-vencidas',
  sourceProfiles: ['financeiro'],
  expensive: false,
  compute: async (): Promise<DashboardWidgetDTO> => {
    const now = new Date()
    const [receivables, payables] = await Promise.all([
      accountReceivableRepository.findOpenWithReceipts() as Promise<Array<{ dueDate: Date }>>,
      accountPayableRepository.findOpenWithPayments() as Promise<Array<{ dueDate: Date }>>,
    ])
    const overdueReceivables = receivables.filter((r) => r.dueDate < now).length
    const overduePayables = payables.filter((p) => p.dueDate < now).length
    const count = overdueReceivables + overduePayables
    const severity = count === 0 ? 'info' : count >= CONTAS_VENCIDAS_CRITICAL_COUNT ? 'critical' : 'warning'
    return {
      id: 'financeiro.contas-vencidas',
      type: 'alert',
      title: 'Contas vencidas',
      order: 20,
      data: {
        severity,
        count,
        message: count === 1 ? '1 conta vencida (a pagar ou a receber).' : `${count} contas vencidas (a pagar ou a receber).`,
        linkToModule: 'financeiro',
      },
    }
  },
})
