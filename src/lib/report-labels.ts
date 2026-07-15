// Rótulos em português para as chaves de `summary` de `report.service.ts` (nomes internos de
// variável, em inglês) — usado tanto no PDF (backend, `getSummaryLines`) quanto nos cartões de
// resumo da tela (frontend, `RelatoriosPage`), única fonte para as duas pontas nunca divergirem.
export const REPORT_SUMMARY_LABELS: Record<string, string> = {
  totalQuotes: 'Total de Orçamentos',
  totalValue: 'Valor Total',
  approvedValue: 'Valor Aprovado',
  totalOrders: 'Total de Ordens',
  completed: 'Concluídas',
  inProgress: 'Em Andamento',
  totalRequisitions: 'Total de Requisições',
  totalEstimated: 'Valor Estimado',
  totalItems: 'Total de Itens',
  lowStockItems: 'Itens com Estoque Baixo',
}

// Chaves cujo valor é monetário (recebem prefixo "R$" + formatação de moeda) — as demais são
// contagens simples, formatadas só com separador de milhar.
export const REPORT_SUMMARY_MONEY_KEYS = new Set(['totalValue', 'approvedValue', 'totalEstimated'])
