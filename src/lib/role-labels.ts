// Rótulos em português dos 9 Roles do RBAC (`src/app/middleware/rbac.ts`) — extraído de `page.tsx`
// (Fase 11.5, Subetapa 11.5.7) para ser compartilhado entre o rodapé da sidebar (badge de Role do
// usuário logado) e o módulo Usuários (coluna "Perfil" da tabela + select do formulário).
export const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador',
  manager: 'Gerente',
  user: 'Usuario',
  viewer: 'Visualizador',
  comercial: 'Comercial',
  producao: 'Produção',
  compras: 'Compras',
  estoque: 'Estoque',
  financeiro: 'Financeiro',
}
