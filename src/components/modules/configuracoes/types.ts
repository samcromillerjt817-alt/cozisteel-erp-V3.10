// Módulo Configurações (Fase 11.5, Subetapa 11.5.9 — normalização final: 5 sub-abas no mesmo padrão).

export interface Sequence {
  id: string
  documentType: string
  prefix: string
  suffix: string
  nextNumber: number
  digits: number
  resetAnnual: boolean
  resetMonthly: boolean
}

export interface AuditEntry {
  id: string
  action: string
  module: string
  entityId: string
  details: string
  userName: string
  createdAt: string
}

export interface PatchLogEntry {
  id: string
  createdAt: string
  fromVersion: string
  toVersion: string
  title: string
  appliedVia: 'upload' | 'terminal'
  status: string
  user: { name: string } | null
}

export const AUDIT_MODULES = ['compras', 'estoque', 'fornecedores', 'materiais', 'orcamentos', 'producao', 'produtos', 'requisicoes', 'sequencias'] as const
export const AUDIT_ACTIONS = ['CREATE', 'UPDATE', 'DELETE', 'PATCH'] as const
