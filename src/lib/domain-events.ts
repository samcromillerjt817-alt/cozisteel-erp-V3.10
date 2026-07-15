/**
 * Barramento de Eventos de Domínio (Fase 3, ADR-003) — em processo, síncrono, sem fila externa.
 * `publish()` aguarda cada handler em sequência: mesma semântica de erro e ordem que uma chamada
 * direta Service-a-Service já tinha antes desta fase (se um handler lançar, o erro propaga pro
 * publicador exatamente como propagaria de uma chamada direta).
 */

 
type EventHandler<T = any, R = any> = (payload: T) => Promise<R> | R

class DomainEventBus {
   
  private handlers = new Map<string, EventHandler<any, any>[]>()

  on<T, R = unknown>(eventName: string, handler: EventHandler<T, R>): void {
    const list = this.handlers.get(eventName) || []
    list.push(handler)
    this.handlers.set(eventName, list)
  }

  async publish<T, R = unknown>(eventName: string, payload: T): Promise<R[]> {
    const list = (this.handlers.get(eventName) || []) as EventHandler<T, R>[]
    const results: R[] = []
    for (const handler of list) {
      results.push(await handler(payload))
    }
    return results
  }
}

// Next.js/Turbopack pode reavaliar este módulo em "layers" de bundle diferentes
// (instrumentation vs. rotas de API) dentro do mesmo processo — cada reavaliação criaria
// uma instância própria de `DomainEventBus`, fazendo o registro de handlers em
// `instrumentation.ts` não aparecer pro lado que publica o evento. Mesmo padrão já usado
// pelo singleton do Prisma (`src/lib/db.ts`, `globalForPrisma`): guardar a instância em
// `globalThis` garante que todo mundo compartilha o mesmo barramento.
const globalForDomainEvents = globalThis as unknown as {
  domainEventBus: DomainEventBus | undefined
}

export const domainEvents = globalForDomainEvents.domainEventBus ?? new DomainEventBus()

// Ao contrário do singleton do Prisma, esta gravação NÃO é condicionada a
// `NODE_ENV !== 'production'`: a duplicação de módulo entre layers do bundler (instrumentation
// vs. rotas de API) acontece independente de ambiente, não é um artefato só de hot-reload em dev.
globalForDomainEvents.domainEventBus = domainEvents

export const DOMAIN_EVENTS = {
  ORCAMENTO_APROVADO: 'orcamento.aprovado',
  ORCAMENTO_CONVERTIDO_EM_PEDIDO_VENDA: 'orcamento.convertido_em_pedido_venda',
  REQUISICAO_APROVADA_PARA_COMPRA: 'requisicao.aprovada_para_compra',
  ORDEM_PRODUCAO_CRIADA: 'ordem_producao.criada',
  ORDEM_PRODUCAO_FINALIZADA: 'ordem_producao.finalizada',
  PRODUCAO_PARCIAL_REALIZADA: 'producao.parcial_realizada',
  REQUISICAO_CRIADA: 'requisicao.criada',
  PEDIDO_COMPRA_RECEBIDO: 'pedido_compra.recebido',
  FATURA_EMITIDA: 'fatura.emitida',
} as const

// ── Contratos de payload — um por evento, contrato compartilhado entre produtor e consumidor ──

export interface OrcamentoAprovadoPayload {
  quoteId: string
  quoteNumber: string
  userId: string
  items: Array<{ productId: string | null; description: string; quantity: number; unit: string; notes: string }>
}

export interface OrcamentoConvertidoEmPedidoVendaPayload {
  quote: {
    id: string
    clientId: string | null
    clientName: string
    clientCnpj: string
    subtotal: number
    discountTotal: number
    total: number
    paymentTerms: string
    deliveryTime: string
    notes: string
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
  userId: string
}

export interface RequisicaoAprovadaParaCompraPayload {
  requisitionId: string
  requisitionNumber: string
  userId: string
  items: Array<{ id: string; supplierId: string | null; materialId: string; quantity: number; unit: string; estimatedPrice: number }>
}

/** Emitido sem consumidor nesta fase — preparação para MRP/notificação futuros. */
export interface OrdemProducaoCriadaPayload {
  productionOrderId: string
  productionOrderNumber: string
  productId: string | null
  quantity: number
  userId: string
}

/** Consumido desde a Fase 12 (ADR-016, Subetapa 1/2) pela CostingService — a baixa de estoque em si
 * continua na transação atômica existente, o cálculo de custo é só notificado depois. */
export interface OrdemProducaoFinalizadaPayload {
  productionOrderId: string
  productionOrderNumber: string
  productId: string | null
  quantity: number
  /** ProductBatch criado nesta rodada (Fase 10, ADR-013) — `null` quando o produto não é
   * `lotControlled` (nenhum lote de saída, nada para a CostingService custear). */
  productBatchId: string | null
  userId: string
}

/**
 * Emitido a cada `produce()` que NÃO completa a OP (Fase 9, ADR-011). Quando a rodada completa a OP,
 * `ordem_producao.finalizada` é quem é emitido, não este. Consumido desde a Fase 12 (ADR-016,
 * Subetapa 1/2) pela CostingService, mesmo princípio de `productBatchId` do evento de finalização.
 */
export interface ProducaoParcialRealizadaPayload {
  productionOrderId: string
  productionOrderNumber: string
  productId: string | null
  quantityThisRound: number
  quantityCompleted: number
  quantityTotal: number
  productBatchId: string | null
  userId: string
}

/** Emitido sem consumidor nesta fase — preparação para MRP/notificação futuros. */
export interface RequisicaoCriadaPayload {
  requisitionId: string
  requisitionNumber: string
  userId: string
}

/** Consumido desde a Fase 12 (ADR-016, Subetapa 1/3) pela FinancialAccountService
 * (`upsertPayableFromPurchaseOrder` — recalcula o valor do título a partir do pedido, idempotente,
 * nunca duplica) — a entrada de estoque em si continua na transação atômica existente. */
export interface PedidoCompraRecebidoPayload {
  purchaseOrderId: string
  purchaseOrderNumber: string
  supplierId: string | null
  userId: string
}

/** Emitido pela InvoiceService ao faturar um Pedido de Venda (Fase 12, ADR-016, Subetapa 1/4) —
 * consumido pela FinancialAccountService para gerar o título a receber correspondente. */
export interface FaturaEmitidaPayload {
  invoiceId: string
  invoiceNumber: string
  salesOrderId: string
  total: number
  dueDate: Date
  userId: string
}
