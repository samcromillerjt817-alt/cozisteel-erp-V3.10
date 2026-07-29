import crypto from 'crypto'
import { quoteRepository } from '@/app/repositories/quote.repository'
import { clientRepository } from '@/app/repositories/client.repository'
import { numberingService } from '@/app/services/numbering.service'
import { auditService } from '@/app/services/audit.service'
import { statusHistoryService } from '@/app/services/status-history.service'
import { approvalService } from '@/app/services/approval.service'
import { domainEvents, DOMAIN_EVENTS } from '@/lib/domain-events'
import type {
  OrcamentoAprovadoPayload,
  OrcamentoAprovadoEfeitosPosCommitPayload,
  OrcamentoConvertidoEmPedidoVendaPayload,
} from '@/lib/domain-events'
import { NotFoundException, BadRequestException, ConflictException } from '@/app/exceptions'
import { checkTransition } from '@/lib/status-machine'
import { formatDate, parseBrDate } from '@/lib/format'
import { onlyDigits } from '@/lib/masks'
import { db } from '@/lib/db'
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

interface QuoteClientFields {
  id: string
  number: string
  clientId: string | null
  clientName: string
  clientCnpj: string
  clientContact: string
  clientEmail: string
  clientPhone: string
  clientAddress: string
  clientNeighborhood: string
  clientCep: string
}

/** Leitura dedicada da transação atômica de `confirmByClient` — só os campos usados ali, com
 *  `items` no formato bruto do banco (`productId`/`notes`), não o formato de exibição pública
 *  (`code`/`unitPrice`/`total`) de `QuotePublicRecord`. */
