// Módulo Estoque (Fase 11.5, Subetapa 11.5.12). Sem máquina de estados (não há campo `status` de
// domínio aqui, só o `type` de uma movimentação já concluída) — a única regra especial é o ajuste
// manual de inventário, que sempre lança uma nova movimentação do tipo ADJUST.

export const STOCK_MOVEMENT_TYPE_LABELS: Record<string, string> = {
  IN: 'Entrada', OUT: 'Saída', ADJUST: 'Ajuste',
}

export interface StockSummaryItem {
  itemType: 'material' | 'product'
  id: string
  name: string
  stockQty: number
  minStockQty: number
  unit: string
  isLow: boolean
}

export interface StockMovementRow {
  id: string
  type: string
  quantity: number
  balanceAfter: number
  reason: string
  createdAt: string
  material?: { id: string; name: string } | null
  product?: { id: string; name: string } | null
  user?: { id: string; name: string } | null
}

export interface StockAdjustForm {
  itemType: string
  itemId: string
  itemName: string
  currentQty: number
  unit: string
  newQuantity: number
  reason: string
}
