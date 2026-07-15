import { productionOrderRepository } from '@/app/repositories/production-order.repository'
import { bomRevisionRepository } from '@/app/repositories/bom-revision.repository'
import { bomLineRepository } from '@/app/repositories/bom-line.repository'
import { productMaterialRepository } from '@/app/repositories/product-material.repository'
import { numberingService } from '@/app/services/numbering.service'
import { materialReservationService } from '@/app/services/material-reservation.service'
import { reservationReconciliationService } from '@/app/services/reservation-reconciliation.service'
import { statusHistoryService } from '@/app/services/status-history.service'
import { NotFoundException, BadRequestException } from '@/app/exceptions'
import { checkTransition } from '@/lib/status-machine'
import { domainEvents, DOMAIN_EVENTS } from '@/lib/domain-events'
import type { OrdemProducaoCriadaPayload, OrdemProducaoFinalizadaPayload, ProducaoParcialRealizadaPayload } from '@/lib/domain-events'
import { formatDate } from '@/lib/format'

interface ConsumptionLine {
  lineType: string
  materialId: string | null
  componentProductId: string | null
  quantity: number
  scrapPct: number
}

export interface ListProductionOrdersInput {
  status?: string
  search?: string
  page: number
  limit: number
}

/**
 * Transições permitidas da Ordem de Produção (ADR-002, confirmado com o usuário em 2026-07-09).
 * `planned → completed` direto é permitido de propósito (preserva o fluxo atual — nada força
 * passar por `in_progress`). `completed`/`cancelled` são terminais, sem reversão de estoque.
 */
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  planned: ['in_progress', 'completed', 'cancelled'],
  in_progress: ['paused', 'completed', 'cancelled'],
  paused: ['in_progress', 'cancelled'],
  completed: [],
  cancelled: [],
}

interface ProductionOrderRecord {
  id: string
  number: string
  status: string
  date: string
  dueDate: string
  productId: string | null
  productName: string
  quantity: number
  quantityCompleted: number
  bomRevisionId: string | null
  unit: string
  priority: string
  description: string
  notes: string
   
  product: any
}

interface QuoteItemForProduction {
  productId: string | null
  description: string
  quantity: number
  unit: string
  notes: string
}

