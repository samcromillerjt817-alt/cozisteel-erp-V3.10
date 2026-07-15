# Catálogo de Eventos de Domínio

Documento de referência vivo — atualizar sempre que um evento for adicionado, removido ou ganhar um novo
consumidor. Para o histórico de decisões arquiteturais por trás desta infraestrutura, ver
[ADR-003](../adr/ADR-003-eventos-de-dominio.md) e [ADR-004](../adr/ADR-004-avaliacao-outbox-pattern.md).

Infraestrutura: `src/lib/domain-events.ts` (barramento + contratos de payload),
`src/lib/register-domain-event-handlers.ts` (composition root — único lugar que liga produtor a
consumidor), `src/instrumentation.ts` (registro no startup do servidor).

---

## `orcamento.aprovado`

| | |
|---|---|
| **Produtor** | `QuoteService.changeStatus()` |
| **Consumidor(es) atual(is)** | `ProductionOrderService.createFromApprovedQuote()` |
| **Momento do disparo** | Depois que a transição de status pra `approved` já foi persistida (`quoteRepository.updateStatus`) e o log de auditoria da mudança de status já foi gravado. Só dispara se houver pelo menos um item do orçamento vinculado a um produto cadastrado (`productId` não nulo) — itens avulsos não geram Ordem de Produção. |
| **Payload** (`OrcamentoAprovadoPayload`) | `quoteId`, `quoteNumber`, `userId`, `items[]` (só os itens com `productId` preenchido: `productId`, `description`, `quantity`, `unit`, `notes`) |
| **Regra de negócio associada** | Uma Ordem de Produção é criada por item (não uma OP consolidada). Cada OP nasce com `status: 'planned'`, prioridade `normal`, descrição indicando que foi gerada automaticamente a partir do orçamento. O resultado (`ProductionOrder[]` por handler) é devolvido pelo `publish()` e aparece na resposta da API como `generatedProductionOrders`. |

## `orcamento.convertido_em_pedido_venda`

| | |
|---|---|
| **Produtor** | `QuoteService.convertToSalesOrder()` |
| **Consumidor(es) atual(is)** | `SalesOrderService.createFromQuote()` |
| **Momento do disparo** | Depois de validar que o orçamento está `approved` e que ainda não existe um Pedido de Venda vinculado (`quote.salesOrder` nulo) — ação manual do usuário, não automática. |
| **Payload** (`OrcamentoConvertidoEmPedidoVendaPayload`) | `quote` (snapshot com id, dados do cliente, totais, condições de pagamento/entrega, itens completos), `userId` |
| **Regra de negócio associada** | Um Pedido de Venda por Orçamento (`SalesOrder.quoteId` é `@unique` no schema — nunca mais de uma conversão). Nasce com `status: 'open'`. Renomeado na Fase 3.1 de `orcamento.convertido_em_pedido` (nome antigo ambíguo — "pedido" de quê) para deixar explícito que o resultado é um Pedido de **Venda**. |

## `requisicao.aprovada_para_compra`

| | |
|---|---|
| **Produtor** | `RequisitionService.changeStatus()` |
| **Consumidor(es) atual(is)** | `PurchaseOrderService.createFromRequisition()` |
| **Momento do disparo** | Na transição de status pra `ordered` — só depois de validar que todo item da requisição tem uma cotação vencedora selecionada (`supplierId` preenchido). |
| **Payload** (`RequisicaoAprovadaParaCompraPayload`) | `requisitionId`, `requisitionNumber`, `userId`, `items[]` (`id`, `supplierId`, `materialId`, `quantity`, `unit`, `estimatedPrice`) |
| **Regra de negócio associada** | Os itens são agrupados por `supplierId` — um Pedido de Compra por fornecedor vencedor (não um PC por item). Cada PC nasce `status: 'draft'`, com `subtotal`/`total` somados dos itens daquele fornecedor. Renomeado na Fase 3.1 de `requisicao.pedido_feito` (misturava vocabulário de Requisição com Pedido de Compra) para nomear o fato do lado de quem produz o evento: a Requisição foi aprovada para virar compra. |

## `ordem_producao.criada`

| | |
|---|---|
| **Produtor** | `ProductionOrderService.create()` (criação manual) e `ProductionOrderService.createFromApprovedQuote()` (criação automática via `orcamento.aprovado`) |
| **Consumidor(es) atual(is)** | Nenhum |
| **Momento do disparo** | Imediatamente após a OP ser persistida, nos dois caminhos de criação. |
| **Payload** (`OrdemProducaoCriadaPayload`) | `productionOrderId`, `productionOrderNumber`, `productId`, `quantity`, `userId` |
| **Regra de negócio associada** | Nenhuma ainda — emitido como preparação para um futuro consumidor de MRP (sugestão automática de Requisição) ou notificação. Publicar sem assinante é um no-op; não muda comportamento observável. |

