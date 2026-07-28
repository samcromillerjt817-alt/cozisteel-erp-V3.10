import { approvalRuleRepository } from '@/app/repositories/approval-rule.repository'
import { approvalRecordRepository } from '@/app/repositories/approval-record.repository'
import { NotFoundException, BadRequestException } from '@/app/exceptions'
import type { ApprovalRuleDto } from '@/app/dto'

export interface ApprovalOutcome {
  complete: boolean
  approvalsGiven: number
  approvalsNeeded: number
  ruleId: string
}

interface EffectiveRule {
  id: string
  approverRole: string | null
  requiredApprovals: number
  allowSelfApproval: boolean
}

/**
 * Motor de alçada (ADR-023, item 5, Decisão #4) — o único jeito de uma aprovação de Orçamento/
 * Requisição/Pedido de Compra ser efetivada é passar por `recordApproval()` aqui, mesmo quando
 * nenhuma `ApprovalRule` foi cadastrada ainda. Enquanto isso, a POLÍTICA IMPLÍCITA abaixo preserva
 * exatamente o comportamento de antes desta mudança (1 aprovação, sem faixa de valor, qualquer
 * aprovador com permissão de módulo aprova, autoaprovação permitida) — "ativar uma política inicial
 * simples que preserva o comportamento atual... mas já passando pelo motor novo, não por um atalho
 * paralelo" (decisão do usuário, ADR-023 Parte 5). Quando os valores reais da empresa chegarem, é só
 * cadastrar `ApprovalRule`s — nenhuma mudança de código deveria ser necessária.
 */
const IMPLICIT_POLICY: EffectiveRule = {
  id: 'implicit-default',
  approverRole: null,
  requiredApprovals: 1,
  allowSelfApproval: true,
}

class ApprovalService {
  /** Primeira regra ATIVA cuja faixa de valor cobre `value`, na ordem configurada — ou a política
   * implícita se nenhuma regra existir para este tipo de documento. */
  private async resolveRule(documentType: string, value: number): Promise<EffectiveRule> {
    const candidates = (await approvalRuleRepository.findApplicable(documentType, value)) as EffectiveRule[]
    return candidates[0] ?? IMPLICIT_POLICY
  }

  /**
   * Registra o voto de aprovação de `userId` contra `documentId`. Não decide sozinho quando a
   * transição de status deve realmente acontecer — devolve `complete` pro Service de origem decidir
   * (só ele sabe os efeitos colaterais de cada domínio, ex.: gerar Ordem de Produção no Orçamento).
   */
  async recordApproval(
    documentType: string,
    documentId: string,
    value: number,
    userId: string,
    creatorUserId: string,
    userRole: string
  ): Promise<ApprovalOutcome> {
    const rule = await this.resolveRule(documentType, value)

    if (!rule.allowSelfApproval && userId === creatorUserId) {
      throw new BadRequestException('Autoaprovação não é permitida por esta regra — outro usuário precisa aprovar')
    }
    if (rule.approverRole && rule.approverRole !== userRole) {
      throw new BadRequestException(`Esta aprovação exige o perfil "${rule.approverRole}"`)
    }

    if (rule.id !== IMPLICIT_POLICY.id) {
      const existing = await approvalRecordRepository.findByRuleDocumentUser(rule.id, documentId, userId)
      if (existing) throw new BadRequestException('Você já aprovou este documento')

      await approvalRecordRepository.create({ approvalRuleId: rule.id, documentType, documentId, userId })
      const approvalsGiven = await approvalRecordRepository.countByRuleAndDocument(rule.id, documentId)
      return { complete: approvalsGiven >= rule.requiredApprovals, approvalsGiven, approvalsNeeded: rule.requiredApprovals, ruleId: rule.id }
    }

    // Política implícita (nenhuma ApprovalRule cadastrada pra este tipo): 1 aprovação já basta,
    // sem gravar ApprovalRecord (nada pra contar contra — não existe uma regra real ainda).
    return { complete: true, approvalsGiven: 1, approvalsNeeded: 1, ruleId: IMPLICIT_POLICY.id }
  }

  async listApprovals(documentType: string, documentId: string) {
    return approvalRecordRepository.findManyByDocument(documentType, documentId)
  }

  // ── CRUD de regras (gestão administrativa) ──

  async listRules() {
    return approvalRuleRepository.findManyAll()
  }

  async createRule(data: ApprovalRuleDto) {
    if (data.minValue != null && data.maxValue != null && data.minValue > data.maxValue) {
      throw new BadRequestException('O valor mínimo não pode ser maior que o valor máximo')
    }
    return approvalRuleRepository.create(data)
  }

  async updateRule(id: string, data: ApprovalRuleDto) {
    const existing = await approvalRuleRepository.findById(id)
    if (!existing) throw new NotFoundException('Regra de alçada não encontrada')
    if (data.minValue != null && data.maxValue != null && data.minValue > data.maxValue) {
      throw new BadRequestException('O valor mínimo não pode ser maior que o valor máximo')
    }
    return approvalRuleRepository.update(id, data)
  }

  async deleteRule(id: string) {
    const existing = await approvalRuleRepository.findById(id)
    if (!existing) throw new NotFoundException('Regra de alçada não encontrada')
    await approvalRuleRepository.delete(id)
    return { success: true }
  }
}

export const approvalService = new ApprovalService()
