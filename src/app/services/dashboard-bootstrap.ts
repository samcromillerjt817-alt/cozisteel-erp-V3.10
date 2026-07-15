// Bootstrap central do Dashboard (Fase 11, ADR-017) — importado só por efeito colateral pelas rotas
// (`/api/dashboard/[profile]`) antes de chamar `getDashboard()`. Cada arquivo de widgets de domínio
// se registra no catálogo/registro ao ser carregado aqui; uma nova Subetapa (3-6) só precisa adicionar
// uma linha nova neste arquivo, nunca tocar a rota. Evita import circular com `dashboard-widgets.
// service.ts` (os arquivos de domínio importam `registerWidget` de lá; este arquivo importa os
// arquivos de domínio, nunca o contrário).

import '@/app/services/dashboard-widgets-comercial'
import '@/app/services/dashboard-widgets-producao'
import '@/app/services/dashboard-widgets-estoque'
import '@/app/services/dashboard-widgets-compras'
import '@/app/services/dashboard-widgets-administrativo'
import '@/app/services/dashboard-widgets-financeiro'
