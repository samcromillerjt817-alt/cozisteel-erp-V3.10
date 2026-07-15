import { mrpCalculationService } from '@/app/services/mrp-calculation.service'
import { mrpRunRepository } from '@/app/repositories/mrp-run.repository'
import { numberingService } from '@/app/services/numbering.service'

/**
 * Orquestra uma execução do MRP (Fase 6, Subetapa 3, ADR-007): chama o motor de cálculo puro
 * (`mrp-calculation.service.ts`) exatamente uma vez, gera o número da execução e delega a gravação
 * transacional inteira a `mrp-run.repository.ts`. Não recalcula nada, não abre transação aqui, não
 * cria Requisição/Pedido de Compra/Ordem de Produção — só gera inteligência (ver ADR-007, seção
 * "Integração futura com o usuário").
 */
class MrpExecutionService {
  async run(userId: string) {
    const calculation = await mrpCalculationService.calculate()
    const number = await numberingService.getNextNumber('mrp')
    return mrpRunRepository.persist(number, userId, calculation)
  }

  async getById(id: string) {
    return mrpRunRepository.findByIdDetailed(id)
  }
}

export const mrpExecutionService = new MrpExecutionService()
