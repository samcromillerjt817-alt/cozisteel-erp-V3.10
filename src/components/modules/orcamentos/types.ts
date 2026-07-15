// Módulo Orçamentos (Fase 11.5, Subetapa 11.5.12) — o mais complexo dos 3: CRUD completo + grid de
// itens + duplicar + converter em Pedido de Venda + 2 PDFs, com catálogos `clients`/`products`
// compartilhados com Produção (permanecem em `page.tsx`, injetados aqui via props).

export const QUOTE_STATUS_LABELS: Record<string, string> = {
  draft: 'Rascunho', sent: 'Enviado', approved: 'Aprovado', rejected: 'Rejeitado',
  cancelled: 'Cancelado', expired: 'Expirado',
}

// Espelha `ALLOWED_TRANSITIONS` de `quote.service.ts` (ADR-002) — mesma correção já aplicada em
// Compras/Requisições/Produção/Pedidos de Venda: o `Select` de status só lista o status atual + as
// transições de fato permitidas a partir dele. `expired` nunca aparece como alvo (nenhuma transição do
// mapa do backend leva a ele — é um status morto/inatingível hoje, achado já catalogado; corrigi-lo
// exigiria um cron/job que o backend não tem, fora do escopo desta migração estrutural de UI).
export const QUOTE_TRANSITIONS: Record<string, string[]> = {
  draft: ['sent', 'cancelled'],
  sent: ['approved', 'rejected', 'cancelled', 'draft'],
  approved: ['cancelled'],
  rejected: ['sent', 'cancelled'],
  expired: ['sent', 'cancelled'],
  cancelled: [],
}

export interface QuoteItem {
  id?: string
  productId?: string
  code: string
  description: string
  quantity: number
  unit: string
  unitPrice: number
  total: number
  weight: number
  width: number
  height: number
  length: number
  order: number
}

export const emptyQuoteItem = (): QuoteItem => ({
  id: '', productId: '', code: '', description: '', quantity: 1, unit: 'UN', unitPrice: 0, total: 0,
  weight: 0, width: 0, height: 0, length: 0, order: 0,
})

export type QuoteFormData = {
  clientId: string
  clientName: string
  clientCnpj: string
  clientContact: string
  clientPhone: string
  clientEmail: string
  clientAddress: string
  clientNeighborhood: string
  clientCep: string
  items: QuoteItem[]
  discountType: string
  discountValue: number
  freightMode: string
  freightValue: number
  freightText: string
  paymentTerms: string
  warranty: string
  validity: string
  deliveryTime: string
  notes: string
  status: string
}

export const emptyQuoteForm = (): QuoteFormData => ({
  clientId: '', clientName: '', clientCnpj: '', clientContact: '', clientPhone: '', clientEmail: '',
  clientAddress: '', clientNeighborhood: '', clientCep: '',
  items: [emptyQuoteItem()],
  discountType: 'value', discountValue: 0, freightMode: 'combined', freightValue: 0, freightText: 'A COMBINAR',
  paymentTerms: '', warranty: '', validity: '', deliveryTime: '', notes: '', status: 'draft',
})

export interface QuoteListRow {
  id: string
  number: string
  status: string
  date: string
  clientName: string
  total: number
  salesOrder: { id: string; number: string } | null
}

export interface ClientOption {
  id: string
  corporateName: string
  tradeName: string
  cpfCnpj: string | null
  email: string
  phone: string
  contactName?: string
  contactPhone?: string
  address?: string
  number?: string
  neighborhood?: string
  zipCode?: string
}

export interface ProductOption {
  id: string
  internalCode: string
  name: string
  unit?: string
  salePrice: number
  weight: number
}
