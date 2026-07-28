import crypto from 'crypto'
import { quoteRepository } from '@/app/repositories/quote.repository'
import { clientRepository } from '@/app/repositories/client.repository'
import { numberingService } from '@/app/services/numbering.service'
import { auditService } from '@/app/services/audit.service'
import { statusHistoryService } from '@/app/services/status-history.service'
import { approvalService } from '@/app/services/approval.service'
import { domainEvents, DOMAIN_EVENTS } from '@/lib/domain-events'
import type { OrcamentoAprovadoPayload, OrcamentoConvertidoEmPedidoVendaPayload } from '@/lib/domain-events'
import { NotFoundException, BadRequestException } from '@/app/exceptions'
import { checkTransition } from '@/lib/status-machine'
import { formatDate, parseBrDate } from '@/lib/format'
import type { CreateQuoteDto } from '@/app/dto'

export interface ListQuotesInput {
  status?: string
  search?: string
  page: number
  limit: number
}

/**
 * Transições permitidas do Orçamento (ADR-002, confirmado com o usuário em 2026-07-09).
 * `approved → cancelled` é permitido aqui, mas bloqueado por regra de negócio adicional em
 * `changeStatus` quando o orçamento já foi convertido em Pedido de Venda.
 */
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  draft: ['sent', 'cancelled'],
  sent: ['approved', 'rejected', 'cancelled', 'draft'],
  approved: ['cancelled'],
  rejected: ['sent', 'cancelled'],
  expired: ['sent', 'cancelled'],
  cancelled: [],
}

const ALLOWED_UPDATE_FIELDS = [
  'clientId', 'clientName', 'clientCnpj', 'clientContact', 'clientPhone', 'clientEmail',
  'clientAddress', 'clientNeighborhood', 'clientCep', 'status', 'validUntil',
  'discountType', 'discountValue', 'freightMode', 'freightValue', 'freightText',
  'warranty', 'validity', 'deliveryTime', 'paymentTerms', 'generalConditions',
  'notes', 'photoNote', 'internalNotes',
] as const

interface ClientSnapshot {
  corporateName: string
  tradeName: string
  cpfCnpj: string | null
  address: string
  neighborhood: string
  zipCode: string
  email: string
  phone: string
  contactName: string
}

interface QuoteRecord {
  id: string
  number: string
  status: string
  discountType: string
  discountValue: number
  freightValue: number
}

interface QuotePublicRecord {
  id: string
  number: string
  status: string
  userId: string
  date: string
  validUntil: string
  validity: string
  clientName: string
  clientCnpj: string
  clientAddress: string
  clientNeighborhood: string
  clientCep: string
  clientContact: string
  clientEmail: string
  clientPhone: string
  subtotal: number
  discountType: string
  discountValue: number
  discountTotal: number
  freightMode: string
  freightText: string
  freightValue: number
  total: number
  warranty: string
  deliveryTime: string
  paymentTerms: string
  generalConditions: string
  notes: string
  items: Array<{
    code: string
    description: string
    quantity: number
    unit: string
    unitPrice: number
    total: number
    order: number
  }>
}

interface QuoteWithItemsAndSalesOrder {
  id: string
  number: string
  status: string
  userId: string
  clientId: string | null
  clientName: string
  clientCnpj: string
  subtotal: number
  discountTotal: number
  total: number
  paymentTerms: string
  deliveryTime: string
  notes: string
  salesOrder: { id: string; number: string } | null
  items: Array<{
    productId: string | null
    code: string
    description: string
    quantity: number
    unit: string
    unitPrice: number
    total: number
    order: number
  }>
}

