import { invoiceRepository } from '@/app/repositories/invoice.repository'
import { salesOrderRepository } from '@/app/repositories/sales-order.repository'
import { numberingService } from '@/app/services/numbering.service'
import { auditService } from '@/app/services/audit.service'
import { resolveDueDate } from '@/lib/payment-terms'
import { domainEvents, DOMAIN_EVENTS } from '@/lib/domain-events'
import type { FaturaEmitidaPayload } from '@/lib/domain-events'
import { NotFoundException, BadRequestException } from '@/app/exceptions'

interface SalesOrderForInvoicing {
  id: string
  number: string
  status: string
  paymentTerms: string
}

/**
 * Fase 12 (ADR-016, Subetapa 1/4) — Faturamento. Decisão pendente #1 resolvida: `Invoice` é uma
 * entidade própria, não um campo/estado em `SalesOrder` — um mesmo Pedido de Venda pode gerar mais
 * de 1 Invoice (faturamento parcial). `amount` é sempre explícito na chamada (nunca herdado
 * automaticamente de `SalesOrder.total`) para não fechar essa porta já nesta subetapa fundacional,
 * mesmo sem nenhuma tela ainda decidindo como o usuário informaria um valor parcial. Vencimento do
 * título gerado é lido de `SalesOrder.paymentTerms` (mesmo vocabulário `PAYMENT_TERMS_OPTIONS` do
 * Comercial, via `resolveDueDate()`) — nunca um prazo fixo inventado pelo Financeiro.
 */
class InvoiceService {
  async createFromSalesOrder(salesOrderId: string, amount: number, userId: string) {
    const salesOrder = (await salesOrderRepository.findById(salesOrderId)) as SalesOrderForInvoicing | null
    if (!salesOrder) throw new NotFoundException('Pedido de venda não encontrado')
    if (salesOrder.status === 'cancelled') {
      throw new BadRequestException('Não é possível faturar um pedido de venda cancelado')
    }
    if (amount <= 0) throw new BadRequestException('Valor da fatura deve ser maior que zero')

    const number = await numberingService.getNextNumber('nota_fiscal')
    const invoice = (await invoiceRepository.createDetailed({
      number,
      salesOrderId,
      total: amount,
      issuedAt: new Date(),
      userId,
    })) as { id: string; number: string }

    await auditService.log({
      userId,
      action: 'CREATE',
      module: 'financeiro',
      entityId: invoice.id,
      entityName: invoice.number,
      details: `Fatura ${invoice.number} emitida para o pedido de venda ${salesOrder.number} (${amount.toFixed(2)})`,
    })

    // Emitido depois que a fatura já foi persistida — notificação de um fato que já aconteceu, sem
    // consumidor bloqueante (ADR-003). Se o handler de Contas a Receber falhar, a fatura em si
    // continua existindo — geração de título é consequência, nunca condição do faturamento em si
    // (mesmo princípio de independência de módulo do ADR-016 Parte 4.1).
    await domainEvents.publish<FaturaEmitidaPayload, void>(DOMAIN_EVENTS.FATURA_EMITIDA, {
      invoiceId: invoice.id,
      invoiceNumber: invoice.number,
      salesOrderId,
      total: amount,
      dueDate: resolveDueDate(salesOrder.paymentTerms),
      userId,
    })

    return invoice
  }
}

export const invoiceService = new InvoiceService()
