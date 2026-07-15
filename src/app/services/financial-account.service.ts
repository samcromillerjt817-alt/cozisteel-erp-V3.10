import { accountPayableRepository } from '@/app/repositories/account-payable.repository'
import { accountReceivableRepository } from '@/app/repositories/account-receivable.repository'
import { purchaseOrderRepository } from '@/app/repositories/purchase-order.repository'
import { numberingService } from '@/app/services/numbering.service'
import { auditService } from '@/app/services/audit.service'
import { resolveDueDate } from '@/lib/payment-terms'
import { NotFoundException, BadRequestException } from '@/app/exceptions'

interface PayableRecord {
  id: string
  number: string
  amount: number
  status: string
  payments: Array<{ amount: number }>
}

interface ReceivableRecord {
  id: string
  number: string
  amount: number
  status: string
  receipts: Array<{ amount: number }>
}

/**
 * Fase 12 (ADR-016, Subetapa 1/3/4) — CRUD + baixa de Contas a Pagar/Receber, um único Service para
 * os dois lados (mesmo agrupamento do desenho original do ADR-016 Parte 4.2). Nunca chamado direto
 * de uma rota nesta subetapa (sem UI ainda, RBAC/rotas só na Subetapa 7) — só pelos handlers de
 * Domain Events (`register-domain-event-handlers.ts`) e, na Subetapa 4, pela `InvoiceService`.
 */
interface ListAccountsInput {
  status: string
  search: string
  page: number
  limit: number
}

class FinancialAccountService {
  // ══════════════════════════════════════════════════════════════
  // CONTAS A PAGAR
  // ══════════════════════════════════════════════════════════════

