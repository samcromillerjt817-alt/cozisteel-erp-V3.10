import { domainEvents, DOMAIN_EVENTS } from '@/lib/domain-events'
import type {
  OrcamentoAprovadoPayload,
  OrcamentoConvertidoEmPedidoVendaPayload,
  RequisicaoAprovadaParaCompraPayload,
  OrdemProducaoFinalizadaPayload,
  ProducaoParcialRealizadaPayload,
  PedidoCompraRecebidoPayload,
  FaturaEmitidaPayload,
} from '@/lib/domain-events'
import { productionOrderService } from '@/app/services/production-order.service'
import { salesOrderService } from '@/app/services/sales-order.service'
import { purchaseOrderService } from '@/app/services/purchase-order.service'
import { costingService } from '@/app/services/costing.service'
import { financialAccountService } from '@/app/services/financial-account.service'

/**
 * Composition root dos Eventos de Domínio (Fase 3, ADR-003): o único lugar que conhece os
 * produtores e consumidores dos 3 acoplamentos migrados. Chamado uma única vez, no startup do
 * servidor (`instrumentation.ts`) — nenhum Service produtor (`QuoteService`, `RequisitionService`)
 * importa os Services consumidores diretamente mais.
 */
let registered = false

export function registerDomainEventHandlers(): void {
  if (registered) return
  registered = true

  domainEvents.on(DOMAIN_EVENTS.ORCAMENTO_APROVADO, (payload: OrcamentoAprovadoPayload) =>
    productionOrderService.createFromApprovedQuote(payload.items, payload.quoteNumber, payload.userId)
  )

  domainEvents.on(DOMAIN_EVENTS.ORCAMENTO_CONVERTIDO_EM_PEDIDO_VENDA, (payload: OrcamentoConvertidoEmPedidoVendaPayload) =>
    salesOrderService.createFromQuote(payload.quote, payload.userId)
  )

  domainEvents.on(DOMAIN_EVENTS.REQUISICAO_APROVADA_PARA_COMPRA, (payload: RequisicaoAprovadaParaCompraPayload) =>
    purchaseOrderService.createFromRequisition(payload.requisitionId, payload.requisitionNumber, payload.items, payload.userId)
  )

  // Fase 12 (ADR-016, Subetapa 1) — primeiros consumidores destes 3 eventos, que existiam desde
  // fases anteriores "sem consumidor nesta fase" (preparação deliberada, ver os comentários em
  // `domain-events.ts`). Nenhum dos 3 produtores (ProductionOrderService/PurchaseOrderService)
  // precisou mudar para saber que o Financeiro existe — só os payloads ganharam `productBatchId`
  // (já disponível no runtime, só nunca antes exposto no contrato).

  domainEvents.on(DOMAIN_EVENTS.ORDEM_PRODUCAO_FINALIZADA, (payload: OrdemProducaoFinalizadaPayload) =>
    payload.productBatchId ? costingService.calculateAndPersistMaterialCost(payload.productBatchId) : undefined
  )

  domainEvents.on(DOMAIN_EVENTS.PRODUCAO_PARCIAL_REALIZADA, (payload: ProducaoParcialRealizadaPayload) =>
    payload.productBatchId ? costingService.calculateAndPersistMaterialCost(payload.productBatchId) : undefined
  )

  domainEvents.on(DOMAIN_EVENTS.PEDIDO_COMPRA_RECEBIDO, (payload: PedidoCompraRecebidoPayload) =>
    financialAccountService.upsertPayableFromPurchaseOrder(payload.purchaseOrderId, payload.userId)
  )

  domainEvents.on(DOMAIN_EVENTS.FATURA_EMITIDA, (payload: FaturaEmitidaPayload) =>
    financialAccountService.createReceivableFromInvoice(payload.invoiceId, payload.invoiceNumber, payload.total, payload.dueDate, payload.userId)
  )
}
