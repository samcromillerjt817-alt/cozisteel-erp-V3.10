/**
 * Fonte única de verdade para cor de status em todo o sistema (Fase 13, Lote 2, ADR-015).
 * Substitui `statusColors` (format.ts) e as 2 paletas hardcoded que existiam duplicadas
 * (movimentação de estoque e histórico de patch) por um único conjunto de 8 categorias
 * semânticas + um mapa por domínio de qual status cai em qual categoria.
 */

export type StatusCategory =
  | 'pending'
  | 'info'
  | 'success'
  | 'error'
  | 'neutral'
  | 'warning'
  | 'completed'
  | 'cancelled'

export const statusCategoryClasses: Record<StatusCategory, string> = {
  pending: 'bg-yellow-600/20 text-yellow-400 border-yellow-600/30',
  info: 'bg-blue-600/20 text-blue-400 border-blue-600/30',
  success: 'bg-emerald-600/20 text-emerald-400 border-emerald-600/30',
  error: 'bg-red-600/20 text-red-400 border-red-600/30',
  neutral: 'bg-gray-600/20 text-gray-400 border-gray-600/30',
  warning: 'bg-orange-600/20 text-orange-400 border-orange-600/30',
  completed: 'bg-emerald-600/20 text-emerald-400 border-emerald-600/30',
  cancelled: 'bg-gray-600/20 text-gray-400 border-gray-600/30',
}

export type StatusDomain =
  | 'quote'
  | 'requisition'
  | 'purchaseOrder'
  | 'productionOrder'
  | 'salesOrder'
  | 'stockMovement'
  | 'patch'
  | 'userStatus'
  | 'bom'
  | 'financeiro'

export const domainStatusCategory: Record<StatusDomain, Record<string, StatusCategory>> = {
  quote: {
    draft: 'pending', sent: 'info', approved: 'success', rejected: 'error', cancelled: 'cancelled', expired: 'warning',
  },
  requisition: {
    draft: 'pending', sent: 'info', approved: 'success', ordered: 'completed', cancelled: 'cancelled',
  },
  purchaseOrder: {
    // Estados completos da máquina de estados (ADR-010): pending_approval/approved já existem no
    // backend desde a Fase 8, mesmo que ainda não tenham tradução no mapa de labels do frontend
    // (achado catalogado à parte no ADR-015 — não corrigido nesta rodada, fora do escopo de cor).
    draft: 'pending', pending_approval: 'pending', approved: 'success', sent: 'info', confirmed: 'info',
    partially_received: 'warning', received: 'completed', cancelled: 'cancelled',
  },
  productionOrder: {
    planned: 'pending', in_progress: 'info', paused: 'warning', completed: 'completed', cancelled: 'cancelled',
  },
  salesOrder: {
    open: 'pending', in_production: 'info', completed: 'completed', cancelled: 'cancelled',
  },
  stockMovement: {
    IN: 'success', OUT: 'error', ADJUST: 'warning',
  },
  patch: {
    applying: 'pending', success: 'success', failed: 'error', rolled_back: 'warning',
  },
  // Hardening pós-11.5, Prioridade 4 — fecha o único badge de status reimplementado à mão encontrado
  // na auditoria de consolidação (Ativo/Inativo em Usuários, cores hardcoded que já reproduziam
  // exatamente `success`/`error`).
  userStatus: {
    active: 'success', inactive: 'cancelled',
  },
  // Nenhuma tela ainda renderiza status de BOM via `StatusBadge` (não há UI de BOM nesta fase) —
  // entrada adicionada por completude/future-proofing (achado da auditoria), não corrige um bug visível.
  bom: {
    draft: 'pending', released: 'success', obsolete: 'cancelled',
  },
  // Fase 12 (Financeiro), Subetapa 7-UI — mesmo domínio de status para Contas a Pagar e a Receber
  // (os dois modelos usam exatamente o mesmo vocabulário, `financial-account.service.ts`).
  financeiro: {
    open: 'pending', partially_paid: 'warning', paid: 'success', cancelled: 'cancelled',
  },
}

export function statusCategoryFor(domain: StatusDomain, status: string): StatusCategory {
  return domainStatusCategory[domain][status] || 'neutral'
}
