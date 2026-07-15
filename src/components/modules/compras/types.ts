// Módulo Compras (Fase 11.5, Subetapa 11.5.8 — drill-down pesado, `DetailDrawer`). Nunca tem criação
// manual: um Pedido de Compra só nasce quando uma Requisição avança para "ordered"
// (`purchase-order.service.ts` `createFromRequisition`).

export const PURCHASE_ORDER_STATUS_LABELS: Record<string, string> = {
  draft: 'Rascunho',
  pending_approval: 'Aguardando aprovação',
  approved: 'Aprovado',
  sent: 'Enviado',
  confirmed: 'Confirmado',
  partially_received: 'Recebido parcial',
  received: 'Recebido',
  cancelled: 'Cancelado',
}

// Espelha `ALLOWED_TRANSITIONS` de `purchase-order.service.ts` — correção do bug catalogado desde a
// Fase 8/ADR-015: o seletor de status antigo oferecia só `['draft', 'sent', 'confirmed', 'cancelled']`
// para QUALQUER status, então "Rascunho → Enviado" aparecia como opção válida mas sempre falhava com
// 400 no backend (passa obrigatoriamente por `pending_approval`→`approved` antes de "sent"). Uma única
// lista aqui, usada para calcular as opções válidas do status atual, elimina a divergência.
export const PURCHASE_ORDER_TRANSITIONS: Record<string, string[]> = {
  draft: ['pending_approval', 'cancelled'],
  pending_approval: ['approved', 'draft', 'cancelled'],
  approved: ['sent', 'cancelled'],
  sent: ['confirmed', 'cancelled'],
  confirmed: ['cancelled'], // recebimento tem fluxo próprio (endpoint /receive), não é uma transição de status manual
  partially_received: ['cancelled'],
  received: [],
  cancelled: [],
}

export interface PurchaseOrderItem {
  id: string
  materialId: string
  quantity: number
  unit: string
  unitPrice: number
  quantityReceived: number
  total: number
  material: { id: string; name: string; unit: string; lotControlled: boolean }
}

export interface PurchaseOrderListRow {
  id: string
  number: string
  status: string
  total: number
  createdAt: string
  supplier: { id: string; corporateName: string; tradeName: string } | null
  requisition: { id: string; number: string } | null
}

export interface PurchaseOrderRecord extends PurchaseOrderListRow {
  expectedDate: string
  paymentTerms: string
  notes: string
  items: PurchaseOrderItem[]
}
