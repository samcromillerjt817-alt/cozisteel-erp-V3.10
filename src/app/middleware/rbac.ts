export type Role = 'admin' | 'manager' | 'user' | 'viewer'
export type Module = 'usuarios' | 'orcamentos' | 'produtos' | 'clientes' | 'categorias' | 'materiais' | 'sistema' | 'configuracoes' | 'sequencias' | 'auditoria' | 'dashboard' | 'fornecedores' | 'requisicoes' | 'producao'
export type Action = 'create' | 'read' | 'update' | 'delete' | 'manage' | 'export'
import { ForbiddenException } from '@/app/exceptions'

const PERMISSIONS: Record<Role, Record<Module, Action[]>> = {
  admin: {
    usuarios: ['create', 'read', 'update', 'delete', 'manage'],
    orcamentos: ['create', 'read', 'update', 'delete', 'manage', 'export'],
    produtos: ['create', 'read', 'update', 'delete', 'manage'],
    clientes: ['create', 'read', 'update', 'delete', 'manage'],
    categorias: ['create', 'read', 'update', 'delete', 'manage'],
    materiais: ['create', 'read', 'update', 'delete', 'manage'],
    sistema: ['read', 'update', 'manage'],
    configuracoes: ['read', 'update', 'manage'],
    sequencias: ['read', 'update', 'manage'],
    auditoria: ['read', 'manage'],
    dashboard: ['read'],
    fornecedores: ['create', 'read', 'update', 'delete', 'manage'],
    requisicoes: ['create', 'read', 'update', 'delete', 'manage', 'export'],
    producao: ['create', 'read', 'update', 'delete', 'manage', 'export'],
  },
  manager: {
    usuarios: ['read'],
    orcamentos: ['create', 'read', 'update', 'delete', 'export'],
    produtos: ['create', 'read', 'update', 'delete'],
    clientes: ['create', 'read', 'update', 'delete'],
    categorias: ['create', 'read', 'update'],
    materiais: ['create', 'read', 'update'],
    sistema: ['read'],
    configuracoes: ['read'],
    sequencias: ['read'],
    auditoria: [],
    dashboard: ['read'],
    fornecedores: ['create', 'read', 'update', 'delete'],
    requisicoes: ['create', 'read', 'update', 'delete', 'export'],
    producao: ['create', 'read', 'update', 'delete', 'export'],
  },
  user: {
    usuarios: ['read'],
    orcamentos: ['create', 'read', 'update'],
    produtos: ['read'],
    clientes: ['read'],
    categorias: ['read'],
    materiais: ['read'],
    sistema: [],
    configuracoes: [],
    sequencias: [],
    auditoria: [],
    dashboard: ['read'],
    fornecedores: ['read'],
    requisicoes: ['create', 'read', 'update'],
    producao: ['read'],
  },
  viewer: {
    usuarios: [],
    orcamentos: ['read'],
    produtos: ['read'],
    clientes: ['read'],
    categorias: ['read'],
    materiais: ['read'],
    sistema: [],
    configuracoes: [],
    sequencias: [],
    auditoria: [],
    dashboard: ['read'],
    fornecedores: ['read'],
    requisicoes: ['read'],
    producao: ['read'],
  },
}

export function hasPermission(role: string, module: Module, action: Action): boolean {
  const rolePerms = PERMISSIONS[role as Role]
  if (!rolePerms) return false
  const modulePerms = rolePerms[module]
  if (!modulePerms) return false
  return modulePerms.includes(action) || modulePerms.includes('manage')
}

export function requirePermission(role: string, module: Module, action: Action): void {
  if (!hasPermission(role, module, action)) {
    throw new ForbiddenException('Você não tem permissão para realizar esta ação')
  }
}