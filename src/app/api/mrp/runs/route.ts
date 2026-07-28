import { requireModulePermission, created, handleRouteError } from '@/lib/api-utils'
import { mrpExecutionService } from '@/app/services/mrp-execution.service'

/**
 * ADR-023 (item 3, "completar a exposição do MRP") — primeira rota de API que o motor de MRP
 * (Fase 6, ADR-007) já teria desde então: dispara uma execução, grava `MrpRun`/`MrpSuggestion` via
 * `mrpExecutionService.run()`. Continua 100% humano-gated — nenhuma Requisição/Ordem de Produção
 * nasce aqui, só a sugestão.
 */
export async function POST() {
  try {
    const user = await requireModulePermission('producao', 'update')
    const run = await mrpExecutionService.run(user.id)
    return created(run)
  } catch (error) {
    return handleRouteError(error, 'Erro ao executar o MRP')
  }
}
