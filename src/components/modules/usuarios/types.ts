// Módulo Usuários (Fase 11.5, Subetapa 11.7 — propagação do template).

export interface UserRecord {
  id: string
  username: string
  name: string
  role: string
  email: string
  active: boolean
  lastLogin: string
  createdAt: string
}

export interface UserFormData {
  name: string
  username: string
  password: string
  email: string
  role: string
  active: boolean
}

export const EMPTY_USER_FORM: UserFormData = {
  name: '', username: '', password: '', email: '', role: 'user', active: true,
}

export function userToFormData(user: UserRecord): UserFormData {
  return {
    name: user.name || '',
    username: user.username || '',
    password: '', // nunca preenchido ao editar — deixar vazio mantém a senha atual (regra já existente do backend)
    email: user.email || '',
    role: user.role || 'user',
    active: user.active,
  }
}

export const ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: 'admin', label: 'Administrador' },
  { value: 'manager', label: 'Gerente' },
  { value: 'user', label: 'Usuario' },
  { value: 'viewer', label: 'Visualizador' },
  { value: 'comercial', label: 'Comercial' },
  { value: 'producao', label: 'Produção' },
  { value: 'compras', label: 'Compras' },
  { value: 'estoque', label: 'Estoque' },
  { value: 'financeiro', label: 'Financeiro' },
]