class ProductionOrderService {
  async list({ status, search, page, limit }: ListProductionOrdersInput) {
    const where: Record<string, unknown> = {}
    if (status) where.status = status
    if (search) {
      where.OR = [
        { number: { contains: search } },
        { productName: { contains: search } },
        { description: { contains: search } },
      ]
    }
    const { data, total } = await productionOrderRepository.findManyPaginated(where, (page - 1) * limit, limit)
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) }
  }

  async getById(id: string) {
    const order = await productionOrderRepository.findByIdDetailed(id)
    if (!order) throw new NotFoundException('Ordem de produção não encontrada')
    return order
  }

   
  async create(body: Record<string, any>, userId: string) {
    const number = await numberingService.getNextNumber('op')

    // Congela a revisão de engenharia liberada do produto no momento da criação (Fase 5, ADR-006)
    // — se não houver nenhuma (produto sem engenharia formal ainda), a OP segue sem
    // `bomRevisionId`, comportamento idêntico ao de antes desta fase.
    const bomRevisionId = body.productId ? await this.findActiveBomRevisionId(body.productId) : null

    const order = (await productionOrderRepository.createWithIncludes({
      number,
      status: body.status || 'planned',
      date: body.date || new Date().toLocaleDateString('pt-BR'),
      dueDate: body.dueDate || '',
      productId: body.productId || null,
      productName: body.productName || '',
      quantity: Number(body.quantity || 1),
      unit: body.unit || 'UN',
      priority: body.priority || 'normal',
      description: body.description || '',
      notes: body.notes || '',
      userId,
      salesOrderId: body.salesOrderId || null,
      bomRevisionId,
    })) as { id: string; number: string; productId: string | null; quantity: number }

    // Emitido sem consumidor nesta fase (ADR-003) — preparação para MRP/notificação futuros.
    await domainEvents.publish<OrdemProducaoCriadaPayload, void>(DOMAIN_EVENTS.ORDEM_PRODUCAO_CRIADA, {
      productionOrderId: order.id,
      productionOrderNumber: order.number,
      productId: order.productId,
      quantity: order.quantity,
      userId,
    })

    // Reserva de material (Fase 5, ADR-006) — reserva o que der do saldo disponível; reserva
    // parcial ou até zero é normal e nunca impede a OP de existir.
    await materialReservationService.reserveForProductionOrder(order.id, userId)

    return order
  }

  private async findActiveBomRevisionId(productId: string): Promise<string | null> {
    const revision = (await bomRevisionRepository.findActiveByProduct(productId)) as { id: string } | null
    return revision?.id ?? null
  }

   
  async update(id: string, body: Record<string, any>, userId: string) {
    const target = (await productionOrderRepository.findByIdWithProductMaterials(id)) as ProductionOrderRecord | null
    if (!target) throw new NotFoundException('Ordem de produção não encontrada')

    const newStatus = body.status || target.status

    // checkTransition só roda quando o status realmente muda — este PUT também edita campos
    // normais (produto, quantidade, notas...) sem intenção de trocar status, já que não existe
    // uma rota /status dedicada para este domínio. Um PUT que reenvia o status atual (edição de
    // campo comum) não é uma transição e não deve passar pela máquina de estados.
    if (newStatus !== target.status) {
      const transitionError = checkTransition(target.status, newStatus, ALLOWED_TRANSITIONS)
      if (transitionError) throw new BadRequestException(transitionError)
      await statusHistoryService.record('production_order', id, target.status, newStatus, userId)
    }

    // Só dispara a baixa de estoque na TRANSIÇÃO para "completed" (evita duplicar se já estava concluída)
    const isCompletingNow = newStatus === 'completed' && target.status !== 'completed'
    // Só libera reserva na TRANSIÇÃO para "cancelled" (Fase 5, ADR-006) — idempotente por conta
    // própria (releaseForProductionOrder não faz nada se já não houver reserva ativa).
    const isCancellingNow = newStatus === 'cancelled' && target.status !== 'cancelled'

    // status NÃO entra aqui — na transição para "completed", quem decide o status é produce()
    // (Fase 9, ADR-011: único ponto de entrada, nunca duas implementações de conclusão).
    const newData: Record<string, unknown> = {
      date: body.date || target.date,
      dueDate: body.dueDate || target.dueDate,
      productId: body.productId ?? target.productId,
      productName: body.productName || target.productName,
      quantity: Number(body.quantity ?? target.quantity),
      unit: body.unit || target.unit,
      priority: body.priority || target.priority,
      description: body.description || target.description,
      notes: body.notes || target.notes,
    }

    if (isCompletingNow && target.productId) {
      // "Concluir" sempre significa "produzir o que resta" — mesma implementação de
      // produce(), nunca uma segunda lógica de consumo/entrada/liberação de reserva.
      const remaining = target.quantity - target.quantityCompleted
      const updated = await this.produce(id, remaining, userId, { additionalFields: newData })
      return { ...(updated as object), stockConsumed: true }
    }

    const updated = await productionOrderRepository.updateFields(id, { ...newData, status: newStatus })

    if (isCancellingNow) {
      await materialReservationService.releaseForProductionOrder(id, userId, `Ordem de Produção ${target.number} cancelada`)
    }

    return { ...(updated as object), stockConsumed: false }
  }

  /**
   * Único ponto de entrada de produção (Fase 9, ADR-011) — parcial ou total. `update()` (conclusão
   * direta) delega para cá; uma chamada explícita com uma quantidade menor que o restante registra
   * produção parcial. Em ambos os casos: consumo proporcional (via `BomLine` da revisão congelada,
   * ou `ProductMaterial` herdado se a OP não tiver `bomRevisionId`), liberação proporcional da
   * reserva correspondente, entrada proporcional do produto acabado — e a OP só vira "completed"
   * quando `quantityCompleted` atinge `quantity`.
   */
  async produce(
    id: string,
    quantityThisRound: number,
    userId: string,
    options?: { clientRequestId?: string; additionalFields?: Record<string, unknown> }
  ) {
    const order = (await productionOrderRepository.findByIdWithProductMaterials(id)) as
      | (ProductionOrderRecord & { product: { materials: Array<{ materialId: string; quantity: number; scrapPct: number }> } | null })
      | null
    if (!order) throw new NotFoundException('Ordem de produção não encontrada')

    if (!['planned', 'in_progress', 'paused'].includes(order.status)) {
      throw new BadRequestException(`Não é possível registrar produção numa OP com status "${order.status}"`)
    }
    if (quantityThisRound <= 0) {
      throw new BadRequestException('Quantidade produzida deve ser maior que zero')
    }
    const outstanding = order.quantity - order.quantityCompleted
    if (quantityThisRound > outstanding) {
      throw new BadRequestException(`Quantidade produzida (${quantityThisRound}) excede o saldo restante da OP (${outstanding})`)
    }

    const lines = await this.resolveConsumptionLines(order)

    // Puramente computacional, sem transação (ADR-012) — calculado uma única vez por chamada de
    // produce(), antes de abrir a transação; produceWithTx() só aplica o resultado, nunca recalcula.
    const releaseTargets = await reservationReconciliationService.resolveReleaseTargets(lines, quantityThisRound)

    const result = await productionOrderRepository.produceWithTx(
      order,
      lines,
      releaseTargets,
      quantityThisRound,
      userId,
      options?.clientRequestId,
      options?.additionalFields
    )

    if (result.alreadyProcessed) return result.order

    if (result.isComplete) {
      // Emitido depois que a transação já foi commitada — notificação de um fato que já
      // aconteceu, sem consumidor nesta fase (ADR-003). A baixa/entrada de estoque em si continua
      // na transação atômica existente, não se move para dentro de um handler de evento.
      await domainEvents.publish<OrdemProducaoFinalizadaPayload, void>(DOMAIN_EVENTS.ORDEM_PRODUCAO_FINALIZADA, {
        productionOrderId: order.id,
        productionOrderNumber: order.number,
        productId: order.productId,
        quantity: order.quantity,
        productBatchId: result.productBatch?.id ?? null,
        userId,
      })
    } else {
      await domainEvents.publish<ProducaoParcialRealizadaPayload, void>(DOMAIN_EVENTS.PRODUCAO_PARCIAL_REALIZADA, {
        productionOrderId: order.id,
        productionOrderNumber: order.number,
        productId: order.productId,
        quantityThisRound,
        quantityCompleted: order.quantityCompleted + quantityThisRound,
        quantityTotal: order.quantity,
        productBatchId: result.productBatch?.id ?? null,
        userId,
      })
    }

    return result.order
  }

  /**
   * Resolve as linhas de consumo de uma OP: `BomLine` da revisão CONGELADA (`bomRevisionId`) quando
   * existir — nunca a revisão ativa agora, mesmo princípio já usado pela Reserva (ADR-006) — ou a
   * receita viva `ProductMaterial`, comportamento herdado para produto sem engenharia formal.
   * Consumo é sempre de UM nível só: um componente tipo "component" (subconjunto) é consumido como
   * unidade pronta do próprio estoque dele, nunca explodindo nas matérias-primas dele — essas já
   * foram consumidas quando a OP daquele subconjunto foi produzida separadamente.
   */
  private async resolveConsumptionLines(order: {
    productId: string | null
    bomRevisionId: string | null
    product: { materials: Array<{ materialId: string; quantity: number; scrapPct: number }> } | null
  }): Promise<ConsumptionLine[]> {
    if (order.bomRevisionId) {
      const lines = (await bomLineRepository.findManyByRevision(order.bomRevisionId)) as Array<{
        lineType: string
        materialId: string | null
        componentProductId: string | null
        quantity: number
        scrapPct: number
      }>
      return lines.map((l) => ({
        lineType: l.lineType,
        materialId: l.materialId,
        componentProductId: l.componentProductId,
        quantity: l.quantity,
        scrapPct: l.scrapPct,
      }))
    }

    if (!order.productId) return []
    const recipe =
      order.product?.materials ??
      ((await productMaterialRepository.findManyByProduct(order.productId)) as Array<{ materialId: string; quantity: number; scrapPct: number }>)
    return recipe.map((pm) => ({
      lineType: 'material',
      materialId: pm.materialId,
      componentProductId: null,
      quantity: pm.quantity,
      scrapPct: pm.scrapPct,
    }))
  }

  async delete(id: string) {
    const order = (await productionOrderRepository.findById(id)) as { id: string; quantityCompleted: number } | null
    if (!order) throw new NotFoundException('Ordem de produção não encontrada')
    // Achado de integridade (verificação pós-Fase 12): sem esta guarda, excluir uma OP que já produziu
    // cascateia a exclusão dos `ProductBatch` gerados (perdendo rastreabilidade de lote de estoque já
    // físico) sem nunca reverter o incremento correspondente em `Product.stockQty` — corrupção
    // silenciosa de saldo. Mesmo princípio já aplicado a `purchaseOrderService.delete()`.
    if (order.quantityCompleted > 0) {
      throw new BadRequestException('Não é possível excluir uma ordem de produção que já teve produção registrada')
    }
    await productionOrderRepository.delete(id)
    return { success: true }
  }

  /**
   * Gera uma OP por item (com produto vinculado) de um Orçamento recém-aprovado.
   * Chamada pelo QuoteService (Service-a-Service) — item "avulso" sem productId é
   * ignorado antes de chegar aqui, pois não há o que produzir via OP.
   */
  async createFromApprovedQuote(items: QuoteItemForProduction[], quoteNumber: string, userId: string) {
    const created = []
    for (const item of items) {
      const number = await numberingService.getNextNumber('op')
      const bomRevisionId = item.productId ? await this.findActiveBomRevisionId(item.productId) : null
      const order = (await productionOrderRepository.create({
        number,
        status: 'planned',
        date: formatDate(new Date()),
        productId: item.productId,
        productName: item.description,
        quantity: item.quantity,
        unit: item.unit,
        priority: 'normal',
        description: `Gerada automaticamente a partir do orçamento ${quoteNumber} (aprovado)`,
        notes: item.notes,
        userId,
        bomRevisionId,
      })) as { id: string; number: string; productId: string | null; quantity: number }
      created.push(order)

      // Emitido sem consumidor nesta fase (ADR-003) — preparação para MRP/notificação futuros.
      await domainEvents.publish<OrdemProducaoCriadaPayload, void>(DOMAIN_EVENTS.ORDEM_PRODUCAO_CRIADA, {
        productionOrderId: order.id,
        productionOrderNumber: order.number,
        productId: order.productId,
        quantity: order.quantity,
        userId,
      })

      // Reserva de material (Fase 5, ADR-006) — mesma regra do create() manual.
      await materialReservationService.reserveForProductionOrder(order.id, userId)
    }
    return created
  }
}

export const productionOrderService = new ProductionOrderService()
