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

/** Converte "dd/mm/aaaa" (formato de data de negócio usado em campos como Quote.validUntil) — devolve null se o formato não bater. */
export function parseBrDate(value: string): Date | null {
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!match) return null
  return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]))
}

/**
 * Parser de data pra campos de API que recebem uma string de data de fora (nunca `new Date(string)`
 * direto num valor vindo do cliente — `new Date("05/09/2026")` é interpretado como mm/dd/aaaa
 * americano pelo motor JS, virando 9 de maio em vez de 5 de setembro; achado real numa avaliação
 * end-to-end, 2026-07-29). Aceita os 2 formatos que legitimamente chegam à API hoje: ISO
 * (`aaaa-mm-dd`, o que `<input type="date">` e as telas de Financeiro já enviam) e `dd/mm/aaaa` (a
 * convenção usada no resto do sistema, caso um chamador futuro — app mobile, script, integração —
 * envie nesse formato em vez de ISO). Devolve `null` pra qualquer formato não reconhecido ou data
 * inválida, em vez de silenciosamente devolver `Invalid Date`.
 */
export function parseApiDate(value: string): Date | null {
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
    const parsed = new Date(value)
    return isNaN(parsed.getTime()) ? null : parsed
  }
  return parseBrDate(value)
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