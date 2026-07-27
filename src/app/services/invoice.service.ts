import { db } from '@/lib/db'
import { invoiceRepository } from '@/app/repositories/invoice.repository'
import { salesOrderRepository } from '@/app/repositories/sales-order.repository'
import { numberingService } from '@/app/services/numbering.service'
import { auditService } from '@/app/services/audit.service'
import { financialAccountService } from '@/app/services/financial-account.service'
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

interface InvoiceableItem {
  id: string
  description: string
  code: string
  quantity: number
  unitPrice: number
  invoiceItems: { quantity: number }[]
}

export interface InvoiceItemInput {
  salesOrderItemId: string
  quantity: number
}

const EPSILON = 1e-9

/**
 * Fase 12 (ADR-016, Subetapa 1/4) — Faturamento. `Invoice` é uma entidade própria, não um campo/
 * estado em `SalesOrder` — um mesmo Pedido de Venda pode gerar mais de 1 Invoice (faturamento
 * parcial). Vencimento do título gerado é lido de `SalesOrder.paymentTerms` (mesmo vocabulário
 * `PAYMENT_TERMS_OPTIONS` do Comercial, via `resolveDueDate()`) — nunca um prazo fixo inventado pelo
 * Financeiro.
 *
 * ADR-023 (Decisão #2, 2026-07-27) — ligado à UI pela primeira vez: `createFromSalesOrder` passou a
 * receber quantidade POR ITEM (nunca mais um valor agregado à parte), o que é o que realmente permite
 * faturamento parcial de verdade (antes só o modelo suportava, a assinatura do método não). Preço
 * unitário é sempre o do próprio `SalesOrderItem` no momento da emissão — nunca editável nesta tela,
 * só a quantidade.
 */
class InvoiceService {
  /** Saldo faturável por item — usado tanto para pré-selecionar a tela (decisão do usuário: abre com
   * tudo selecionado) quanto para validar antes de faturar. */
  async getInvoiceableBalance(salesOrderId: string) {
    const salesOrder = (await salesOrderRepository.findByIdWithInvoiceableItems(salesOrderId)) as {
      id: string
      items: InvoiceableItem[]
    } | null
    if (!salesOrder) throw new NotFoundException('Pedido de venda não encontrado')

    return salesOrder.items.map((item) => {
      const invoiced = item.invoiceItems.reduce((sum, i) => sum + i.quantity, 0)
      return {
        salesOrderItemId: item.id,
        description: item.description || item.code,
        unitPrice: item.unitPrice,
        quantityOrdered: item.quantity,
        quantityInvoiced: invoiced,
        quantityRemaining: Math.max(0, item.quantity - invoiced),
      }
    })
  }

  async list(salesOrderId: string) {
    return invoiceRepository.findManyBySalesOrder(salesOrderId)
  }