  async listPayables({ status, search, page, limit }: ListAccountsInput) {
    const where: Record<string, unknown> = {}
    if (status) where.status = status
    if (search) where.number = { contains: search }

    const { data, total } = await accountPayableRepository.findManyPaginated(where, (page - 1) * limit, limit)
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) }
  }

  async getPayableById(id: string) {
    const account = await accountPayableRepository.findByIdDetailed(id)
    if (!account) throw new NotFoundException('Título a pagar não encontrado')
    return account
  }

  /**
   * Gera (no primeiro recebimento) ou atualiza (nos recebimentos parciais seguintes) o título a
   * pagar de um Pedido de Compra — decisão pendente #2 resolvida: o gatilho é o recebimento físico,
   * não a confirmação do pedido. `amount` é sempre recalculado do zero a partir da soma real dos
   * itens já recebidos (nunca incrementado) — chamar de novo com o mesmo estado do pedido é
   * idempotente por construção, resiliente a um handler de evento eventualmente repetido.
   */
  async upsertPayableFromPurchaseOrder(purchaseOrderId: string, userId: string) {
    const purchaseOrder = (await purchaseOrderRepository.findByIdWithItems(purchaseOrderId)) as {
      id: string
      number: string
      paymentTerms: string
      items: Array<{ unitPrice: number; quantityReceived: number }>
    } | null
    if (!purchaseOrder) throw new NotFoundException('Pedido de compra não encontrado')

    const amount = purchaseOrder.items.reduce((sum, item) => sum + item.unitPrice * item.quantityReceived, 0)
    if (amount <= 0) return null // nada recebido de fato ainda — nenhum título a gerar

    const existing = await accountPayableRepository.findByPurchaseOrderId(purchaseOrderId)

    if (!existing) {
      const number = await numberingService.getNextNumber('titulo_pagar')
      // Vencimento lido da própria condição de pagamento do pedido (`PAYMENT_TERMS_OPTIONS`, mesmo
      // vocabulário do Comercial/Compras) — não um prazo fixo inventado pelo Financeiro.
      const created = (await accountPayableRepository.createFromPurchaseOrder({
        number,
        purchaseOrderId,
        amount,
        dueDate: resolveDueDate(purchaseOrder.paymentTerms),
        userId,
      })) as { id: string; number: string }

      await auditService.log({
        userId,
        action: 'CREATE',
        module: 'financeiro',
        entityId: created.id,
        entityName: created.number,
        details: `Título a pagar ${created.number} gerado a partir do recebimento do pedido de compra ${purchaseOrder.number}`,
      })
      return created
    }

    const updated = await accountPayableRepository.updateAmountFromPurchaseOrder(existing.id, amount)

    await auditService.log({
      userId,
      action: 'UPDATE',
      module: 'financeiro',
      entityId: existing.id,
      entityName: existing.number,
      details: `Título a pagar ${existing.number} atualizado — novo valor após recebimento adicional do pedido de compra ${purchaseOrder.number}`,
      beforeValue: { amount: existing.amount },
      afterValue: { amount },
    })
    return updated
  }

  async registerPayment(accountPayableId: string, amount: number, paidAt: Date, notes: string, userId: string) {
    const account = (await accountPayableRepository.findByIdDetailed(accountPayableId)) as PayableRecord | null
    if (!account) throw new NotFoundException('Título a pagar não encontrado')
    if (account.status === 'cancelled' || account.status === 'paid') {
      throw new BadRequestException(`Não é possível registrar pagamento num título "${account.status}"`)
    }
    if (amount <= 0) throw new BadRequestException('Valor do pagamento deve ser maior que zero')

    const totalPaid = account.payments.reduce((sum, p) => sum + p.amount, 0)
    const outstanding = account.amount - totalPaid
    if (amount > outstanding) {
      throw new BadRequestException(`Valor do pagamento (${amount}) excede o saldo em aberto do título (${outstanding})`)
    }

    const updated = await accountPayableRepository.registerPayment(accountPayableId, amount, paidAt, notes, userId)

    await auditService.log({
      userId,
      action: 'UPDATE',
      module: 'financeiro',
      entityId: accountPayableId,
      entityName: account.number,
      details: `Pagamento de ${amount} registrado no título a pagar ${account.number}`,
    })
    return updated
  }

  async cancelPayable(id: string, userId: string) {
    const account = (await accountPayableRepository.findById(id)) as { id: string; number: string; status: string } | null
    if (!account) throw new NotFoundException('Título a pagar não encontrado')
    if (account.status !== 'open') {
      throw new BadRequestException('Só é possível cancelar um título a pagar que ainda não teve nenhum pagamento registrado')
    }

    const updated = await accountPayableRepository.updateStatus(id, 'cancelled')

    await auditService.log({
      userId,
      action: 'PATCH',
      module: 'financeiro',
      entityId: id,
      entityName: account.number,
      details: `Título a pagar ${account.number} cancelado`,
      beforeValue: { status: account.status },
      afterValue: { status: 'cancelled' },
    })
    return updated
  }

  // ══════════════════════════════════════════════════════════════
  // CONTAS A RECEBER
  // ══════════════════════════════════════════════════════════════

  async listReceivables({ status, search, page, limit }: ListAccountsInput) {
    const where: Record<string, unknown> = {}
    if (status) where.status = status
    if (search) where.number = { contains: search }

    const { data, total } = await accountReceivableRepository.findManyPaginated(where, (page - 1) * limit, limit)
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) }
  }

  async getReceivableById(id: string) {
    const account = await accountReceivableRepository.findByIdDetailed(id)
    if (!account) throw new NotFoundException('Título a receber não encontrado')
    return account
  }

  /** Gera o título a receber de uma fatura — chamado pelo handler do evento `fatura.emitida`
   * (`InvoiceService`). Idempotente: `invoiceId` é `@unique` em `AccountReceivable`, uma segunda
   * chamada para a mesma fatura devolve o título já existente em vez de duplicar. */
  async createReceivableFromInvoice(invoiceId: string, invoiceNumber: string, amount: number, dueDate: Date, userId: string) {
    const existing = await accountReceivableRepository.findByInvoiceId(invoiceId)
    if (existing) return existing

    const number = await numberingService.getNextNumber('titulo_receber')
    const created = (await accountReceivableRepository.createDetailed({
      number,
      invoiceId,
      amount,
      dueDate,
      userId,
    })) as { id: string; number: string }

    await auditService.log({
      userId,
      action: 'CREATE',
      module: 'financeiro',
      entityId: created.id,
      entityName: created.number,
      details: `Título a receber ${created.number} gerado a partir da fatura ${invoiceNumber}`,
    })
    return created
  }

  async registerReceipt(accountReceivableId: string, amount: number, paidAt: Date, notes: string, userId: string) {
    const account = (await accountReceivableRepository.findByIdDetailed(accountReceivableId)) as ReceivableRecord | null
    if (!account) throw new NotFoundException('Título a receber não encontrado')
    if (account.status === 'cancelled' || account.status === 'paid') {
      throw new BadRequestException(`Não é possível registrar recebimento num título "${account.status}"`)
    }
    if (amount <= 0) throw new BadRequestException('Valor do recebimento deve ser maior que zero')

    const totalPaid = account.receipts.reduce((sum, r) => sum + r.amount, 0)
    const outstanding = account.amount - totalPaid
    if (amount > outstanding) {
      throw new BadRequestException(`Valor do recebimento (${amount}) excede o saldo em aberto do título (${outstanding})`)
    }

    const updated = await accountReceivableRepository.registerReceipt(accountReceivableId, amount, paidAt, notes, userId)

    await auditService.log({
      userId,
      action: 'UPDATE',
      module: 'financeiro',
      entityId: accountReceivableId,
      entityName: account.number,
      details: `Recebimento de ${amount} registrado no título a receber ${account.number}`,
    })
    return updated
  }

  async cancelReceivable(id: string, userId: string) {
    const account = (await accountReceivableRepository.findById(id)) as { id: string; number: string; status: string } | null
    if (!account) throw new NotFoundException('Título a receber não encontrado')
    if (account.status !== 'open') {
      throw new BadRequestException('Só é possível cancelar um título a receber que ainda não teve nenhum recebimento registrado')
    }

    const updated = await accountReceivableRepository.updateStatus(id, 'cancelled')

    await auditService.log({
      userId,
      action: 'PATCH',
      module: 'financeiro',
      entityId: id,
      entityName: account.number,
      details: `Título a receber ${account.number} cancelado`,
      beforeValue: { status: account.status },
      afterValue: { status: 'cancelled' },
    })
    return updated
  }
}

export const financialAccountService = new FinancialAccountService()
