// Módulo Relatórios (Fase 11.5, Subetapa 11.5.9 — normalização final: sai do HTML cru para `DataTable`).

export type ReportType = 'sales' | 'production' | 'purchases' | 'stock'

export const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  sales: 'Vendas (Orçamentos)',
  production: 'Produção',
  purchases: 'Compras (Requisições)',
  stock: 'Estoque',
}

export interface ReportResult {
  summary: Record<string, unknown>
  rows: Record<string, unknown>[]
}

// Rótulos e chaves monetárias vêm de `src/lib/report-labels.ts` — mesma fonte usada pelo PDF
// (`getSummaryLines`, backend), para as duas pontas nunca divergirem.
export { REPORT_SUMMARY_LABELS, REPORT_SUMMARY_MONEY_KEYS } from '@/lib/report-labels'
