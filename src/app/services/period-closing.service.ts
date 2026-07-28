import { periodClosingRepository } from '@/app/repositories/period-closing.repository'
import { auditService } from '@/app/services/audit.service'
import { NotFoundException, BadRequestException } from '@/app/exceptions'

/** "YYYY-MM" a partir de uma data — mesmo formato usado como chave única de `PeriodClosing.period`. */
function periodOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

/**
 * ADR-023 (item 6, Decisão #5) — Fechamento Mensal por COMPETÊNCIA, nunca por vencimento/pagamento
 * (os três conceitos são diferentes: vencimento é obrigação prevista, pagamento é caixa realizado,
 * competência é o período econômico/contábil do lançamento). `assertPeriodOpen` é chamado pelos 4
 * métodos de mutação do Financeiro (`registerPayment`/`registerReceipt`/`cancelPayable`/
 * `cancelReceivable`) e pelas 2 criações de título — nenhum atalho paralelo.
 */
class PeriodClosingService {
  async isPeriodClosed(period: string): Promise<boolean> {
    const closing = await periodClosingRepository.findByPeriod(period)
    return !!closing && closing.status === 'closed'
  }

  async assertPeriodOpen(date: Date, action = 'esta operação') {
    const period = periodOf(date)
    if (await this.isPeriodClosed(period)) {
      throw new BadRequestException(`Não é possível realizar ${action}: a competência ${period} está fechada. Reabra o período antes de continuar.`)
    }
  }

  async list() {
    return periodClosingRepository.findManyAll()
  }

  async close(period: string, userId: string, notes: string) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) {
      throw new BadRequestException('Período inválido — use o formato AAAA-MM')
    }
    const existing = await periodClosingRepository.findByPeriod(period)
    if (existing && existing.status === 'closed') {
      throw new BadRequestException(`A competência ${period} já está fechada`)
    }

    const closing = existing
      ? await periodClosingRepository.updateDetailed(existing.id, {
          status: 'closed', closedAt: new Date(), closedById: userId, notes,
          reopenedAt: null, reopenedById: null,
        })
      : await periodClosingRepository.createClosed({ period, status: 'closed', closedById: userId, notes })

    await auditService.log({
      userId,
      action: 'CREATE',
      module: 'financeiro',
      entityId: closing.id,
      entityName: period,
      details: `Competência ${period} fechada`,
    })
    return closing
  }

  async reopen(period: string, userId: string, reason: string) {
    const existing = await periodClosingRepository.findByPeriod(period)
    if (!existing) throw new NotFoundException(`A competência ${period} nunca foi fechada`)
    if (existing.status !== 'closed') {
      throw new BadRequestException(`A competência ${period} já está reaberta`)
    }

    const updated = await periodClosingRepository.updateDetailed(existing.id, {
      status: 'reopened', reopenedAt: new Date(), reopenedById: userId, notes: reason,
    })

    await auditService.log({
      userId,
      action: 'PATCH',
      module: 'financeiro',
      entityId: existing.id,
      entityName: period,
      details: `Competência ${period} reaberta — motivo: ${reason}`,
    })
    return updated
  }
}

export const periodClosingService = new PeriodClosingService()
