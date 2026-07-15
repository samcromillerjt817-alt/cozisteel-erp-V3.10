import { getRolePermissions, type Module, type Action } from '@/app/middleware/rbac'
import { Badge } from '@/components/ui/badge'

const MODULE_LABELS: Record<Module, string> = {
  usuarios: 'Usuários', orcamentos: 'Orçamentos', produtos: 'Produtos', clientes: 'Clientes',
  categorias: 'Categorias', materiais: 'Materiais', sistema: 'Sistema', configuracoes: 'Configurações',
  sequencias: 'Sequências', auditoria: 'Auditoria', dashboard: 'Dashboard', fornecedores: 'Fornecedores',
  requisicoes: 'Requisições', producao: 'Produção', estoque: 'Estoque', relatorios: 'Relatórios',
  compras: 'Compras', financeiro: 'Financeiro',
}

const ACTION_LABELS: Record<Action, string> = {
  create: 'Criar', read: 'Ver', update: 'Editar', delete: 'Excluir', manage: 'Gerenciar', export: 'Exportar',
}

interface RolePermissionsPreviewProps {
  role: string
}

/**
 * Prévia somente-leitura do que um Papel libera (Hardening pós-11.5, Prioridade 3) — lê
 * `getRolePermissions()` (`rbac.ts`, nova função de consulta, sem nenhuma mudança na lógica de
 * autorização) e mostra módulo por módulo. Fecha o achado da auditoria de que o RBAC já é sofisticado
 * (9 Papéis, matriz por módulo e ação) mas invisível para quem administra: antes, o admin escolhia um
 * Papel no `Select` sem nenhuma pista do que ele de fato concede.
 */
export function RolePermissionsPreview({ role }: RolePermissionsPreviewProps) {
  const permissions = getRolePermissions(role)
  const entries = (Object.entries(permissions) as [Module, Action[]][])
    .filter(([, actions]) => actions.length > 0)

  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">Este perfil não tem acesso a nenhum módulo.</p>
  }

  return (
    <div className="space-y-1.5 rounded-md border p-3 max-h-64 overflow-y-auto">
      {entries.map(([module, actions]) => (
        <div key={module} className="flex items-start justify-between gap-3 text-sm">
          <span className="text-muted-foreground shrink-0">{MODULE_LABELS[module]}</span>
          <div className="flex flex-wrap gap-1 justify-end">
            {actions.map((action) => (
              <Badge key={action} variant="outline" className="text-[10px] font-normal">
                {ACTION_LABELS[action]}
              </Badge>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
