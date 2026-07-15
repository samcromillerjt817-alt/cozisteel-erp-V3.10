// Condições de pagamento padronizadas (Fase 11.5, Subetapa 11.5.10 — achado do usuário: campo de
// texto livre virou fonte de inconsistência, ex. "30 dias" vs "30d" vs "trinta dias" representando a
// mesma coisa). Usado tanto em Orçamento (Quote) quanto em Fornecedor (Supplier) — mesmo vocabulário,
// mesma lista, nunca duplicada entre os dois.
export const PAYMENT_TERMS_OPTIONS = [
  'À vista',
  '7 dias',
  '15 dias',
  '30 dias',
  '45 dias',
  '60 dias',
  '90 dias',
  '30/60 dias',
  '30/60/90 dias',
  'Entrada + 30 dias',
] as const

// Fase 12 (ADR-016) — única fonte de verdade para "quantos dias até o vencimento" a partir de uma
// condição de pagamento (`PAYMENT_TERMS_OPTIONS`). Antes desta função, o Financeiro tinha um
// vencimento fixo de 30 dias hardcoded, ignorando o campo `paymentTerms` que `Quote`/`SalesOrder`/
// `PurchaseOrder`/`Supplier` já carregam — achado do usuário, corrigido aqui: nenhuma duplicação de
// regra, o Financeiro passa a LER o mesmo campo que o Comercial/Compras já preenchem.
//
// Termos de parcela única ("30 dias", "À vista") são exatos. Termos com mais de uma parcela
// ("30/60 dias", "30/60/90 dias", "Entrada + 30 dias") usam o prazo da ÚLTIMA parcela como
// vencimento do título — simplificação deliberada, não uma tentativa de repartir o valor em
// parcelas: o schema atual (`AccountReceivable`/`AccountPayable`) modela 1 título = 1 valor = 1
// vencimento; representar parcelas de fato como títulos separados exigiria relaxar
// `invoiceId`/`purchaseOrderId` de `@unique` para 1:N, uma decisão de schema própria, não tomada
// nesta rodada — ver ADR-016.
const DEFAULT_DUE_DAYS = 30 // usado só quando `paymentTerms` está vazio ou não reconhecido

export function resolveDueDays(paymentTerms: string): number {
  const term = paymentTerms.trim()
  if (!term || term === 'À vista') return 0
  const days = term.match(/\d+/g)?.map(Number) ?? []
  if (days.length === 0) return DEFAULT_DUE_DAYS
  return Math.max(...days)
}

export function resolveDueDate(paymentTerms: string, from: Date = new Date()): Date {
  return new Date(from.getTime() + resolveDueDays(paymentTerms) * 24 * 60 * 60 * 1000)
}
