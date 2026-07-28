import type { Role } from '@/app/middleware/rbac'
import { DASHBOARD_PROFILES, type DashboardProfile } from '@/app/services/dashboard-types'

// Composição de perfis do Dashboard sobre os Roles já existentes (ADR-017 §2, decisão #1 do usuário,
// 2026-07-10) — nenhum Role novo, nenhuma alteração em `rbac.ts`. Esta tabela vive só na camada de
// Dashboard; o modelo de permissões existente permanece 100% preservado.
const PROFILE_ACCESS: Record<DashboardProfile, Role[]> = {
  // ADR-024 (Centro de Operações) — home de todo mundo, nenhum Role de fora: os 9 papéis existentes,
  // igual à lista completa de `Role` em rbac.ts (sem viewer excluído de propósito — é leitura, mesmo
  // um perfil só-leitura se beneficia de ver o pipeline geral).
  'centro-operacoes': ['admin', 'manager', 'user', 'viewer', 'comercial', 'producao', 'compras', 'estoque', 'financeiro'],
  diretoria: ['admin', 'manager'],
  comercial: ['comercial', 'admin', 'manager'],
  compras: ['compras', 'admin', 'manager'],
  producao: ['producao', 'admin', 'manager'],
  estoque: ['estoque', 'admin', 'manager'],
  pcp: ['producao', 'admin', 'manager'],
  administrativo: ['admin'],
  financeiro: ['financeiro', 'admin', 'manager'],
}

export function canAccessProfile(role: string, profile: DashboardProfile): boolean {
  return PROFILE_ACCESS[profile].includes(role as Role)
}

export function getAccessibleProfiles(role: string): DashboardProfile[] {
  return DASHBOARD_PROFILES.filter((profile) => canAccessProfile(role, profile))
}
