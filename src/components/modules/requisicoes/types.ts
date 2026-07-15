// Módulo Requisições + Cotação (Fase 11.5, Subetapa 11.5.8 — drill-down pesado, `DetailDrawer`).

export const REQUISITION_STATUS_LABELS: Record<string, string> = {
  draft: 'Rascunho', sent: 'Enviada', approved: 'Aprovada', ordered: 'Pedido feito', cancelled: 'Cancelada',
}

// Espelha `ALLOWED_TRANSITIONS` de `requisition.service.ts` — mesma correção aplicada em Compras
// (types.ts): o seletor de status antigo oferecia os 5 status sempre, para qualquer status atual,
// então combinações inválidas (ex.: "Rascunho → Pedido feito" direto) apareciam como opção mas sempre
// falhavam com 400 no backend.
export const REQUISITION_TRANSITIONS: Record<string, string[]> = {
  draft: ['sent', 'cancelled'],
  sent: ['approved', 'cancelled', 'draft'],
  approved: ['ordered', 'cancelled'],
  ordered: ['cancelled'],
  cancelled: [],
}

export type RequisitionItemInput = {
  materialId: string
  supplierId: string
  quantity: number
  unit: string
  estimatedPrice: number
  notes: string
}

export const EMPTY_REQUISITION_ITEM = (): RequisitionItemInput => ({
  materialId: '', supplierId: '', quantity: 1, unit: 'KG', estimatedPrice: 0, notes: '',
})

export interface RequisitionFormData {
  productionOrderId: string
  neededBy: string
  notes: string
  items: RequisitionItemInput[]
}

export const EMPTY_REQUISITION_FORM = (): RequisitionFormData => ({
  productionOrderId: '', neededBy: '', notes: '', items: [EMPTY_REQUISITION_ITEM()],
})

export interface RequisitionItemQuote {
  id: string
  supplierId: string
  price: number
  leadTimeDays: number
  notes: string
  isSelected: boolean
  supplier: { id: string; corporateName: string; tradeName: string }
}

export interface RequisitionListItem {
  id: string
  materialId: string | null
  quantity: number
  unit: string
  material: { id: string; name: string; unit: string } | null
  supplier: { id: string; corporateName: string; tradeName: string } | null
}

export interface RequisitionListRow {
  id: string
  number: string
  status: string
  date: string
  items: RequisitionListItem[]
  productionOrder: { id: string; number: string; productName: string } | null
}

export interface RequisitionDetailItem extends RequisitionListItem {
  quotes: RequisitionItemQuote[]
}

export interface RequisitionRecord extends Omit<RequisitionListRow, 'items'> {
  items: RequisitionDetailItem[]
}

export type NewQuoteDraft = { supplierId: string; price: number; leadTimeDays: number }
export const EMPTY_QUOTE_DRAFT = (): NewQuoteDraft => ({ supplierId: '', price: 0, leadTimeDays: 0 })