class QuoteService {
  // `freightValue` entra no total desde que tenha sido informado, independente de `freightMode`
  // ("A combinar"/"Emitente"/"Destinatario" só documentam quem organiza o frete, não isentam o
  // cliente de pagá-lo quando um valor foi de fato lançado) — achado do usuário: o frete aparecia
  // como linha separada no PDF (`drawSummaryBox`) mas nunca somava no TOTAL, nem no PDF nem no
  // sistema, porque `total` nunca incluía `freightValue`.
  private calculateTotals(items: CreateQuoteDto['items'], discountType: string, discountValue: number, freightValue: number) {
    let subtotal = 0
    const calculatedItems = (items || []).map((item, idx) => {
      const itemTotal = item.quantity * item.unitPrice
      subtotal += itemTotal
      return {
        ...item,
        total: itemTotal,
        order: item.order ?? idx,
      }
    })

    let discountTotal = 0
    if (discountType === 'percent') {
      discountTotal = subtotal * (discountValue / 100)
    } else {
      discountTotal = discountValue
    }

    const total = subtotal - discountTotal + (freightValue || 0)

    return { subtotal, discountTotal, total, items: calculatedItems }
  }

  private async applyClientSnapshot(target: Record<string, unknown>, clientId: string) {
    const client = (await clientRepository.findById(clientId)) as ClientSnapshot | null
    if (!client) return
    target.clientName = client.corporateName || client.tradeName
    target.clientCnpj = client.cpfCnpj || ''
    target.clientAddress = client.address
    target.clientNeighborhood = client.neighborhood
    target.clientCep = client.zipCode
    target.clientEmail = client.email
    target.clientPhone = client.phone
    target.clientContact = client.contactName
  }