interface QuotePublicRecordWithItems {
  id: string
  number: string
  status: string
  userId: string
  validUntil: string
  items: Array<{ productId: string | null; description: string; quantity: number; unit: string; notes: string }>
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
  // Migração de token pra hash (auditoria de segurança, 2ª rodada) — o token bruto do link público
  // nunca mais é persistido; só o hash SHA-256 vai pro banco (`Quote.publicTokenHash`). O token
  // bruto só existe na resposta HTTP do envio, uma única vez (`changeStatus` pra "sent") — não há
  // como recuperá-lo depois. Reenviar (sent → draft → sent de novo) gera e revela um token novo.
  private hashPublicToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex')
  }

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

  /**
   * Cria (ou vincula, se já existir) um Cliente formal a partir dos dados desnormalizados de um
   * Orçamento sem cliente cadastrado — cobre tanto o lead do Catálogo Digital (ADR-026) quanto
   * qualquer outro Orçamento criado sem selecionar um Cliente. Nunca altera o cadastro de Produto/
   * BOM; só cria o Cliente e vincula `clientId` no Orçamento (e no CatalogRequest de origem, se
   * houver, pra manter os dois registros apontando pro mesmo Cliente).
   */
  async promoteToClient(id: string, actingUserId: string) {
    const quote = (await quoteRepository.findById(id)) as QuoteClientFields | null
    if (!quote) throw new NotFoundException('Orçamento não encontrado')
    if (quote.clientId) throw new BadRequestException('Este orçamento já está vinculado a um cliente')
    if (!quote.clientName?.trim()) throw new BadRequestException('Não há dados de cliente neste orçamento para criar um cadastro')

    // Orçamento do Catálogo Digital (ADR-026) tem cidade/estado só no CatalogRequest — Quote não
    // tem esses 2 campos. Reaproveita se existir, sem criar campo novo em Quote.
    const catalogRequest = await db.catalogRequest.findUnique({
      where: { quoteId: id },
      select: { id: true, clientCity: true, clientState: true },
    })

    const cpfCnpj = quote.clientCnpj?.trim() || null
    const existingClient = (cpfCnpj ? await clientRepository.findByCpfCnpj(cpfCnpj) : null) as { id: string; corporateName: string } | null
    let clientRecord: { id: string; corporateName: string }
    let created = false
    if (existingClient) {
      clientRecord = existingClient
    } else {
      const digits = onlyDigits(cpfCnpj || '')
      clientRecord = (await clientRepository.create({
        type: digits.length > 11 ? 'company' : 'person',
        corporateName: quote.clientName,
        cpfCnpj,
        email: quote.clientEmail || '',
        phone: quote.clientPhone || '',
        contactName: quote.clientContact || '',
        address: quote.clientAddress || '',
        neighborhood: quote.clientNeighborhood || '',
        zipCode: quote.clientCep || '',
        city: catalogRequest?.clientCity || '',
        state: catalogRequest?.clientState || '',
      })) as { id: string; corporateName: string }
      created = true
    }
    await quoteRepository.updateStatus(id, { clientId: clientRecord.id })
    if (catalogRequest) {
      await db.catalogRequest.update({ where: { id: catalogRequest.id }, data: { clientId: clientRecord.id } })
    }

    await auditService.log({
      userId: actingUserId,
      action: 'UPDATE',
      module: 'orcamentos',
      entityId: id,
      entityName: quote.number,
      details: created
        ? `Cliente "${clientRecord.corporateName}" criado a partir do orçamento ${quote.number}`
        : `Orçamento ${quote.number} vinculado ao cliente já cadastrado "${clientRecord.corporateName}"`,
    })

    return { clientId: clientRecord.id, created }
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
    let rawPublicToken: string | null = null
    if (status === 'sent') {
      updateData.sentAt = new Date()
      // Gera (ou regenera) o token do link público a cada novo envio — se o orçamento foi editado e
      // reenviado, qualquer link antigo compartilhado com o cliente para de funcionar. Só o HASH
      // vai pro banco (`publicTokenHash`) — o valor bruto (`rawPublicToken`) nunca é persistido,
      // só devolvido nesta resposta, uma única vez.
      rawPublicToken = crypto.randomBytes(32).toString('hex')
      updateData.publicToken = null
      updateData.publicTokenHash = this.hashPublicToken(rawPublicToken)
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

    return {
      ...(updated as object),
      // Sobrescreve o `publicToken` (null no banco, ver acima) só nesta resposta — única vez que o
      // valor bruto existe fora do momento em que foi gerado.
      ...(rawPublicToken ? { publicToken: rawPublicToken } : {}),
      generatedProductionOrders: productionOrders,
    }
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
   *
   * Atomicidade (auditoria de segurança, 2ª rodada) — a versão anterior lia o orçamento, checava
   * `status === 'sent'` em JS e só DEPOIS escrevia, em 2 passos separados: 2 requisições
   * concorrentes podiam ler "sent" antes de qualquer uma escrever, e as duas gerariam Ordem de
   * Produção. O guard real agora é `tx.quote.updateMany({where: {status: 'sent'}, ...})` — uma
   * ÚNICA instrução SQL, atômica no próprio motor SQLite, indivisível mesmo sob concorrência real
   * (não depende de `db.$transaction` pra isso: um único `UPDATE ... WHERE` já é atômico por
   * conta própria). Só o `count === 1` da chamada vencedora prossegue pra criar Ordem de Produção.
   *
   * Decisão de design importante, descoberta NESTA auditoria: a primeira versão desta correção
   * envolvia o compare-and-swap inteiro dentro de uma `db.$transaction` interativa. Sob teste de
   * carga real (20 chamadas concorrentes via `Promise.all`, ver `tests/quote-public-confirmation-
   * race.test.ts`), isso expôs um teto de concorrência do motor Prisma (Node-API) + SQLite nesta
   * versão (6.19.3): mesmo uma transação trivial (`tx.user.count()`) sem nenhuma lógica de negócio
   * falhava com "Socket timeout" pra 80%+ das chamadas sob 20 transações interativas simultâneas —
   * um teto do motor, não do `$transaction({maxWait, timeout})` (aumentar esses valores não mudou
   * nada, confirmando que o teto não é configurável por essa API). Por isso o compare-and-swap
   * NÃO abre uma transação interativa — é 1 `updateMany` avulso, atômico por natureza, sem
   * concorrência de transações nenhuma. Só a criação de OP (que só o vencedor executa — nenhuma
   * pressão de 20 chamadas concorrentes chega até aqui) abre uma transação estreita, com
   * compensação manual (reverter o status) se ela falhar no meio — o equivalente prático a um
   * rollback, sem pagar o preço do teto de concorrência do motor.
   *
   * Contrato de resposta pra 2ª tentativa sobre o mesmo token (idempotência/conflito, nunca depende
   * de rate limit pra ficar consistente): se o orçamento já foi decidido com a MESMA decisão
   * pedida, devolve sucesso idempotente (`alreadyProcessed: true`, sem recriar nada); se já foi
   * decidido com uma decisão DIFERENTE, `ConflictException` (409); se o token nunca existiu ou o
   * orçamento expirou, `NotFoundException` (404) — igual a antes, sem virar oráculo.
   */
  async confirmByClient(token: string, decision: 'approved' | 'rejected') {
    // Migração de token pra hash (auditoria de segurança, 2ª rodada) — busca primeiro pelo hash
    // (padrão novo), cai pro `publicToken` em texto puro só como fallback pra links legados.
    const existing = (await db.quote.findFirst({
      where: { OR: [{ publicTokenHash: this.hashPublicToken(token) }, { publicToken: token }] },
      include: { items: { orderBy: { order: 'asc' } } },
    })) as unknown as QuotePublicRecordWithItems | null

    if (!existing || this.isPastValidUntil(existing.validUntil)) {
      throw new NotFoundException('Link inválido ou expirado')
    }

    if (existing.status !== 'sent') {
      if (existing.status === decision) {
        return { status: decision, generatedProductionOrders: [], alreadyProcessed: true }
      }
      throw new ConflictException('Este orçamento já foi respondido anteriormente com uma decisão diferente')
    }

    const updateData: Record<string, unknown> = { status: decision, clientRespondedAt: new Date() }
    if (decision === 'approved') {
      updateData.approvedBy = 'Cliente (link público)'
      updateData.approvedAt = new Date()
    }

    // O guard atômico real: `status: 'sent'` no `where` faz do check-e-write uma única instrução
    // indivisível no SQLite — não 2 passos separados em JS, e sem precisar de `$transaction`.
    const updated = await db.quote.updateMany({
      where: { id: existing.id, status: 'sent' },
      data: updateData,
    })

    if (updated.count === 0) {
      // Perdeu a corrida entre a leitura acima e este `updateMany` — reavalia o estado final e
      // responde idempotente ou conflito, igual ao caso acima, nunca duplica.
      const final = (await db.quote.findUnique({ where: { id: existing.id } })) as unknown as Omit<QuotePublicRecordWithItems, 'items'> | null
      if (final && final.status === decision) {
        return { status: decision, generatedProductionOrders: [], alreadyProcessed: true }
      }
      throw new ConflictException('Este orçamento já foi respondido anteriormente com uma decisão diferente')
    }

    // A partir daqui, só a chamada vencedora chega — nenhuma pressão de concorrência real neste
    // ponto (o `updateMany` acima já filtrou todas as outras).
    let createdOrders: Array<{ id: string; number: string; productId: string | null; quantity: number }> = []
    if (decision === 'approved') {
      const items = existing.items.filter((i) => i.productId)
      if (items.length > 0) {
        try {
          const results = await db.$transaction(
            async (tx) =>
              domainEvents.publish<
                OrcamentoAprovadoPayload,
                Array<{ id: string; number: string; productId: string | null; quantity: number }>
              >(DOMAIN_EVENTS.ORCAMENTO_APROVADO, { quoteId: existing.id, quoteNumber: existing.number, userId: existing.userId, items, tx }),
            // Só a chamada vencedora abre esta transação (nunca 20 ao mesmo tempo — ver comentário
            // do método) — mas outras chamadas perdedoras ainda podem estar concorrendo por
            // consultas avulsas na mesma conexão SQLite ao mesmo tempo; `maxWait`/`timeout`
            // generosos evitam que essa contenção pontual feche a transação prematuramente.
            { maxWait: 15000, timeout: 15000 }
          )
          createdOrders = results.flat()
        } catch (err) {
          // Compensação (equivalente a rollback, sem `$transaction` envolvendo o `updateMany`
          // acima): a criação de OP falhou no meio — desfaz a transição, orçamento volta a "sent"
          // e o cliente pode confirmar de novo.
          await db.quote.updateMany({
            where: { id: existing.id, status: decision },
            data: { status: 'sent', clientRespondedAt: null, approvedBy: null, approvedAt: null },
          })
          throw err
        }

        if (createdOrders.length > 0) {
          // Efeitos secundários da criação de OP (evento sem consumidor + reserva de material) só
          // depois do commit — ver `ORCAMENTO_APROVADO_EFEITOS_POS_COMMIT` em `domain-events.ts`.
          await domainEvents.publish<OrcamentoAprovadoEfeitosPosCommitPayload, void>(DOMAIN_EVENTS.ORCAMENTO_APROVADO_EFEITOS_POS_COMMIT, {
            orders: createdOrders,
            userId: existing.userId,
          })
        }
      }
    }

    await statusHistoryService.record(
      'quote',
      existing.id,
      'sent',
      decision,
      existing.userId,
      decision === 'approved' ? 'Aprovado pelo cliente via link público' : 'Recusado pelo cliente via link público'
    )

    await auditService.log({
      userId: existing.userId,
      action: 'PATCH',
      module: 'orcamentos',
      entityId: existing.id,
      entityName: existing.number,
      details: `Orçamento ${existing.number} ${decision === 'approved' ? 'aprovado' : 'recusado'} pelo cliente via link público`,
      beforeValue: { status: 'sent' },
      afterValue: { status: decision },
    })

    return { status: decision, generatedProductionOrders: createdOrders, alreadyProcessed: false }
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
