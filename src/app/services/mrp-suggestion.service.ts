import { mrpSuggestionRepository } from '@/app/repositories/mrp-suggestion.repository'
import { requisitionService } from '@/app/services/requisition.service'
import { NotFoundException, BadRequestException } from '@/app/exceptions'

interface MrpSuggestionRecord {
  id: string
  status: string
  suggestionType: string
  materialId: string | null
  supplierId: string | null
  quantityShortfall: number
  material: { name: string; unit: string } | null
}

/**
 * Aprovação de sugestões do MRP (Fase 7, ADR-009) — o único jeito de uma `MrpSuggestion` virar uma
 * Requisição de verdade é uma ação humana explícita aqui. Nada neste serviço roda sozinho: o MRP
 * (Fase 6) continua sendo só inteligência, nunca um executor automático.
 */
class MrpSuggestionService {
  async approve(id: string, userId: string) {
    const suggestion = (await mrpSuggestionRepository.findByIdWithMaterial(id)) as MrpSuggestionRecord | null
    if (!suggestion) throw new NotFoundException('Sugestão do MRP não encontrada')
    if (suggestion.status !== 'pending') {
      throw new BadRequestException(`Esta sugestão já foi tratada (status atual: "${suggestion.status}")`)
    }
    if (suggestion.suggestionType !== 'purchase') {
      throw new BadRequestException('Só sugestões de compra podem virar Requisição nesta fase — sugestões de produção ainda não têm um destino automatizado')
    }

    // createFromMrpSuggestion já grava MrpSuggestion.status = "accepted" na mesma transação da criação.
    return requisitionService.createFromMrpSuggestion(suggestion, userId)
  }

  async dismiss(id: string, userId: string) {
    const suggestion = (await mrpSuggestionRepository.findById(id)) as { status: string } | null
    if (!suggestion) throw new NotFoundException('Sugestão do MRP não encontrada')
    if (suggestion.status !== 'pending') {
      throw new BadRequestException(`Esta sugestão já foi tratada (status atual: "${suggestion.status}")`)
    }
    return mrpSuggestionRepository.update(id, { status: 'dismissed' })
  }
}

export const mrpSuggestionService = new MrpSuggestionService()
