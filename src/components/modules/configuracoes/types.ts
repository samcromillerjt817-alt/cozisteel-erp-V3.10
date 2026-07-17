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

export interface PatchLogFile {
  filename: string
  sizeBytes: number
  modifiedAt: string
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

export const AUDIT_MODULES = ['compras', 'estoque', 'fornecedores', 'materiais', 'orcamentos', 'producao', 'produtos', 'requisicoes', 'sequencias', 'sistema'] as const
export const AUDIT_ACTIONS = ['CREATE', 'UPDATE', 'DELETE', 'PATCH', 'CORRECAO', 'CONSULTA'] as const

// ── Administração do Sistema (ADR-021) ──────────────────────────────────

export interface DiskSpaceInfo {
  totalBytes: number
  usedBytes: number
  availableBytes: number
  usedPercent: number
}

export interface Pm2ProcessInfo {
  name: string
  pid: number
  status: string
  restarts: number
  uptimeMs: number
  memoryBytes: number
  cpuPercent: number
}

export interface StuckPatchInfo {
  stuck: boolean
  state?: string
  message?: string
  ageMinutes?: number
  pid?: number
  processAlive?: boolean
}

export interface SystemDiagnostics {
  databaseSizeBytes: number | null
  diskSpace: DiskSpaceInfo | null
  pm2: Pm2ProcessInfo[] | null
  stuckPatch: StuckPatchInfo
}

export interface AdminQueryResult {
  rows: Record<string, unknown>[]
  truncated: boolean
}

export type RecipeId = 'unstick-patch-status' | 'reconcile-patch-log' | 'recalculate-batch-cost'

export interface RecipeDefinition {
  id: RecipeId
  name: string
  description: string
}

export interface OrphanedBackup {
  backupTar: string
  timestamp: string
  fromVersionInBackup: string | null
}

export interface ProductBatchCostSnapshot {
  id: string
  batchNumber: string
  materialCost: number | null
  laborCost: number | null
  overheadCost: number | null
}