  async createFromSalesOrder(salesOrderId: string, itemsInput: InvoiceItemInput[], notes: string, userId: string) {
    const salesOrder = (await salesOrderRepository.findById(salesOrderId)) as SalesOrderForInvoicing | null
    if (!salesOrder) throw new NotFoundException('Pedido de venda não encontrado')
    if (salesOrder.status === 'cancelled') {
      throw new BadRequestException('Não é possível faturar um pedido de venda cancelado')
    }

    const requested = itemsInput.filter((i) => i.quantity > EPSILON)
    if (requested.length === 0) {
      throw new BadRequestException('Informe ao menos um item com quantidade a faturar')
    }

    const number = await numberingService.getNextNumber('nota_fiscal')

    // Checagem de saldo e criação na MESMA transação — fecha a janela entre "quanto já foi
    // faturado" e "criar a fatura", para clique duplo ou reenvio de requisição nunca conseguirem
    // faturar mais do que o saldo real do pedido (ADR-023, Decisão #2, regra de idempotência).
    const invoice = await db.$transaction(async (tx) => {
      const lineItems: { salesOrderItemId: string; quantity: number; unitPrice: number; total: number }[] = []
      let total = 0

      for (const { salesOrderItemId, quantity } of requested) {
        const soItem = await tx.salesOrderItem.findUnique({
          where: { id: salesOrderItemId },
          include: {
            invoiceItems: { where: { invoice: { status: { not: 'cancelled' } } }, select: { quantity: true } },
          },
        })
        if (!soItem || soItem.salesOrderId !== salesOrderId) {
          throw new BadRequestException('Item não pertence a este pedido de venda')
        }
        const alreadyInvoiced = soItem.invoiceItems.reduce((sum, i) => sum + i.quantity, 0)
        const remaining = soItem.quantity - alreadyInvoiced
        if (quantity > remaining + EPSILON) {
          throw new BadRequestException(
            `Item "${soItem.description || soItem.code}": quantidade a faturar (${quantity}) excede o saldo restante (${remaining})`
          )
        }
        const lineTotal = quantity * soItem.unitPrice
        lineItems.push({ salesOrderItemId, quantity, unitPrice: soItem.unitPrice, total: lineTotal })
        total += lineTotal
      }

      return tx.invoice.create({
        data: {
          number,
          salesOrderId,
          status: 'issued',
          total,
          issuedAt: new Date(),
          notes: notes || '',
          userId,
          items: { create: lineItems },
        },
        include: { items: true },
      })
    })

    await auditService.log({
      userId,
      action: 'CREATE',
      module: 'financeiro',
      entityId: invoice.id,
      entityName: invoice.number,
      details: `Fatura ${invoice.number} emitida para o pedido de venda ${salesOrder.number} (${invoice.total.toFixed(2)}, ${invoice.items.length} ${invoice.items.length === 1 ? 'item' : 'itens'})`,
    })

    // Emitido depois que a fatura já foi persistida — notificação de um fato que já aconteceu, sem
    // consumidor bloqueante (ADR-003). Se o handler de Contas a Receber falhar, a fatura em si
    // continua existindo — geração de título é consequência, nunca condição do faturamento em si
    // (mesmo princípio de independência de módulo do ADR-016 Parte 4.1).
    await domainEvents.publish<FaturaEmitidaPayload, void>(DOMAIN_EVENTS.FATURA_EMITIDA, {
      invoiceId: invoice.id,
      invoiceNumber: invoice.number,
      salesOrderId,
      total: invoice.total,
      dueDate: resolveDueDate(salesOrder.paymentTerms),
      userId,
    })

    return invoice
  }

  /**
   * ADR-023 (Decisão #1, cancelamento de fatura) — só permitido enquanto a Conta a Receber ainda não
   * teve nenhum recebimento registrado; reaproveita a MESMA guarda que `cancelReceivable` já aplica
   * (`status === 'open'`), em vez de duplicar a regra aqui. Depois de um recebimento, a única saída é
   * o estorno financeiro (fora de escopo desta rodada) — cancelar aqui simplesmente falha com a
   * mensagem de negócio que `cancelReceivable` já produz.
   */
  async cancel(invoiceId: string, userId: string) {
    const invoice = (await invoiceRepository.findByIdDetailed(invoiceId)) as {
      id: string
      number: string
      status: string
      accountReceivable: { id: string } | null
    } | null
    if (!invoice) throw new NotFoundException('Fatura não encontrada')
    if (invoice.status === 'cancelled') {
      throw new BadRequestException('Esta fatura já está cancelada')
    }

    if (invoice.accountReceivable) {
      await financialAccountService.cancelReceivable(invoice.accountReceivable.id, userId)
    }

    const updated = await invoiceRepository.update(invoiceId, { status: 'cancelled', cancelledAt: new Date() })

    await auditService.log({
      userId,
      action: 'PATCH',
      module: 'financeiro',
      entityId: invoice.id,
      entityName: invoice.number,
      details: `Fatura ${invoice.number} cancelada`,
      beforeValue: { status: invoice.status },
      afterValue: { status: 'cancelled' },
    })

    return updated
  }
}

export const invoiceService = new InvoiceService()