  async list({ status, search, page, limit }: ListQuotesInput) {
    const where: Record<string, unknown> = {}
    if (status) where.status = status
    if (search) {
      where.OR = [
        { number: { contains: search } },
        { clientName: { contains: search } },
        { clientCnpj: { contains: search } },
      ]
    }
    const { data, total } = await quoteRepository.findManyPaginated(where, (page - 1) * limit, limit)
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) }
  }

  async getById(id: string) {
    const quote = await quoteRepository.findByIdDetailed(id)
    if (!quote) throw new NotFoundException('Orçamento não encontrado')
    return quote
  }

  async create(data: CreateQuoteDto, userId: string) {
    if (data.clientId) await this.applyClientSnapshot(data, data.clientId)

    const { subtotal, discountTotal, total, items: calculatedItems } = this.calculateTotals(
      data.items,
      data.discountType,
      data.discountValue,
      data.freightValue
    )

    const quoteNumber = await numberingService.getNextNumber('orcamento')

    const quote = (await quoteRepository.createWithItems({
      number: quoteNumber,
      date: formatDate(new Date()),
      status: data.status || 'draft',
      validUntil: data.validUntil || '',
      clientId: data.clientId || null,
      clientName: data.clientName,
      clientContact: data.clientContact,
      clientAddress: data.clientAddress,
      clientNeighborhood: data.clientNeighborhood,
      clientCep: data.clientCep,
      clientCnpj: data.clientCnpj,
      clientEmail: data.clientEmail,
      clientPhone: data.clientPhone,
      subtotal,
      discountType: data.discountType,
      discountValue: data.discountValue,
      discountTotal,
      freightMode: data.freightMode,
      freightText: data.freightText,
      freightValue: data.freightValue,
      total,
      warranty: data.warranty,
      validity: data.validity,
      deliveryTime: data.deliveryTime,
      paymentTerms: data.paymentTerms,
      generalConditions: data.generalConditions,
      notes: data.notes,
      photoNote: data.photoNote,
      internalNotes: data.internalNotes,
      userId,
      items: {
        create: calculatedItems.map((item) => ({
          productId: item.productId || null,
          code: item.code,
          description: item.description,
          quantity: item.quantity,
          unit: item.unit,
          unitPrice: item.unitPrice,
          total: item.total,
          order: item.order,
          notes: item.notes,
        })),
      },
    })) as QuoteRecord

    await auditService.log({
      userId,
      action: 'CREATE',
      module: 'orcamentos',
      entityId: quote.id,
      entityName: quote.number,
      details: `Orçamento ${quote.number} criado com ${calculatedItems.length} itens - Total: R$ ${total.toFixed(2)}`,
    })

    return quote
  }

   
  async update(id: string, body: Record<string, any>, userId: string) {
    const quote = (await quoteRepository.findById(id)) as QuoteRecord | null
    if (!quote) throw new NotFoundException('Orçamento não encontrado')

    if (body.clientId) await this.applyClientSnapshot(body, body.clientId)

    const items = body.items || []
    const discountType = body.discountType ?? quote.discountType
    const discountValue = body.discountValue ?? quote.discountValue
    const freightValue = body.freightValue ?? quote.freightValue
    const { subtotal, discountTotal, total, items: calculatedItems } = this.calculateTotals(items, discountType, discountValue, freightValue)

    const updateData: Record<string, unknown> = {}
    for (const key of ALLOWED_UPDATE_FIELDS) {
      if (body[key] !== undefined) updateData[key] = body[key]
    }

    // Replace all items
    await quoteRepository.deleteAllItems(id)

    const updated = await quoteRepository.updateWithItems(
      id,
      { ...updateData, subtotal, discountTotal, total },
      calculatedItems.map((item) => ({
        productId: item.productId || null,
        code: item.code,
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
        unitPrice: item.unitPrice,
        total: item.total,
        order: item.order,
        notes: item.notes,
      }))
    )

    await auditService.log({
      userId,
      action: 'UPDATE',
      module: 'orcamentos',
      entityId: (updated as QuoteRecord).id,
      entityName: (updated as QuoteRecord).number,
      details: `Orçamento ${(updated as QuoteRecord).number} atualizado`,
    })

    return updated
  }

  /**
   * Reatribuição de responsável e sub-status de triagem (ADR-026, Fase 4) — método dedicado em vez
   * de reaproveitar `update()`: `update()` sempre substitui TODOS os itens do orçamento (usa
   * `body.items || []`), então usá-lo aqui apagaria os itens só por causa de uma troca de
   * responsável. `quoteRepository.updateStatus()` é o mesmo primitivo de update parcial já usado por
   * `changeStatus()` — nunca toca em itens.
   */
  async reassignAndStage(id: string, data: { userId?: string; internalStage?: string }, actingUserId: string) {
    const quote = (await quoteRepository.findById(id)) as QuoteRecord | null
    if (!quote) throw new NotFoundException('Orçamento não encontrado')

    const updateData: Record<string, unknown> = {}
    if (data.userId !== undefined) updateData.userId = data.userId
    if (data.internalStage !== undefined) updateData.internalStage = data.internalStage

    const updated = await quoteRepository.updateStatus(id, updateData)

    await auditService.log({
      userId: actingUserId,
      action: 'PATCH',
      module: 'orcamentos',
      entityId: id,
      entityName: quote.number,
      details: `Orçamento ${quote.number}: responsável/etapa de triagem atualizados`,
    })

    return updated
  }

  async delete(id: string, userId: string) {
    const quote = (await quoteRepository.findByIdWithItemsAndSalesOrder(id)) as QuoteWithItemsAndSalesOrder | null
    if (!quote) throw new NotFoundException('Orçamento não encontrado')
    if (quote.salesOrder) {
      throw new BadRequestException(`Não é possível excluir: este orçamento já foi convertido no Pedido de Venda ${quote.salesOrder.number}`)
    }

    await quoteRepository.delete(id)

    await auditService.log({
      userId,
      action: 'DELETE',
      module: 'orcamentos',
      entityId: id,
      entityName: quote.number,
      details: `Orçamento ${quote.number} excluído`,
    })

    return { success: true }
  }

  /**
   * Ao aprovar um orçamento, gera automaticamente uma Ordem de Produção para cada item
   * vinculado a um produto cadastrado (itens avulsos são ignorados). Publica o evento
   * `orcamento.aprovado` (ADR-003) — quem consome (ProductionOrderService) é resolvido em
   * `register-domain-event-handlers.ts`, não importado aqui.
   */
  async changeStatus(id: string, status: string, userId: string, userRole = '') {
    const quote = (await quoteRepository.findByIdWithItemsAndSalesOrder(id)) as QuoteWithItemsAndSalesOrder | null
    if (!quote) throw new NotFoundException('Orçamento não encontrado')

    const transitionError = checkTransition(quote.status, status, ALLOWED_TRANSITIONS)
    if (transitionError) throw new BadRequestException(transitionError)

    if (status === 'cancelled' && quote.status === 'approved' && quote.salesOrder) {
      throw new BadRequestException(
        `Não é possível cancelar: este orçamento já foi convertido no Pedido de Venda ${quote.salesOrder.number}`
      )
    }

    // ADR-023 (item 5) — "aprovar" passa pelo motor de alçada antes de qualquer efeito colateral.
    // Enquanto o número de aprovações exigido não for atingido, o Orçamento continua em "sent" —
    // sem trocar status, sem StatusHistory, sem gerar Ordem de Produção.
    if (status === 'approved') {
      const outcome = await approvalService.recordApproval('quote', id, quote.total, userId, quote.userId, userRole)
      if (!outcome.complete) {
        return { pendingApproval: true, approvalsGiven: outcome.approvalsGiven, approvalsNeeded: outcome.approvalsNeeded }
      }
    }

    const updateData: Record<string, unknown> = { status }
    if (status === 'approved') {
      updateData.approvedBy = userId
      updateData.approvedAt = new Date()
    }
    if (status === 'sent') {
      updateData.sentAt = new Date()
      // Gera (ou regenera) o token do link público a cada novo envio — se o orçamento foi editado e
      // reenviado, qualquer link antigo compartilhado com o cliente para de funcionar.
      updateData.publicToken = crypto.randomBytes(32).toString('hex')
    }

    const updated = await quoteRepository.updateStatus(id, updateData)

    await statusHistoryService.record('quote', id, quote.status, status, userId)

    await auditService.log({
      userId,
      action: 'PATCH',
      module: 'orcamentos',
      entityId: id,
      entityName: quote.number,
      details: `Status do orçamento ${quote.number} alterado de "${quote.status}" para "${status}"`,
      beforeValue: { status: quote.status },
      afterValue: { status },
    })

    // A máquina de transições já garante que só se chega aqui vindo de "sent" — nunca de
    // "approved" pra "approved" (auto-transição não está no mapa), então gerar OP sempre que
    // o destino for "approved" é seguro e não duplica.
    const productionOrders = status === 'approved' ? await this.generateProductionOrdersForApproval(id, quote.number, userId) : []

    return { ...(updated as object), generatedProductionOrders: productionOrders }
  }

  /** Gera 1 Ordem de Produção por item vinculado a produto cadastrado, ao aprovar um orçamento — usado
   * tanto pela aprovação interna (`changeStatus`) quanto pela confirmação do cliente via link público
   * (`confirmByClient`). */
  private async generateProductionOrdersForApproval(quoteId: string, quoteNumber: string, userId: string) {
    const withItems = (await quoteRepository.findItemsWithProduct(quoteId)) as {
      items: Array<{ productId: string | null; description: string; quantity: number; unit: string; notes: string }>
    } | null
    const items = withItems?.items ?? []
    if (items.length === 0) return []

    const results = await domainEvents.publish<OrcamentoAprovadoPayload, Array<{ id: string; number: string }>>(
      DOMAIN_EVENTS.ORCAMENTO_APROVADO,
      { quoteId, quoteNumber, userId, items }
    )
    const productionOrders = results.flat()

    await auditService.log({
      userId,
      action: 'CREATE',
      module: 'producao',
      entityId: quoteId,
      entityName: quoteNumber,
      details: `${productionOrders.length} Ordem(ns) de Produção gerada(s) automaticamente a partir do orçamento ${quoteNumber}: ${productionOrders.map((o) => o.number).join(', ')}`,
    })

    return productionOrders
  }

  /**
   * Visualização pública do orçamento (link com token, sem autenticação) — ADR-024 addendum. Só
   * expõe orçamentos em "sent" e dentro da validade (`validUntil`); qualquer outro caso é tratado
   * como link inválido/expirado, sem distinguir os dois motivos pro cliente.
   */
  async getByPublicToken(token: string) {
    const quote = (await quoteRepository.findByPublicToken(token)) as unknown as QuotePublicRecord | null
    if (!quote || quote.status !== 'sent' || this.isPastValidUntil(quote.validUntil)) {
      throw new NotFoundException('Link inválido ou expirado')
    }
    return quote
  }

  /**
   * Confirmação do cliente via link público — ADR-024 addendum. Decisão do usuário: o cliente É o
   * aprovador nesse fluxo (muda o status direto pra approved/rejected), sem passar pelo motor de
   * alçada (`approvalService`), que exige um usuário interno com Role — o cliente não tem nenhum dos
   * dois. O fluxo interno de aprovação (ADR-023, item 5) continua existindo à parte, sem alteração,
   * para os casos em que a equipe confirma manualmente (ex.: cliente aprovou por telefone).
   */
  async confirmByClient(token: string, decision: 'approved' | 'rejected') {
    const quote = (await quoteRepository.findByPublicToken(token)) as unknown as QuotePublicRecord | null
    if (!quote || quote.status !== 'sent' || this.isPastValidUntil(quote.validUntil)) {
      throw new NotFoundException('Link inválido ou expirado')
    }

    const updateData: Record<string, unknown> = { status: decision, clientRespondedAt: new Date() }
    if (decision === 'approved') {
      updateData.approvedBy = 'Cliente (link público)'
      updateData.approvedAt = new Date()
    }

    await quoteRepository.updateStatus(quote.id, updateData)

    await statusHistoryService.record(
      'quote',
      quote.id,
      quote.status,
      decision,
      quote.userId,
      decision === 'approved' ? 'Aprovado pelo cliente via link público' : 'Recusado pelo cliente via link público'
    )

    await auditService.log({
      userId: quote.userId,
      action: 'PATCH',
      module: 'orcamentos',
      entityId: quote.id,
      entityName: quote.number,
      details: `Orçamento ${quote.number} ${decision === 'approved' ? 'aprovado' : 'recusado'} pelo cliente via link público`,
      beforeValue: { status: quote.status },
      afterValue: { status: decision },
    })

    const productionOrders =
      decision === 'approved' ? await this.generateProductionOrdersForApproval(quote.id, quote.number, quote.userId) : []

    return { status: decision, generatedProductionOrders: productionOrders }
  }

  private isPastValidUntil(validUntil: string): boolean {
    const date = parseBrDate(validUntil)
    if (!date) return false // sem data de validade preenchida — link não expira por essa via
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return date < today
  }

  /**
   * Converte um orçamento APROVADO em Pedido de Venda. Ação manual (não automática):
   * o orçamento continua existindo normalmente, o Pedido de Venda passa a representar
   * a venda efetivada, com vínculo de rastreabilidade ao orçamento de origem. Publica o
   * evento `orcamento.convertido_em_pedido_venda` (ADR-003) — quem consome (SalesOrderService) é
   * resolvido em `register-domain-event-handlers.ts`, não importado aqui.
   */
  async convertToSalesOrder(id: string, userId: string) {
    const quote = (await quoteRepository.findByIdWithItemsAndSalesOrder(id)) as QuoteWithItemsAndSalesOrder | null
    if (!quote) throw new NotFoundException('Orçamento não encontrado')

    if (quote.status !== 'approved') {
      throw new BadRequestException('Apenas orçamentos aprovados podem ser convertidos em Pedido de Venda')
    }
    if (quote.salesOrder) {
      throw new BadRequestException(`Este orçamento já foi convertido no Pedido de Venda ${quote.salesOrder.number}`)
    }

    const results = await domainEvents.publish<OrcamentoConvertidoEmPedidoVendaPayload, { id: string; number: string }>(
      DOMAIN_EVENTS.ORCAMENTO_CONVERTIDO_EM_PEDIDO_VENDA,
      { quote, userId }
    )
    const salesOrder = results[0]
    if (!salesOrder) {
      throw new Error('Nenhum handler registrado para orcamento.convertido_em_pedido_venda — verifique register-domain-event-handlers.ts')
    }

    await auditService.log({
      userId,
      action: 'CREATE',
      module: 'orcamentos',
      entityId: salesOrder.id,
      entityName: salesOrder.number,
      details: `Pedido de Venda ${salesOrder.number} gerado a partir do orçamento ${quote.number}`,
    })

    return salesOrder
  }

  async duplicate(id: string, userId: string) {
    const original = (await quoteRepository.findByIdWithItemsOrdered(id)) as {
      id: string
      number: string
      clientId: string | null
      clientName: string
      clientContact: string
      clientAddress: string
      clientNeighborhood: string
      clientCep: string
      clientCnpj: string
      clientEmail: string
      clientPhone: string
      subtotal: number
      discountType: string
      discountValue: number
      discountTotal: number
      freightMode: string
      freightText: string
      freightValue: number
      total: number
      warranty: string
      validity: string
      deliveryTime: string
      paymentTerms: string
      generalConditions: string
      notes: string
      photoNote: string
      internalNotes: string
      items: Array<{
        productId: string | null
        code: string
        description: string
        quantity: number
        unit: string
        unitPrice: number
        total: number
        weight: number | null
        width: number | null
        height: number | null
        length: number | null
        order: number
        notes: string
      }>
    } | null

    if (!original) throw new NotFoundException('Orçamento não encontrado')

    const newNumber = await numberingService.getNextNumber('orcamento')

    const duplicated = (await quoteRepository.createWithItems({
      number: newNumber,
      version: 1,
      status: 'draft',
      date: formatDate(new Date()),
      clientId: original.clientId,
      clientName: original.clientName,
      clientContact: original.clientContact,
      clientAddress: original.clientAddress,
      clientNeighborhood: original.clientNeighborhood,
      clientCep: original.clientCep,
      clientCnpj: original.clientCnpj,
      clientEmail: original.clientEmail,
      clientPhone: original.clientPhone,
      subtotal: original.subtotal,
      discountType: original.discountType,
      discountValue: original.discountValue,
      discountTotal: original.discountTotal,
      freightMode: original.freightMode,
      freightText: original.freightText,
      freightValue: original.freightValue,
      total: original.total,
      warranty: original.warranty,
      validity: original.validity,
      deliveryTime: original.deliveryTime,
      paymentTerms: original.paymentTerms,
      generalConditions: original.generalConditions,
      notes: original.notes,
      photoNote: original.photoNote,
      internalNotes: original.internalNotes,
      userId,
      items: {
        create: original.items.map((item) => ({
          productId: item.productId,
          code: item.code,
          description: item.description,
          quantity: item.quantity,
          unit: item.unit,
          unitPrice: item.unitPrice,
          total: item.total,
          weight: item.weight,
          width: item.width,
          height: item.height,
          length: item.length,
          order: item.order,
          notes: item.notes,
        })),
      },
    })) as QuoteRecord

    await auditService.log({
      userId,
      action: 'CREATE',
      module: 'orcamentos',
      entityId: duplicated.id,
      entityName: duplicated.number,
      details: `Orçamento ${duplicated.number} duplicado de ${original.number}`,
    })

    return duplicated
  }
}

export const quoteService = new QuoteService()
