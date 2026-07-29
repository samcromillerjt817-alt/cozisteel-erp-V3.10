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
  itemType: string
  quantity: number
  balanceAfter: number
  reason: string
  referenceType: string
  createdAt: string
  material?: { id: string; name: string } | null
  product?: { id: string; name: string } | null
  user?: { id: string; name: string } | null
  // ADR-023 (Decisão #1, Estorno) — `reversedAt` marca que este lançamento já foi estornado;
  // `reversalOfId` marca que ESTE lançamento É o estorno de outro. Só um recebimento de compra
  // (IN + referenceType "purchase_order"), nunca estornado antes e que não seja ele mesmo um
  // estorno, ganha a ação "Estornar" na lista.
  reversedAt: string | null
  reversalOfId: string | null
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
