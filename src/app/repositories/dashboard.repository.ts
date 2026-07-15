import { db } from '@/lib/db'

// Repository do Dashboard (Fase 11, ADR-017) — só consultas, sem regra de negócio. Cresce um método
// por widget conforme cada Subetapa (2-6) implementa seu domínio; `buildPeriodFilter` é o único
// helper genérico desde a Subetapa 1.

export interface DateRangeFilter {
  gte?: Date
  lte?: Date
}

/**
 * Nunca escopar um widget histórico sem filtro de período (ADR-017 §12) — várias tabelas do domínio
 * (MrpSuggestion, ProductionOrderExecution, MaterialBatch/ProductBatch, StatusHistory, StockMovement,
 * AuditLog, Quote, SalesOrder) crescem sem purge. `undefined` quando nenhum limite é passado, para não
 * forçar uma cláusula `WHERE` vazia em consultas sem filtro de período (ex.: contagens de "estado
 * atual").
 */
export function buildPeriodFilter(from?: Date, to?: Date): DateRangeFilter | undefined {
  if (!from && !to) return undefined
  const filter: DateRangeFilter = {}
  if (from) filter.gte = from
  if (to) filter.lte = to
  return filter
}

class DashboardRepository {
  // ── Comercial (Subetapa 2) ────────────────────────────────────────────────

  async countQuotesByStatus(from?: Date, to?: Date) {
    const createdAt = buildPeriodFilter(from, to)
    return db.quote.groupBy({
      by: ['status'],
      where: createdAt ? { createdAt } : undefined,
      _count: { status: true },
    })
  }

  async countSalesOrdersByStatus(from?: Date, to?: Date) {
    const createdAt = buildPeriodFilter(from, to)
    return db.salesOrder.groupBy({
      by: ['status'],
      where: createdAt ? { createdAt } : undefined,
      _count: { status: true },
    })
  }

  async sumApprovedQuoteValue(from?: Date, to?: Date) {
    const createdAt = buildPeriodFilter(from, to)
    return db.quote.aggregate({
      where: { status: 'approved', ...(createdAt ? { createdAt } : {}) },
      _sum: { total: true },
      _avg: { total: true },
      _count: { _all: true },
    })
  }

  async countSalesOrdersInPeriod(from?: Date, to?: Date) {
    const createdAt = buildPeriodFilter(from, to)
    return db.salesOrder.aggregate({
      where: createdAt ? { createdAt } : undefined,
      _avg: { total: true },
      _count: { _all: true },
    })
  }

  async topClientsBySalesOrderValue(limit: number, from?: Date, to?: Date) {
    const createdAt = buildPeriodFilter(from, to)
    const grouped = await db.salesOrder.groupBy({
      by: ['clientId'],
      where: { clientId: { not: null }, ...(createdAt ? { createdAt } : {}) },
      _sum: { total: true },
      orderBy: { _sum: { total: 'desc' } },
      take: limit,
    })
    const clientIds = grouped.map((g) => g.clientId).filter((id): id is string => !!id)
    const clients = clientIds.length
      ? await db.client.findMany({ where: { id: { in: clientIds } }, select: { id: true, corporateName: true, tradeName: true } })
      : []
    const clientById = new Map(clients.map((c) => [c.id, c]))
    return grouped.map((g) => ({
      clientId: g.clientId,
      clientName: (g.clientId && (clientById.get(g.clientId)?.tradeName || clientById.get(g.clientId)?.corporateName)) || '-',
      total: g._sum.total || 0,
    }))
  }

