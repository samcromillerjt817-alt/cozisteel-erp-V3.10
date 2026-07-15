// Tradução de código de status/enum para rótulo em português — aplicada só na exibição (Fase 11,
// ADR-017, Subetapa 7). A API do Dashboard devolve os códigos brutos do banco (ex.: `in_progress`,
// `PRODUCAO`) de propósito — traduzir é apresentação, não regra de negócio, então fica só aqui, no
// frontend, nunca no backend. Os valores replicam exatamente os rótulos já usados no dashboard antigo
// (`page.tsx#requisitionStatusLabels/purchaseOrderStatusLabels/productionStatusLabels/
// salesOrderStatusLabels/roleLabels`, `src/lib/format.ts#statusLabels`) para não haver duas traduções
// divergentes do mesmo código — mantidos aqui como uma cópia deliberada, não um import do dashboard
// antigo, para não tocar esse arquivo (decisão registrada #3).
export const DASHBOARD_STATUS_LABELS: Record<string, string> = {
  // Quote (Orçamento) — src/lib/format.ts#statusLabels
  draft: 'Rascunho',
  sent: 'Enviado',
  approved: 'Aprovado',
  rejected: 'Rejeitado',
  cancelled: 'Cancelado',
  expired: 'Expirado',

  // SalesOrder (Pedido de Venda) — page.tsx#salesOrderStatusLabels
  open: 'Aberto',
  in_production: 'Em produção',
  completed: 'Concluído',

  // ProductionOrder.status — page.tsx#productionStatusLabels
  planned: 'Planejada',
  in_progress: 'Em execução',
  paused: 'Pausada',

  // Requisition.status — page.tsx#requisitionStatusLabels
  ordered: 'Pedido feito',

  // PurchaseOrder.status — page.tsx#purchaseOrderStatusLabels
  pending_approval: 'Aguardando aprovação',
  confirmed: 'Confirmado',
  partially_received: 'Recebido parcial',
  received: 'Recebido',

  // MaterialReservation.status
  reserved: 'Reservado',
  partial: 'Parcial',
  released: 'Liberado',
  consumed: 'Consumido',

  // MrpSuggestion.status / suggestionType
  pending: 'Pendente',
  accepted: 'Aceita',
  dismissed: 'Descartada',
  purchase: 'Compra',
  production: 'Produção',

  // BomRevision.status
  obsolete: 'Obsoleta',

  // StockMovement.type
  IN: 'Entrada',
  OUT: 'Saída',
  ADJUST: 'Ajuste',
  RESERVE: 'Reserva',
  RELEASE: 'Liberação',

  // ProductionOrder.priority
  low: 'Baixa',
  normal: 'Normal',
  high: 'Alta',
  urgent: 'Urgente',

  // Requisition.tipo (ADR-009)
  PRODUCAO: 'Produção',
  MANUTENCAO: 'Manutenção',
  ALMOXARIFADO: 'Almoxarifado',
  ENGENHARIA: 'Engenharia',
  SERVICOS: 'Serviços',
  OUTROS: 'Outros',

  // Requisition.originModule
  manual: 'Manual',
  production_order: 'Ordem de Produção',
  mrp: 'MRP',

  // User.role — page.tsx#roleLabels
  admin: 'Administrador',
  manager: 'Gerente',
  user: 'Usuário',
  viewer: 'Visualizador',
  comercial: 'Comercial',
  producao: 'Produção',
  compras: 'Compras',
  estoque: 'Estoque',
  financeiro: 'Financeiro',
}

/** Traduz se o valor bater com um código conhecido; devolve o valor original (ou "-") caso contrário. */
export function translateStatusLabel(value: unknown): string {
  if (typeof value !== 'string') return String(value ?? '-')
  return DASHBOARD_STATUS_LABELS[value] ?? value
}
