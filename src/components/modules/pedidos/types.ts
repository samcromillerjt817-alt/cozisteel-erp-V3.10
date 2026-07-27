// Módulo Pedidos de Venda / SalesOrder (Fase 11.5, Subetapa 11.5.12). Nunca tem criação manual — só
// nasce da conversão de um Orçamento aprovado (`QuoteService.convertToSalesOrder`); status e leitura,
// sem formulário de criação/edição, mesmo espírito de Compras (11.5.8).

export const SALES_ORDER_STATUS_LABELS: Record<string, string> = {
  open: 'Aberto', in_production: 'Em produção', completed: 'Concluído', cancelled: 'Cancelado',
}

// Espelha `ALLOWED_TRANSITIONS` de `sales-order.service.ts` (ADR-002) — mesma correção já aplicada em
// Compras/Requisições/Produção: o `Select` de status só deve listar o status atual + as transições de
// fato permitidas a partir dele, nunca todos os status possíveis.
export const SALES_ORDER_TRANSITIONS: Record<string, string[]> = {
  open: ['in_production', 'cancelled'],
  in_production: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
}

export interface SalesOrderItem {
  id: string
  productId: string | null
  code: string
  description: string
  quantity: number
  unit: string
  unitPrice: number
  total: number
  product?: { id: string; name: string; internalCode: string } | null
}

export interface SalesOrderProductionOrder {
  id: string
  number: string
  status: string
  productName?: string
  quantity?: number
}

export interface SalesOrderListRow {
  id: string
  number: string
  status: string
  date: string
  clientName: string
  clientCnpj: string
  total: number
  client: { id: string; corporateName: string } | null
  quote: { id: string; number: string } | null
  productionOrders: SalesOrderProductionOrder[]
}

export interface SalesOrderRecord extends Omit<SalesOrderListRow, 'client' | 'quote'> {
  client: { id: string; corporateName: string; tradeName: string; cpfCnpj: string | null } | null
  quote: { id: string; number: string; status: string } | null
  items: SalesOrderItem[]
  paymentTerms: string
  deliveryTime: string
  notes: string
}

// ADR-023 (Decisão #2, Faturamento) — Faturamento ligado à UI pela primeira vez.

export const INVOICE_STATUS_LABELS: Record<string, string> = {
  issued: 'Emitida', cancelled: 'Cancelada',
}

export interface InvoiceableItemBalance {
  salesOrderItemId: string
  description: string
  unitPrice: number
  quantityOrdered: number
  quantityInvoiced: number
  quantityRemaining: number
}

export interface InvoiceRecord {
  id: string
  number: string
  status: string
  total: number
  issuedAt: string
  cancelledAt: string | null
  notes: string
  user?: { id: string; name: string } | null
  accountReceivable?: { id: string; number: string; status: string } | null
  items: { id: string; salesOrderItemId: string; quantity: number; unitPrice: number; total: number }[]
}
