// Inclui o prefixo "R$" desde a Hardening pós-11.5, Prioridade 4 — antes devolvia só o número
// formatado, e metade dos call sites concatenava "R$ " manualmente e a outra metade não, produzindo o
// mesmo tipo de valor com e sem prefixo dependendo da tela (achado da auditoria de consolidação). Toda
// concatenação manual de "R$" nos call sites foi removida junto com esta mudança — não some.
export function formatCurrency(value: number | null | undefined): string {
  const safeValue = typeof value === 'number' && !isNaN(value) ? value : 0
  return `R$ ${safeValue.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

export function parseCurrencyInput(val: string): number {
  const cleaned = val.replace(/[R$\s.]/g, '').replace(',', '.')
  const num = parseFloat(cleaned)
  return isNaN(num) ? 0 : num
}

export function formatDate(date: Date): string {
  const d = String(date.getDate()).padStart(2, '0')
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const y = date.getFullYear()
  return `${d}/${m}/${y}`
}

export const statusLabels: Record<string, string> = {
  draft: 'Rascunho',
  sent: 'Enviado',
  approved: 'Aprovado',
  rejected: 'Rejeitado',
  cancelled: 'Cancelado',
  expired: 'Expirado',
}

// Cor de status centralizada em src/lib/status-tokens.ts (Fase 13, Lote 2, ADR-015) — fonte única
// de verdade para todos os domínios, não só Orçamento.