## `ordem_producao.finalizada`

| | |
|---|---|
| **Produtor** | `ProductionOrderService.produce()` (chamado tanto diretamente quanto por `update()`, que delega toda conclusão — parcial ou total — para `produce()` desde a Fase 9/ADR-011) |
| **Consumidor(es) atual(is)** | Nenhum |
| **Momento do disparo** | Depois que a transação atômica `ProductionOrderRepository.produceWithTx()` já commitou (consumo de material + liberação de reserva + entrada do produto acabado) **e** `result.isComplete` for verdadeiro (quantidade produzida atingiu o total da OP). O evento é uma notificação de um fato já consolidado — a baixa/entrada de estoque em si **não** passa por este evento, continua na transação atômica existente. **Correção (Fase 13, Lote 7)**: esta entrada citava `update()`/`completeAndConsumeStock()`, ambos superados pela Fase 9 (`completeAndConsumeStock()` foi removido do repository, substituído por `produceWithTx()` único). |
| **Payload** (`OrdemProducaoFinalizadaPayload`) | `productionOrderId`, `productionOrderNumber`, `productId`, `quantity`, `userId` |
| **Regra de negócio associada** | Nenhuma ainda — candidato natural a um futuro consumidor do Financeiro (custo de produção) na Fase 12. |

## `producao.parcial_realizada`

| | |
|---|---|
| **Produtor** | `ProductionOrderService.produce()` |
| **Consumidor(es) atual(is)** | Nenhum |
| **Momento do disparo** | Mesmo ponto de `ordem_producao.finalizada` (depois que `ProductionOrderRepository.produceWithTx()` já commitou), mas quando `result.isComplete` for **falso** — a rodada de produção não completou a quantidade total da OP. Os dois eventos são mutuamente exclusivos por chamada de `produce()`: cada rodada dispara exatamente um dos dois, nunca ambos. Introduzido na Fase 9 (ADR-011), nunca catalogado até esta correção (Fase 13, Lote 7). |
| **Payload** (`ProducaoParcialRealizadaPayload`) | `productionOrderId`, `productionOrderNumber`, `productId`, `quantityThisRound`, `quantityCompleted` (cumulativo, após esta rodada), `quantityTotal`, `userId` |
| **Regra de negócio associada** | Nenhuma ainda — registrado como o gancho natural para uma futura automação de reprocessamento do MRP após produção parcial (citado em ADR-011/ADR-012), sem consumidor implementado. |

## `requisicao.criada`

| | |
|---|---|
| **Produtor** | `RequisitionService.create()` |
| **Consumidor(es) atual(is)** | Nenhum |
| **Momento do disparo** | Imediatamente após a Requisição (com seus itens) ser persistida. |
| **Payload** (`RequisicaoCriadaPayload`) | `requisitionId`, `requisitionNumber`, `userId` |
| **Regra de negócio associada** | Nenhuma ainda — preparação para um futuro consumidor de notificação (ex: avisar o setor de compras). |

## `pedido_compra.recebido`

| | |
|---|---|
| **Produtor** | `PurchaseOrderService.receive()` |
| **Consumidor(es) atual(is)** | Nenhum |
| **Momento do disparo** | Depois que a transação atômica `PurchaseOrderRepository.receiveItems()` já commitou (quantidade recebida por item + entrada de estoque + recálculo de status do pedido). Notificação de um fato já consolidado — a entrada de estoque em si **não** passa por este evento. |
| **Payload** (`PedidoCompraRecebidoPayload`) | `purchaseOrderId`, `purchaseOrderNumber`, `supplierId`, `userId` |
| **Regra de negócio associada** | Nenhuma ainda — candidato a um futuro consumidor do Financeiro (contas a pagar ao fornecedor) na Fase 12. |

---

## Convenção de nomenclatura (fixada na Fase 3.1)

`dominio.fato_no_passado`, minúsculo, português — consistente com o resto do vocabulário do domínio
(models, módulos RBAC, mensagens de erro). Todo nome representa um fato que já aconteceu, nunca um
comando (nenhum evento tem forma imperativa). Dois nomes foram corrigidos nesta fase por ambiguidade —
ver tabela acima.

## O que NÃO existe ainda (por decisão, ver ADR-003/ADR-004)

- `estoque.entrada` genérico — os 3 pontos de escrita de `StockMovement` (ajuste manual, conclusão de OP,
  recebimento de PC) permanecem sem um evento comum; unificá-los é pré-requisito, não decidido ainda.
- Qualquer persistência de evento (Outbox Pattern) — avaliado no ADR-004, não implementado.
- Qualquer fila externa (Redis, RabbitMQ, etc.).