  async topProductsBySalesOrderItems(limit: number, from?: Date, to?: Date) {
    const createdAt = buildPeriodFilter(from, to)
    const grouped = await db.salesOrderItem.groupBy({
      by: ['productId'],
      where: { productId: { not: null }, ...(createdAt ? { salesOrder: { createdAt } } : {}) },
      _sum: { quantity: true, total: true },
      orderBy: { _sum: { total: 'desc' } },
      take: limit,
    })
    const productIds = grouped.map((g) => g.productId).filter((id): id is string => !!id)
    const products = productIds.length
      ? await db.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true } })
      : []
    const productById = new Map(products.map((p) => [p.id, p]))
    return grouped.map((g) => ({
      productId: g.productId,
      productName: (g.productId && productById.get(g.productId)?.name) || '-',
      quantity: g._sum.quantity || 0,
      total: g._sum.total || 0,
    }))
  }

  async countActiveClientsAndProducts() {
    const [activeClients, inactiveClients, activeProducts, inactiveProducts] = await Promise.all([
      db.client.count({ where: { active: true } }),
      db.client.count({ where: { active: false } }),
      db.product.count({ where: { active: true } }),
      db.product.count({ where: { active: false } }),
    ])
    return { activeClients, inactiveClients, activeProducts, inactiveProducts }
  }

  /** Orçamentos ainda "em aberto" (não fechados) com validUntil preenchido — parse de data em app, `validUntil` é String. */
  async findOpenQuotesWithValidUntil() {
    return db.quote.findMany({
      where: { status: { in: ['draft', 'sent'] }, validUntil: { not: '' } },
      select: { id: true, number: true, validUntil: true, status: true },
    })
  }

  /** Pares createdAt/approvedAt de orçamentos já aprovados, para calcular tempo médio de aprovação. */
  async findApprovedQuoteTimings(from?: Date, to?: Date) {
    const createdAt = buildPeriodFilter(from, to)
    return db.quote.findMany({
      where: { approvedAt: { not: null }, ...(createdAt ? { createdAt } : {}) },
      select: { createdAt: true, approvedAt: true },
    })
  }

  /** Pares approvedAt (Orçamento) / createdAt (Pedido de Venda), para calcular tempo médio de conversão. */
  async findQuoteToSalesOrderTimings(from?: Date, to?: Date) {
    const createdAt = buildPeriodFilter(from, to)
    const orders = await db.salesOrder.findMany({
      where: createdAt ? { createdAt } : undefined,
      select: { createdAt: true, quote: { select: { approvedAt: true } } },
    })
    return orders.filter((o) => o.quote?.approvedAt).map((o) => ({ quoteApprovedAt: o.quote!.approvedAt!, salesOrderCreatedAt: o.createdAt }))
  }

  /** Histórico de transição de status de Orçamento — usado para tempo médio em cada status (widget caro). */
  async findQuoteStatusHistory(from?: Date, to?: Date) {
    const createdAt = buildPeriodFilter(from, to)
    return db.statusHistory.findMany({
      where: { entityType: 'quote', ...(createdAt ? { createdAt } : {}) },
      select: { entityId: true, fromStatus: true, toStatus: true, createdAt: true },
      orderBy: [{ entityId: 'asc' }, { createdAt: 'asc' }],
    })
  }

  async countQuotesByUser(from?: Date, to?: Date) {
    const createdAt = buildPeriodFilter(from, to)
    const grouped = await db.quote.groupBy({
      by: ['userId'],
      where: createdAt ? { createdAt } : undefined,
      _count: { userId: true },
    })
    const userIds = grouped.map((g) => g.userId)
    const users = userIds.length ? await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }) : []
    const userById = new Map(users.map((u) => [u.id, u]))
    return grouped.map((g) => ({ userId: g.userId, userName: userById.get(g.userId)?.name || '-', count: g._count.userId }))
  }

  async countNewClients(from?: Date, to?: Date) {
    const createdAt = buildPeriodFilter(from, to)
    return db.client.count({ where: createdAt ? { createdAt } : undefined })
  }

  // ── Produção / PCP (Subetapa 3) ───────────────────────────────────────────

  async countProductionOrdersByStatus(from?: Date, to?: Date) {
    const createdAt = buildPeriodFilter(from, to)
    return db.productionOrder.groupBy({ by: ['status'], where: createdAt ? { createdAt } : undefined, _count: { status: true } })
  }

  /** OPs abertas com dueDate preenchido — parse de data em app, `dueDate` é String (mesma limitação do ADR-007).
   * `quantity`/`quantityCompleted` incluídos para a severidade do alerta (ADR-019, Subetapa 7.2) considerar
   * tanto o atraso quanto a quantidade pendente, não só a contagem de OPs. */
  async findOpenProductionOrdersWithDueDate() {
    return db.productionOrder.findMany({
      where: { status: { in: ['planned', 'in_progress', 'paused'] }, dueDate: { not: '' } },
      select: { id: true, number: true, dueDate: true, quantity: true, quantityCompleted: true },
    })
  }

  /** OPs `in_progress` — WIP calculado em app (quantity - quantityCompleted), tabela pequena. */
  async findInProgressProductionOrders() {
    return db.productionOrder.findMany({ where: { status: 'in_progress' }, select: { quantity: true, quantityCompleted: true } })
  }

  /** OPs em aberto por produto — backlog calculado em app (quantity - quantityCompleted), marcado `expensive`. */
  async findOpenProductionOrdersByProduct() {
    const orders = await db.productionOrder.findMany({
      where: { status: { in: ['planned', 'in_progress', 'paused'] } },
      select: { productId: true, quantity: true, quantityCompleted: true },
    })
    const productIds = orders.map((o) => o.productId).filter((id): id is string => !!id)
    const products = productIds.length ? await db.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true } }) : []
    const productById = new Map(products.map((p) => [p.id, p]))
    return orders.map((o) => ({ productId: o.productId, productName: (o.productId && productById.get(o.productId)?.name) || '-', remaining: o.quantity - o.quantityCompleted }))
  }

  async countProductionOrdersByPriority(from?: Date, to?: Date) {
    const createdAt = buildPeriodFilter(from, to)
    return db.productionOrder.groupBy({ by: ['priority'], where: createdAt ? { createdAt } : undefined, _count: { priority: true } })
  }

  async countExecutionsByProductionOrder(from?: Date, to?: Date) {
    const createdAt = buildPeriodFilter(from, to)
    const grouped = await db.productionOrderExecution.groupBy({ by: ['productionOrderId'], where: createdAt ? { createdAt } : undefined, _count: { productionOrderId: true } })
    const orderIds = grouped.map((g) => g.productionOrderId)
    const orders = orderIds.length ? await db.productionOrder.findMany({ where: { id: { in: orderIds } }, select: { id: true, number: true } }) : []
    const orderById = new Map(orders.map((o) => [o.id, o]))
    return grouped.map((g) => ({ productionOrderId: g.productionOrderId, number: orderById.get(g.productionOrderId)?.number || '-', rounds: g._count.productionOrderId }))
  }

  /** `consumed` é estado terminal (ADR-012) — seguro incluir na distribuição. */
  async materialReservationCoverage() {
    const [byStatus, totals] = await Promise.all([
      db.materialReservation.groupBy({ by: ['status'], _count: { status: true } }),
      db.materialReservation.aggregate({ _sum: { quantityNeeded: true, quantityReserved: true, quantityShortfall: true } }),
    ])
    return { byStatus, totals }
  }

  /** Só reservas `status='partial'` (shortfall ativo agora) — usado pela severidade do alerta
   * `producao.cobertura-reserva` (ADR-019, Subetapa 7.2); `released`/`consumed` não representam
   * risco atual de produção, diferente da agregação histórica de `materialReservationCoverage()`. */
  async findActivePartialReservations() {
    return db.materialReservation.findMany({ where: { status: 'partial' }, select: { quantityNeeded: true, quantityShortfall: true } })
  }

  async countMrpSuggestionsByStatus(from?: Date, to?: Date) {
    const createdAt = buildPeriodFilter(from, to)
    return db.mrpSuggestion.groupBy({ by: ['status'], where: createdAt ? { createdAt } : undefined, _count: { status: true } })
  }

  async countMrpSuggestionsByType(from?: Date, to?: Date) {
    const createdAt = buildPeriodFilter(from, to)
    return db.mrpSuggestion.groupBy({ by: ['suggestionType'], where: createdAt ? { createdAt } : undefined, _count: { suggestionType: true } })
  }

  async findLatestMrpRun() {
    return db.mrpRun.findFirst({ orderBy: { executedAt: 'desc' } })
  }

  async sumBatchVolumeInPeriod(from?: Date, to?: Date) {
    const receivedAt = buildPeriodFilter(from, to)
    const producedAt = buildPeriodFilter(from, to)
    const [materialResult, productResult] = await Promise.all([
      db.materialBatch.aggregate({ where: receivedAt ? { receivedAt } : undefined, _sum: { quantityReceived: true } }),
      db.productBatch.aggregate({ where: producedAt ? { producedAt } : undefined, _sum: { quantityProduced: true } }),
    ])
    return { materialReceived: materialResult._sum.quantityReceived || 0, productProduced: productResult._sum.quantityProduced || 0 }
  }

  async countLotControlledAdoption() {
    const [materialsLotControlled, materialsTotal, productsLotControlled, productsTotal] = await Promise.all([
      db.material.count({ where: { lotControlled: true } }),
      db.material.count(),
      db.product.count({ where: { lotControlled: true } }),
      db.product.count(),
    ])
    return { materialsLotControlled, materialsTotal, productsLotControlled, productsTotal }
  }

  async countBomRevisionsByStatus() {
    return db.bomRevision.groupBy({ by: ['status'], _count: { status: true } })
  }

  // ── Estoque (Subetapa 3) ───────────────────────────────────────────────────

  async topMaterialsByStock(limit: number) {
    return db.material.findMany({ where: { active: true }, orderBy: { stockQty: 'desc' }, take: limit, select: { id: true, name: true, stockQty: true, minStockQty: true } })
  }

  async findLowStockMaterials() {
    const materials = await db.material.findMany({ where: { active: true }, select: { id: true, name: true, stockQty: true, minStockQty: true } })
    return materials.filter((m) => m.stockQty <= m.minStockQty)
  }

  async sumReservedOnOrderInProduction() {
    const [materialTotals, productTotals] = await Promise.all([
      db.material.aggregate({ _sum: { reservedQty: true, onOrderQty: true, inProductionQty: true } }),
      db.product.aggregate({ _sum: { reservedQty: true, onOrderQty: true, inProductionQty: true } }),
    ])
    return { materialTotals: materialTotals._sum, productTotals: productTotals._sum }
  }

  async countStockMovementsByType(from?: Date, to?: Date) {
    const createdAt = buildPeriodFilter(from, to)
    return db.stockMovement.groupBy({ by: ['type'], where: createdAt ? { createdAt } : undefined, _count: { type: true } })
  }

  async topConsumedMaterials(limit: number, from?: Date, to?: Date) {
    const createdAt = buildPeriodFilter(from, to)
    const grouped = await db.stockMovement.groupBy({
      by: ['materialId'],
      where: { type: 'OUT', materialId: { not: null }, ...(createdAt ? { createdAt } : {}) },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: limit,
    })
    const materialIds = grouped.map((g) => g.materialId).filter((id): id is string => !!id)
    const materials = materialIds.length ? await db.material.findMany({ where: { id: { in: materialIds } }, select: { id: true, name: true } }) : []
    const materialById = new Map(materials.map((m) => [m.id, m]))
    return grouped.map((g) => ({ materialId: g.materialId, materialName: (g.materialId && materialById.get(g.materialId)?.name) || '-', quantity: g._sum.quantity || 0 }))
  }

  /** Lotes dentro do horizonte, com `expiresAt`/`quantityAvailable` — a severidade do alerta (ADR-019,
   * Subetapa 7.2) precisa da proximidade real do vencimento, não só da contagem. */
  async findExpiringBatches(horizonDays: number) {
    const now = new Date()
    const horizon = new Date(now.getTime() + horizonDays * 24 * 60 * 60 * 1000)
    return db.materialBatch.findMany({
      where: { expiresAt: { gte: now, lte: horizon }, quantityAvailable: { gt: 0 } },
      select: { expiresAt: true, quantityAvailable: true },
    })
  }

  async sumValorizedStockQuantity() {
    const result = await db.materialBatch.aggregate({ _sum: { quantityAvailable: true } })
    return result._sum.quantityAvailable || 0
  }

  async countStockAdjustments(from?: Date, to?: Date) {
    const createdAt = buildPeriodFilter(from, to)
    return db.stockMovement.count({ where: { type: 'ADJUST', ...(createdAt ? { createdAt } : {}) } })
  }

  // ── Compras (Subetapa 4) ───────────────────────────────────────────────────

  async countRequisitionsByStatus(from?: Date, to?: Date) {
    const createdAt = buildPeriodFilter(from, to)
    return db.requisition.groupBy({ by: ['status'], where: createdAt ? { createdAt } : undefined, _count: { status: true } })
  }

  async countRequisitionsByTipo(from?: Date, to?: Date) {
    const createdAt = buildPeriodFilter(from, to)
    return db.requisition.groupBy({ by: ['tipo'], where: createdAt ? { createdAt } : undefined, _count: { tipo: true } })
  }

  async countRequisitionsByOriginModule(from?: Date, to?: Date) {
    const createdAt = buildPeriodFilter(from, to)
    return db.requisition.groupBy({ by: ['originModule'], where: createdAt ? { createdAt } : undefined, _count: { originModule: true } })
  }

  /**
   * ADR-009 — requisições `originModule='mrp'` NUNCA passam por atendimento por estoque
   * (`quantityFromStock` sempre 0 nelas, por regra de negócio, não por falta de saldo disponível).
   * Segmentar por origem é obrigatório aqui — sem isso o percentual atendido por estoque fica
   * sistematicamente subestimado, misturando "não atendeu" com "não podia atender por regra".
   */
  async sumRequisitionFulfillmentByOrigin(from?: Date, to?: Date) {
    const createdAt = buildPeriodFilter(from, to)
    const requisitions = await db.requisition.findMany({
      where: createdAt ? { createdAt } : undefined,
      select: { originModule: true, items: { select: { quantityFromStock: true, quantityToPurchase: true } } },
    })
    const byOrigin = new Map<string, { fromStock: number; toPurchase: number }>()
    for (const requisition of requisitions) {
      const acc = byOrigin.get(requisition.originModule) || { fromStock: 0, toPurchase: 0 }
      for (const item of requisition.items) {
        acc.fromStock += item.quantityFromStock
        acc.toPurchase += item.quantityToPurchase
      }
      byOrigin.set(requisition.originModule, acc)
    }
    return Array.from(byOrigin.entries()).map(([originModule, totals]) => ({ originModule, ...totals }))
  }

  /**
   * Só requisições cujo ciclo já concluiu (`status='ordered'`) — uma requisição ainda em draft/sent/
   * approved não tem "tempo de ciclo" real ainda, incluí-la distorceria a média com durações parciais
   * (decisão do usuário, aprovação da Subetapa 4).
   */
  async findCompletedRequisitionStatusHistory(from?: Date, to?: Date) {
    const createdAt = buildPeriodFilter(from, to)
    const completed = await db.requisition.findMany({ where: { status: 'ordered', ...(createdAt ? { createdAt } : {}) }, select: { id: true } })
    const ids = completed.map((r) => r.id)
    if (ids.length === 0) return []
    return db.statusHistory.findMany({
      where: { entityType: 'requisition', entityId: { in: ids } },
      select: { entityId: true, fromStatus: true, toStatus: true, createdAt: true },
      orderBy: [{ entityId: 'asc' }, { createdAt: 'asc' }],
    })
  }

  async countPurchaseOrdersByStatus(from?: Date, to?: Date) {
    const createdAt = buildPeriodFilter(from, to)
    return db.purchaseOrder.groupBy({ by: ['status'], where: createdAt ? { createdAt } : undefined, _count: { status: true } })
  }

  /** POs pendentes de aprovação + há quanto tempo cada uma entrou nesse status (via StatusHistory) —
   * a severidade do alerta `compras.aprovacoes-pendentes` (ADR-019, Subetapa 7.2) escala com o tempo
   * de espera, já que aprovação pendente bloqueia o fluxo de compras. */
  async findPendingApprovalAges() {
    const pending = await db.purchaseOrder.findMany({ where: { status: 'pending_approval' }, select: { id: true } })
    if (pending.length === 0) return []
    const ids = pending.map((p) => p.id)
    const history = await db.statusHistory.findMany({
      where: { entityType: 'purchase_order', entityId: { in: ids }, toStatus: 'pending_approval' },
      select: { entityId: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    })
    const enteredAt = new Map<string, Date>()
    for (const entry of history) {
      if (!enteredAt.has(entry.entityId)) enteredAt.set(entry.entityId, entry.createdAt) // desc → primeira ocorrência é a mais recente
    }
    return ids.map((id) => ({ id, enteredPendingApprovalAt: enteredAt.get(id) ?? null }))
  }

  /** Datas de transição de PO para cálculo de tempo médio por etapa + sampleSize (decisão da Subetapa 4). */
  async findPurchaseOrdersForStageTiming(from?: Date, to?: Date) {
    const createdAt = buildPeriodFilter(from, to)
    return db.purchaseOrder.findMany({
      where: createdAt ? { createdAt } : undefined,
      select: { createdAt: true, approvedAt: true, sentAt: true, confirmedAt: true, receivedAt: true },
    })
  }

  /**
   * Performance de fornecedor: só POs `status='received'` (finalizado, exclui cancelados) com
   * `receivedAt` preenchido e ao menos um item cuja cotação selecionada tenha `leadTimeDays` > 0
   * informado (decisão da Subetapa 4 — sem esses 3 critérios, o prazo prometido não é comparável).
   */
  async findSupplierLeadTimePerformance(from?: Date, to?: Date) {
    const createdAt = buildPeriodFilter(from, to)
    const orders = await db.purchaseOrder.findMany({
      where: { status: 'received', receivedAt: { not: null }, ...(createdAt ? { createdAt } : {}) },
      select: {
        supplierId: true,
        createdAt: true,
        receivedAt: true,
        items: { select: { requisitionItem: { select: { quotes: { where: { isSelected: true, leadTimeDays: { gt: 0 } }, select: { supplierId: true, leadTimeDays: true } } } } } },
      },
    })

    const bySupplier = new Map<string, { actualDays: number[]; promisedDays: number[] }>()
    for (const order of orders) {
      // O prazo prometido só é comparável se vier da cotação vencedora DO MESMO fornecedor deste PO —
      // uma cotação vencedora de outro fornecedor (item com múltiplos fornecedores cotados) não é o
      // prazo que este PO específico prometeu cumprir.
      const promised = order.items.flatMap((item) => (item.requisitionItem?.quotes || []).filter((q) => q.supplierId === order.supplierId).map((q) => q.leadTimeDays))
      if (promised.length === 0) continue // sem leadTimeDays informado (deste fornecedor) — não comparável
      const actualDays = (order.receivedAt!.getTime() - order.createdAt.getTime()) / (1000 * 60 * 60 * 24)
      const avgPromised = promised.reduce((sum, v) => sum + v, 0) / promised.length
      const acc = bySupplier.get(order.supplierId) || { actualDays: [], promisedDays: [] }
      acc.actualDays.push(actualDays)
      acc.promisedDays.push(avgPromised)
      bySupplier.set(order.supplierId, acc)
    }

    const supplierIds = Array.from(bySupplier.keys())
    const suppliers = supplierIds.length ? await db.supplier.findMany({ where: { id: { in: supplierIds } }, select: { id: true, corporateName: true, tradeName: true } }) : []
    const supplierById = new Map(suppliers.map((s) => [s.id, s]))

    return supplierIds.map((supplierId) => {
      const { actualDays, promisedDays } = bySupplier.get(supplierId)!
      const avgActual = Math.round((actualDays.reduce((a, b) => a + b, 0) / actualDays.length) * 10) / 10
      const avgPromised = Math.round((promisedDays.reduce((a, b) => a + b, 0) / promisedDays.length) * 10) / 10
      return {
        supplierId,
        supplierName: supplierById.get(supplierId)?.tradeName || supplierById.get(supplierId)?.corporateName || '-',
        avgPromised,
        avgActual,
        diff: Math.round((avgActual - avgPromised) * 10) / 10,
        sampleSize: actualDays.length,
      }
    })
  }

  async sumPurchaseOrderValueByStatus(from?: Date, to?: Date) {
    const createdAt = buildPeriodFilter(from, to)
    return db.purchaseOrder.groupBy({ by: ['status'], where: createdAt ? { createdAt } : undefined, _sum: { total: true } })
  }

  /**
   * Taxa de vitória = vitórias / participações (cotações em que o fornecedor participou), nunca sobre
   * o total de pedidos (decisão da Subetapa 4).
   */
  async supplierQuoteWinRate() {
    const [participations, wins] = await Promise.all([
      db.requisitionItemQuote.groupBy({ by: ['supplierId'], _count: { supplierId: true } }),
      db.requisitionItemQuote.groupBy({ by: ['supplierId'], where: { isSelected: true }, _count: { supplierId: true } }),
    ])
    const winsBySupplier = new Map(wins.map((w) => [w.supplierId, w._count.supplierId]))
    const supplierIds = participations.map((p) => p.supplierId)
    const suppliers = supplierIds.length ? await db.supplier.findMany({ where: { id: { in: supplierIds } }, select: { id: true, corporateName: true, tradeName: true } }) : []
    const supplierById = new Map(suppliers.map((s) => [s.id, s]))
    return participations.map((p) => {
      const winCount = winsBySupplier.get(p.supplierId) || 0
      const participationCount = p._count.supplierId
      return {
        supplierId: p.supplierId,
        supplierName: supplierById.get(p.supplierId)?.tradeName || supplierById.get(p.supplierId)?.corporateName || '-',
        participations: participationCount,
        wins: winCount,
        winRate: participationCount > 0 ? Math.round((winCount / participationCount) * 1000) / 10 : 0,
      }
    })
  }

  // ── Administrativo (Subetapa 5) ────────────────────────────────────────────

  /** Só usuários ativos (`active: true`) — decisão da Subetapa 5. */
  async countActiveUsersByRole() {
    return db.user.groupBy({ by: ['role'], where: { active: true }, _count: { role: true } })
  }

  async auditLogVolumeByModule(from?: Date, to?: Date) {
    const createdAt = buildPeriodFilter(from, to)
    return db.auditLog.groupBy({ by: ['module'], where: createdAt ? { createdAt } : undefined, _count: { module: true } })
  }

  /** Somente leitura — nenhuma lógica de negócio, `NumberSequence` já é o dado denormalizado real. */
  async findNumberSequences() {
    return db.numberSequence.findMany({ select: { documentType: true, prefix: true, suffix: true, nextNumber: true, digits: true } })
  }

  async findRecentPatchLogs(limit: number) {
    return db.patchLog.findMany({ orderBy: { createdAt: 'desc' }, take: limit, select: { fromVersion: true, toVersion: true, status: true, createdAt: true } })
  }
}

export const dashboardRepository = new DashboardRepository()
