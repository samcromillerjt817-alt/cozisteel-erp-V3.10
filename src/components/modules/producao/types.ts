// Módulo Produção / Ordens de Produção (Fase 11.5, Subetapa 11.5.8 — drill-down pesado, `DetailDrawer`).

export const PRODUCTION_ORDER_STATUS_LABELS: Record<string, string> = {
  planned: 'Planejada', in_progress: 'Em execução', paused: 'Pausada', completed: 'Concluída', cancelled: 'Cancelada',
}

// Espelha `ALLOWED_TRANSITIONS` de `production-order.service.ts` (ADR-002) — mesma correção de
// Compras/Requisições: o seletor de status antigo oferecia os 5 status sempre, então "Pausada →
// Concluída" direto aparecia como opção mas sempre falhava com 400 (precisa voltar a "Em execução"
// antes). `planned → completed` direto é permitido de propósito (preserva o fluxo atual).
export const PRODUCTION_ORDER_TRANSITIONS: Record<string, string[]> = {
  planned: ['in_progress', 'completed', 'cancelled'],
  in_progress: ['paused', 'completed', 'cancelled'],
  paused: ['in_progress', 'cancelled'],
  completed: [],
  cancelled: [],
}

export const PRIORITY_LABELS: Record<string, string> = {
  low: 'Baixa', normal: 'Normal', high: 'Alta', urgent: 'Urgente',
}

// `findMany`/`findUnique` sem `select` retornam todos os campos escalares do model — a listagem já
// vem com `date`/`priority`/`description`/`notes`/`salesOrderId`, só falta a relação `requisitions`
// (só a busca por id inclui). Por isso não há bug aqui como havia em Clientes: editar reaproveita a
// linha da lista sem perder nenhum campo.
export interface ProductionOrderListRow {
  id: string
  number: string
  status: string
  quantity: number
  quantityCompleted: number
  unit: string
  date: string
  dueDate: string
  priority: string
  description: string
  notes: string
  productId: string | null
  productName: string
  salesOrderId: string | null
  product: { id: string; name: string; internalCode: string } | null
}

export interface ProductionOrderRecord extends ProductionOrderListRow {
  requisitions: { id: string; number: string; status: string }[]
}

export interface ProductionOrderFormData {
  productId: string
  productName: string
  quantity: number
  unit: string
  priority: string
  date: string
  dueDate: string
  description: string
  notes: string
  salesOrderId: string
}

export const EMPTY_PRODUCTION_ORDER_FORM = (): ProductionOrderFormData => ({
  productId: '', productName: '', quantity: 1, unit: 'UN', priority: 'normal',
  date: new Date().toLocaleDateString('pt-BR'), dueDate: '', description: '', notes: '', salesOrderId: '',
})

// Sem bug conhecido aqui (a linha da lista já tem os campos completos) — mapeamento explícito, mesmo
// padrão de `materialToFormData`/Produtos, não precisa da lista única `FORM_FIELD_KEYS` do caso
// Cliente/Fornecedor.
export function productionOrderToFormData(order: ProductionOrderListRow): ProductionOrderFormData {
  return {
    productId: order.productId || '',
    productName: order.productName || order.product?.name || '',
    quantity: order.quantity || 1,
    unit: order.unit || 'UN',
    priority: order.priority || 'normal',
    date: order.date || '',
    dueDate: order.dueDate || '',
    description: order.description || '',
    notes: order.notes || '',
    salesOrderId: order.salesOrderId || '',
  }
}
