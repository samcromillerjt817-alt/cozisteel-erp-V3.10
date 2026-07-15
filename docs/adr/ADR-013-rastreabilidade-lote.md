# ADR-013 — Rastreabilidade por Lote (Fase 10)

- **Status**: **Todas as 4 subetapas implementadas e verificadas — 150/150 testes passando. Fase 10
  (Rastreabilidade por Lote) CONCLUÍDA.** Compras cria/incrementa `MaterialBatch` no recebimento;
  Produção gera `ProductBatch`/consome via FIFO/grava `BatchConsumption`; consultas de rastreabilidade
  forward/backward com profundidade arbitrária, sem rota de API ainda (avaliação crítica registrada
  na Subetapa 4, abaixo, antes de qualquer exposição futura).
- **Data**: 2026-07-10
- **Depende de**: [ADR-010 — Aprovação de Compras](./ADR-010-aprovacao-compras.md) (`PurchaseOrder.
  receive()`, ponto de entrada de material novo em estoque); [ADR-011 — Produção Parcial](./ADR-011-producao-parcial.md)
  (`produce()`/`ProductionOrderExecution`, ponto de consumo/geração por rodada); [ADR-012 — Reconciliação
  de Reserva Multinível](./ADR-012-reconciliacao-reserva-multinivel.md) (`releaseTargets`, já calcula
  exatamente QUAL material e QUANTO é consumido em qualquer profundidade numa rodada — ponto de entrada
  natural para adicionar "de qual lote"); [ADR-006 — Reserva de Material](./ADR-006-reserva-de-material.md)
  (multinível, preservada, não afetada por esta fase)
- **Escopo do roadmap (Fase 10)**: "rastreabilidade de lote (bidirecional — recebimento de compra → lote
  → consumo em produção)"

## Contexto

Hoje o sistema não tem NENHUM conceito de lote. `Material.stockQty`/`Product.stockQty` são saldos
agregados únicos — um Material com 500kg em estoque pode ter vindo de 3 recebimentos de fornecedores
diferentes, em datas diferentes, e o sistema não distingue nenhum deles entre si. Uma vez que uma OP
consome 200kg desse material, não há registro de QUAL parte física (de qual recebimento) foi
efetivamente usada.

Rastreabilidade de lote resolve duas perguntas que hoje são impossíveis de responder:

- **Para frente** (forward): "este lote de matéria-prima X, recebido do Fornecedor Y na data Z, foi
  usado em quais Ordens de Produção? Que lotes de produto acabado saíram dele?"
- **Para trás** (backward): "este lote de produto acabado, entregue ao Cliente W, foi produzido com
  quais lotes de matéria-prima? De quais fornecedores e recebimentos?"

Isso é tipicamente exigido por conformidade regulatória (recall de produto, rastreamento de não-
conformidade até a origem) e é o motivo pelo qual o roadmap descreve a rastreabilidade como
explicitamente **bidirecional**.

## 1. Estado atual — levantamento

- **`Material`/`Product`**: `stockQty` é um único número agregado (`Float`). Sem nenhuma dimensão de
  lote, data de validade, ou origem física.
- **Entrada de material** (`PurchaseOrder.receive()` → `PurchaseOrderRepository.receiveItems()`):
  incrementa `Material.stockQty` diretamente, por item recebido, sem nenhum dado de lote — `data.items`
  hoje só carrega `{ purchaseOrderItemId, quantityReceived }` (`receivePurchaseOrderSchema`).
- **Consumo em produção** (`ProductionOrderService.produce()` → `produceWithTx()`): decrementa
  `Material.stockQty`/`Product.stockQty` (consumo físico, um nível, ADR-011) e agora também reconcilia
  `MaterialReservation` em qualquer profundidade via `releaseTargets` (ADR-012) — mas em NENHUM ponto
  seleciona ou registra de qual parcela física (lote) a quantidade consumida saiu. `releaseTargets` já
  sabe, com exatidão, "quanto de cada material/produto-folha esta rodada consome" — é exatamente essa
  informação que precisaria ganhar uma dimensão de lote.
- **Entrada de produto acabado** (mesma transação de `produceWithTx()`): incrementa `Product.stockQty`
  pela quantidade da rodada (`quantityThisRound`) — sem nenhum registro de que aquela produção específica
  constitui um "lote" distinto do que já existia em estoque.
- **`StockMovement`**: já é o ledger de auditoria de TODAS as alterações de saldo (`IN`/`OUT`/`ADJUST`/
  `RESERVE`/`RELEASE`), com `referenceType`/`referenceId` apontando para o documento de origem
  (Requisição/OP/Pedido de Compra) — mas sem nenhuma coluna de lote. É o candidato natural a também
  carregar a dimensão de lote quando ela existir, em vez de duplicar um "histórico de lote" paralelo.
- **`ProductionOrderExecution`** (ADR-011): já é o registro append-only, um por rodada de produção
  parcial — ponto de ancoragem natural para "quais lotes de matéria-prima esta rodada específica
  consumiu, e qual lote de produto ela gerou", já que uma rodada é exatamente a unidade atômica onde
  consumo e geração acontecem juntos hoje.
- **MRP** (`mrp-calculation.service.ts`): opera inteiramente em saldo agregado (`stockQty`/`reservedQty`)
  — nenhum conceito de lote hoje, nenhuma necessidade identificada de mudar isso nesta fase (ver Impactos).

## 2. O que muda — visão geral proposta

Duas novas entidades, simétricas:

- **`MaterialBatch`** — um lote de matéria-prima, criado no RECEBIMENTO de um Pedido de Compra
  (`PurchaseOrderItem` → quantidade recebida vira um novo lote, ou incrementa um lote existente se o
  fornecedor reenviar o mesmo número de lote). Carrega: material, fornecedor, número do lote (do
  fornecedor OU gerado internamente se o fornecedor não informar), data de recebimento, validade
  (opcional), quantidade recebida, quantidade ainda disponível (consumida parcialmente ao longo do
  tempo), referência ao Pedido de Compra de origem.
- **`ProductBatch`** — um lote de produto acabado, criado na PRODUÇÃO (cada rodada de `produce()`, ou
  cada OP inteira — ver seção de Validação). Carrega: produto, quantidade produzida, data de produção,
  referência à Ordem de Produção/execução de origem.
- **`BatchConsumption`** (tabela de ligação, N:N) — "esta produção consumiu X unidades do `MaterialBatch`
  Y" — é o elo que faz a rastreabilidade ser bidirecional: a partir de um `MaterialBatch`, encontrar todos
  os `BatchConsumption` dele → todas as OPs/execuções que o usaram → todos os `ProductBatch` gerados por
  elas. A partir de um `ProductBatch`, o caminho inverso.

## 3. Pontos que precisam de validação do usuário antes do ADR ser fechado

### 3.1 Granularidade — Material só, ou Material + Produto?

Rastreabilidade **bidirecional** (explícita no roadmap) exige as duas pontas: sem `ProductBatch`, não é
possível responder "que lote de produto saiu deste lote de matéria-prima" — só a metade "backward"
funcionaria. Recomendo os dois lados desde o início, não uma "Fase 10a/10b" separada, porque uma
rastreabilidade só-para-trás não cumpre o requisito bidirecional do roadmap.

### 3.2 Granularidade da produção: um `ProductBatch` por rodada, ou um por OP inteira?

- **Por rodada** (cada chamada de `produce()`, mesmo parcial, gera seu próprio lote de saída): mais
  fiel à realidade física (produção de terça-feira é fisicamente distinta da de quinta), mas gera muitos
  lotes pequenos para uma mesma OP.
- **Por OP inteira** (todas as rodadas de uma mesma OP alimentam o MESMO `ProductBatch`, que cresce a
  cada rodada até a OP completar): mais simples de gerenciar no dia a dia, mas mistura fisicamente
  material que pode ter sido produzido em datas/turnos diferentes sob o mesmo "lote".

Ponto de ancoragem já existente que favorece a opção "por rodada": `ProductionOrderExecution` (ADR-011)
já é exatamente um registro por rodada — reaproveitar essa granularidade evita inventar uma unidade nova.

### 3.3 Estratégia de consumo de lote de matéria-prima: FIFO, FEFO, ou seleção manual?

Quando uma rodada de produção precisa de 50kg de um material que existe em 3 lotes diferentes (lotes
antigos e novos, com ou sem validade), como decidir de qual(is) lote(s) tirar os 50kg?

- **FIFO** (First In, First Out — consome o lote mais antigo primeiro): simples, automático, adequado
  quando não há preocupação com validade.
- **FEFO** (First Expired, First Out — consome o lote com validade mais próxima primeiro): mais correto
  quando o material tem validade (ex.: resinas, tintas, adesivos com prazo) — precisa do campo de
  validade preenchido para funcionar; cai para FIFO quando não há validade cadastrada.
- **Seleção manual** (o operador escolhe o lote no momento de registrar a produção): mais fiel ao chão de
  fábrica real (às vezes o operador literalmente pega de um palete específico), mas exige UI dedicada e
  não pode ser 100% automático.

Isso também determina se `produce()` precisa de um novo parâmetro opcional (lote(s) escolhido(s)
manualmente) com fallback automático (FIFO/FEFO) quando não informado.

### 3.4 Lote é obrigatório para todo Material/Product, ou opt-in por item?

Nem todo material precisa de controle de lote (parafusos genéricos, por exemplo, vs. resina química com
validade). Seguindo o mesmo padrão já usado em `Product.productType` (Fase 4) e no `Tipo` de Requisição
(Fase 7) — um flag `controlaLote: Boolean` (nome a definir) por `Material`/`Product`, permitindo adoção
gradual sem forçar todo o cadastro existente a ganhar lotes desde o primeiro dia.

### 3.5 Migração do estoque já existente

Todo `stockQty` atual não tem lote nenhum. Proposta: para cada Material/Product com `controlaLote =
true` e `stockQty > 0` no momento em que o controle é ativado, criar um `MaterialBatch`/`ProductBatch`
de abertura ("saldo inicial, sem rastreabilidade anterior", número de lote gerado internamente, sem
fornecedor/OP de origem) preservando a soma agregada — nenhuma perda de saldo, só uma origem
"desconhecida" explícita para o que já existia.

### 3.6 Confirmação do ponto de integração com Consumo/Reconciliação (ADR-011/012)

Proposta técnica (a confirmar): a seleção de lote acontece DENTRO da mesma transação de `produceWithTx()`,
como uma etapa adicional lendo `releaseTargets`/`lines` já calculados (nenhuma travessia de árvore nova) —
para cada material/quantidade já identificado por `releaseTargets`, resolve o(s) `MaterialBatch`
correspondente(s) (FIFO/FEFO/manual) e grava `BatchConsumption`. Reaproveita a MESMA disciplina de "fonte
única de verdade" já estabelecida no ADR-012 (nenhum segundo cálculo de quanto é consumido, só decide DE
ONDE).

### 3.7 Testes necessários (lista preliminar, a expandir após a validação acima)

- Recebimento de Pedido de Compra cria `MaterialBatch` corretamente (com e sem número de lote informado
  pelo fornecedor).
- Consumo em produção decrementa o(s) lote(s) corretos, respeitando a estratégia escolhida (FIFO/FEFO/
  manual).
- Consumo que atravessa MÚLTIPLOS lotes numa única rodada (lote A não tem o suficiente, completa do lote
  B) — soma correta, sem negativo em nenhum lote.
- Rastreabilidade forward: dado um `MaterialBatch`, encontrar todos os `ProductBatch` que dependem dele.
- Rastreabilidade backward: dado um `ProductBatch`, encontrar todos os `MaterialBatch` de origem.
- Migração de saldo existente preserva a soma agregada exatamente.
- Compatibilidade total: Material/Product com `controlaLote = false` continua funcionando exatamente
  como hoje, sem nenhum `MaterialBatch`/`ProductBatch` envolvido.
- Estrutura multinível (Mesa→Estrutura→Tubo, ADR-012): rastreabilidade de lote de Tubo precisa aparecer
  corretamente associada ao `ProductBatch` de Mesa, mesmo Tubo sendo consumido indiretamente via
  reconciliação — a confirmar como parte do desenho técnico após a validação acima.

## Decisões validadas com o usuário (2026-07-10)

| Ponto | Decisão |
|---|---|
| Granularidade | **Material + Produto** — `MaterialBatch` e `ProductBatch`, cumprindo bidirecionalidade desde o início |
| Granularidade da produção | **Um `ProductBatch` por rodada** de `produce()`, reaproveitando `ProductionOrderExecution` (ADR-011) como a mesma unidade |
| Estratégia de consumo | **FIFO** (lote mais antigo primeiro) — sem dependência de campo de validade preenchido |
| Obrigatoriedade | **Opt-in por item** — novo flag `lotControlled` em `Material`/`Product`, mesmo padrão de `productType` (Fase 4) |
| Custo no lote | **`unitCost` só em `MaterialBatch`** (snapshot de `PurchaseOrderItem.unitPrice` no recebimento) — `ProductBatch` sem campo de custo por ora, decisão validada 2026-07-10 |

## 4. Schema final proposto

```prisma
// Material.lotControlled Boolean @default(false) — aditivo
// Product.lotControlled  Boolean @default(false) — aditivo

// ── LOTE DE MATÉRIA-PRIMA (Fase 10, ADR-013) ────────────
// Criado no recebimento de um Pedido de Compra, um por item recebido (ou incrementado se o
// fornecedor reenviar o mesmo número de lote para o mesmo material). FIFO por `receivedAt`.
model MaterialBatch {
  id                  String              @id @default(cuid())
  materialId          String
  material            Material            @relation(fields: [materialId], references: [id])
  batchNumber         String              @default("") // do fornecedor, OU gerado via NumberingService quando o fornecedor não informa — nunca fica vazio de fato num registro criado pelo fluxo real (invariante de aplicação, não de banco); @default("") existe só para o campo nunca ser null, igual a outras strings do schema
  supplierId          String?
  supplier            Supplier?           @relation(fields: [supplierId], references: [id])
  purchaseOrderId     String?
  purchaseOrder       PurchaseOrder?      @relation(fields: [purchaseOrderId], references: [id])
  purchaseOrderItemId String?
  purchaseOrderItem   PurchaseOrderItem?  @relation(fields: [purchaseOrderItemId], references: [id])
  quantityReceived    Float               @default(0) // histórico, imutável após criado
  quantityAvailable   Float               @default(0) // decrementado a cada consumo — FIFO opera sobre este campo
  unitCost            Float               @default(0) // snapshot de PurchaseOrderItem.unitPrice no recebimento — preparação para custeio por lote (Financeiro, Fase 12); nunca recalculado se o preço do item mudar depois
  receivedAt          DateTime            @default(now())
  expiresAt           DateTime?           // opcional — reservado para uma futura estratégia FEFO, não usado nesta fase
  notes               String              @default("")
  createdAt           DateTime            @default(now())

  consumptions BatchConsumption[] @relation("MaterialBatchConsumptions")

  @@unique([materialId, batchNumber])
  @@index([supplierId])
  @@index([purchaseOrderId])
  @@index([materialId, receivedAt]) // ordem FIFO por material
}

// ── LOTE DE PRODUTO ACABADO (Fase 10, ADR-013) ──────────
// Um por rodada de produce() (ADR-011) — espelha ProductionOrderExecution 1:1 quando existir
// (clientRequestId informado); para rodadas sem clientRequestId, ainda cria seu próprio ProductBatch
// (a rastreabilidade de lote não depende de idempotência de retry, são preocupações independentes).
model ProductBatch {
  id                 String                     @id @default(cuid())
  productId          String
  product            Product                    @relation(fields: [productId], references: [id])
  productionOrderId  String
  productionOrder    ProductionOrder            @relation(fields: [productionOrderId], references: [id])
  batchNumber        String                     @default("") // gerado internamente: <número da OP>-<sequência da rodada>
  quantityProduced   Float                      @default(0)
  producedAt         DateTime                   @default(now())
  notes              String                     @default("")
  createdAt          DateTime                   @default(now())

  // O que este lote consumiu para existir (matéria-prima direta E/OU lotes de subconjunto — ver
  // BatchConsumption.itemType). Reaproveita a MESMA árvore que a Reconciliação (ADR-012) já percorre.
  consumedFrom       BatchConsumption[]         @relation("ProductBatchConsumedFrom")
  // Onde este lote (quando é ele mesmo um subconjunto) foi consumido por uma OP de nível superior.
  consumedAsComponentIn BatchConsumption[]      @relation("ProductBatchConsumedAsComponent")

  @@index([productId])
  @@index([productionOrderId])
}

// ── CONSUMO DE LOTE (Fase 10, ADR-013) ──────────────────
// Liga um ProductBatch (o que está sendo produzido) ao(s) lote(s) que ele consumiu — de matéria-prima
// (MaterialBatch) OU de outro ProductBatch (quando o item consumido é um subconjunto com lote próprio,
// mesma distinção de itemType já usada em MaterialReservation/StockMovement). Multinível por
// construção: seguir consumedAsComponentIn de um ProductBatch de subconjunto encadeia a rastreabilidade
// para baixo, sem precisar de uma segunda travessia de árvore.
model BatchConsumption {
  id                     String        @id @default(cuid())
  productBatchId         String        // o lote que está sendo produzido (consumidor)
  productBatch           ProductBatch  @relation("ProductBatchConsumedFrom", fields: [productBatchId], references: [id])
  itemType               String        // "material" | "product"
  materialBatchId        String?
  materialBatch          MaterialBatch? @relation("MaterialBatchConsumptions", fields: [materialBatchId], references: [id])
  consumedProductBatchId String?
  consumedProductBatch   ProductBatch? @relation("ProductBatchConsumedAsComponent", fields: [consumedProductBatchId], references: [id])
  quantityConsumed       Float         @default(0)
  createdAt              DateTime      @default(now())

  @@index([productBatchId])
  @@index([materialBatchId])
  @@index([consumedProductBatchId])
}
```

**Por que `BatchConsumption` é polimórfico (`itemType`)**: um `ProductBatch` de Mesa consome, fisicamente,
1 unidade de Estrutura — que é ELA MESMA rastreada por lote (seu próprio `ProductBatch`, gerado quando
Estrutura foi produzida). A rastreabilidade completa (Mesa → Estrutura → Tubo → Fornecedor) só é possível
se `BatchConsumption` conseguir apontar tanto para um `MaterialBatch` (folha) quanto para outro
`ProductBatch` (subconjunto) — exatamente a mesma distinção que `MaterialReservation`/`StockMovement`
já usam (`itemType: "material" | "product"`), reaproveitada aqui em vez de inventar um terceiro
vocabulário.

**Integração com o Consumo/Reconciliação (ADR-011/012) — confirmada**: dentro da MESMA transação de
`produceWithTx()`, depois do consumo físico (um nível) e da reconciliação de reserva (`releaseTargets`,
multinível), uma nova etapa: para cada entrada de `releaseTargets` (já sabe exatamente qual item e
quanto), se o item tiver `lotControlled = true`, seleciona o(s) lote(s) via FIFO (`MaterialBatch`
ordenado por `receivedAt` ascendente, ou `ProductBatch` mais antigo para itens que são subconjuntos com
lote próprio) e grava `BatchConsumption`. **Nenhum novo cálculo de "quanto"** — só decide "de qual lote
físico" a quantidade JÁ CALCULADA veio. Mesma disciplina de fonte única de verdade do ADR-012.

## 5. Estratégia de migração

- `Material.lotControlled`/`Product.lotControlled`: aditivos, `@default(false)` — nenhum item existente
  muda de comportamento até ser explicitamente marcado.
- `MaterialBatch`/`ProductBatch`/`BatchConsumption`: tabelas inteiramente novas, nenhuma coluna removida
  ou alterada em tabelas existentes (além dos 2 flags acima).
- **Sem backfill obrigatório**: como o controle é opt-in, não é necessário criar lotes retroativos para
  todo o estoque existente no momento desta migração. Quando um item específico tiver `lotControlled`
  ativado pela primeira vez, se já possuir `stockQty > 0`, o fluxo de ativação (a definir na
  implementação) cria um `MaterialBatch`/`ProductBatch` de abertura ("saldo inicial, origem anterior ao
  controle de lote") preservando a soma agregada — mas isso só acontece por item, no momento em que o
  usuário decide ativar, nunca em bloco para todo o cadastro.

## 6. Impactos confirmados

- **Reserva de Material**: sem impacto — reserva continua em nível agregado (`reservedQty`), não por
  lote específico. Reservar um lote específico antecipadamente não está no escopo desta fase.
- **MRP**: sem impacto direto — continua operando em saldo agregado. Fica registrado como possível
  evolução futura (considerar validade de lote em sugestões, FEFO-aware) mas não implementado agora.
- **Produção Parcial/Reconciliação (ADR-011/012)**: ponto de integração direto — ver seção 3.6.
- **Compras**: `receive()`/`ReceivePurchaseOrderDto` ganham campo(s) de lote por item recebido.
- **Estoque**: `StockMovement` provavelmente ganha uma referência opcional a lote, para manter um único
  ledger de auditoria em vez de duplicar histórico.
- **Fases futuras (KPIs, Financeiro)**: rastreabilidade de lote é normalmente também a base de custeio por
  lote (custo real de aquisição por lote específico, não médio) — mencionado por completude, decisão de
  custeio por lote fica para quando o Financeiro (Fase 12) for desenhado, não antecipada aqui.

## Auditoria de impacto pré-Subetapa 1 (2026-07-10)

Revisão contra código real (não só contra este documento), item a item, antes de tocar no schema:

- **Engenharia (BOM/BomRevision)**: `BomLine.componentProductId`/`materialId` continuam exatamente como
  estão — nenhuma tabela nova referencia `BomRevision`/`BomLine` de volta, só `MaterialBatch`/
  `ProductBatch` apontam PARA `Material`/`Product`/`PurchaseOrder`/`ProductionOrder`, nunca o inverso.
  Zero mudança de comportamento na Engenharia.
- **Reserva de Material**: `MaterialReservation` inalterada — reserva continua em nível agregado
  (`reservedQty`), sem nenhuma FK nova para/de `MaterialBatch`. Confirmado sem impacto.
- **Produção Parcial (ADR-011)**: `ProductionOrderExecution` ganha uma nova relação IMPLÍCITA (via
  `ProductionOrderId` em `ProductBatch`, não uma FK direta a `ProductionOrderExecution` — decisão
  deliberada, ver seção 3.2: um `ProductBatch` por rodada de `produce()`, mas ligado à `ProductionOrder`,
  não à `ProductionOrderExecution` em si, para não acoplar rastreabilidade de lote à mecânica de
  idempotência de retry, que é uma preocupação ortogonal). Nenhuma coluna de `ProductionOrderExecution`
  alterada nesta subetapa.
- **MRP**: `mrp-calculation.service.ts` não lê nenhuma tabela nova. Confirmado sem impacto nesta subetapa
  — a evolução FEFO-aware citada nos Impactos permanece hipótese futura, não implementada.
- **Compras**: `PurchaseOrder`/`PurchaseOrderItem` ganham relações novas (`MaterialBatch[]`), mas nenhuma
  coluna própria alterada — `receiveItems()` não é tocado nesta subetapa (Subetapa 2).
- **Estoque**: `StockMovement` não ganha nenhuma coluna nesta subetapa (a referência opcional a lote,
  citada nos Impactos, é decisão da Subetapa 2/3, quando `BatchConsumption` realmente passar a ser
  gravado) — mantém o schema desta subetapa estritamente aditivo e sem tocar em nenhuma tabela existente
  além das 2 novas colunas de flag.
- **Eventos de Domínio**: varredura de `DOMAIN_EVENTS` (`src/lib/domain-events.ts`) confirma que
  `PEDIDO_COMPRA_RECEBIDO` e `PRODUCAO_PARCIAL_REALIZADA`/`ORDEM_PRODUCAO_FINALIZADA` já disparam
  exatamente nos dois pontos onde `MaterialBatch`/`ProductBatch` serão criados (Subetapas 2/3) — nenhum
  evento novo necessário; um consumidor futuro interessado em lotes recém-criados já tem o gancho certo
  para reagir e consultar o lote pela referência já publicada no payload existente.
- **StatusHistory**: seu `entityType` é uma lista fechada dos 6 domínios com máquina de estados (Orçamento,
  Pedido de Venda, OP, Requisição, Pedido de Compra, Revisão de BOM). Lotes não têm status/ciclo de vida
  próprio (`MaterialBatch`/`ProductBatch` não têm campo `status`) — corretamente fora dessa lista, não
  precisa de nenhuma alteração.
- **AuditLog**: convenção já estabelecida no projeto (ADR-006/010/011/012) é que mudanças de
  estoque/reserva/lote são auditadas via `StockMovement` (ledger dedicado), nunca via `AuditLog` (CRUD de
  entidade por usuário). `PurchaseOrder.receive()` já chama `auditService.log()` uma vez por ação de
  recebimento — a criação de `MaterialBatch` é um detalhe dessa mesma ação, não precisa de uma entrada
  própria de `AuditLog`.
- **Preparação para o Financeiro**: ponto de decisão real, apresentado ao usuário — `MaterialBatch.
  unitCost` (snapshot de `PurchaseOrderItem.unitPrice` no recebimento) adicionado, decisão confirmada.
  `ProductBatch` fica sem campo de custo por ora (custeio de produção é um problema maior, não
  antecipado especulativamente).

**Duplicidade de responsabilidade, oportunidades de reuso e refinamentos encontrados**:

- `NumberingService.getNextNumber()` (já genérico, aceita qualquer `documentType` como chave livre) será
  reaproveitado para gerar o número de fallback de `MaterialBatch.batchNumber` quando o fornecedor não
  informar um (`documentType: 'lote_material'`) — evita inventar um segundo mecanismo de numeração.
- `@@unique([materialId, batchNumber])` adicionado a `MaterialBatch` — o rascunho original do schema
  (seção 4) descrevia a intenção ("incrementado se o fornecedor reenviar o mesmo número de lote") mas não
  tinha a constraint que de fato a garante. Corrigido nesta auditoria, antes de qualquer código.
- Confirmado, por leitura de `purchase-order.repository.ts` (`receiveItems()`): `PurchaseOrderItem.
  quantityReceived` já suporta múltiplos recebimentos parciais para o MESMO item (`increment`, não
  `set`) — logo `MaterialBatch` deve ser criado por CHAMADA de `receive()` (por entrada em `data.items`),
  não uma vez por `PurchaseOrderItem` — um mesmo item pode legitimamente chegar em lotes diferentes em
  entregas parciais diferentes. O schema já modela isso corretamente (`purchaseOrderItemId` é referência,
  não chave 1:1) — relevante para o desenho da Subetapa 2, registrado aqui para não se perder.
- Nenhuma duplicidade de responsabilidade encontrada: `BatchConsumption` não recalcula nada que
  `releaseTargets` (ADR-012) já calcula — só decide "de qual lote", nunca "quanto".

**Performance**: consumo FIFO (Subetapa 3) pode tocar mais de um `MaterialBatch` por item por rodada,
quando o lote mais antigo não tiver saldo suficiente sozinho — custo linear no número de lotes distintos
tocados, mesma categoria de custo já aceita na análise de complexidade do ADR-012 (não uma característica
nova). O índice `@@index([materialId, receivedAt])` já cobre a ordenação FIFO necessária.

**Nenhuma inconsistência arquitetural bloqueante encontrada.** Auditoria concluída — Subetapa 1 aprovada.

## 7. Plano de implementação em subetapas

- **Subetapa 1 — Schema**: `Material.lotControlled`/`Product.lotControlled` + `MaterialBatch`/
  `ProductBatch`/`BatchConsumption`. Sem lógica de negócio ainda (mesmo padrão da Fase 4/6 — fechar o
  modelo de domínio antes de expor comportamento).
- **Subetapa 2 — Recebimento cria `MaterialBatch`**: `PurchaseOrderService.receive()`/
  `ReceivePurchaseOrderDto` ganham campo de lote por item; `receiveItems()` cria/incrementa
  `MaterialBatch` na mesma transação já existente.
- **Subetapa 3 — Produção gera `ProductBatch` e consome via FIFO**: `produceWithTx()` ganha a etapa de
  seleção de lote (FIFO) e gravação de `BatchConsumption`, usando `releaseTargets` (ADR-012) como fonte
  única de "quanto" — só decide "de qual lote". Cria o `ProductBatch` de saída da rodada.
  Consumo multinível (subconjunto com lote próprio) via `itemType` no `BatchConsumption`.
- **Subetapa 4 — Consultas de rastreabilidade**: métodos de leitura (forward/backward), sem rota de API
  ainda, seguindo a mesma disciplina das Fases 4-6 (fechar o domínio antes de expor UI).

Cada subetapa validada e testada antes da próxima, seguindo o mesmo padrão de todas as fases anteriores.

## Subetapa 1 — Implementação (2026-07-10)

**Concluída e verificada.** Mudança 100% aditiva — nenhuma tabela existente perdeu ou teve coluna
alterada, só ganhou colunas/relações novas:

- `Material.lotControlled`/`Product.lotControlled` (`Boolean @default(false)`) — opt-in, nenhum item
  existente muda de comportamento.
- `MaterialBatch`, `ProductBatch`, `BatchConsumption` — três tabelas inteiramente novas, exatamente como
  desenhado na seção 4 (schema final), com o refinamento `@@unique([materialId, batchNumber])`
  encontrado e incorporado durante a auditoria.
- Relações inversas adicionadas em `Material`, `Product`, `Supplier`, `PurchaseOrder`,
  `PurchaseOrderItem`, `ProductionOrder` — todas para dentro das 3 tabelas novas, nunca o inverso.
- `npx prisma db push` aplicado no banco de desenvolvimento e no banco de teste. Sem backfill (opt-in,
  conforme decidido na seção 5) — nenhum dado existente precisou de migração.

**Testes**: `tests/lot-traceability-schema.test.ts` (7 novos testes) — `lotControlled` default `false`;
criação de `MaterialBatch` com todas as relações e snapshot de `unitCost`; `MaterialBatch` sem número de
lote do fornecedor (fallback); constraint `@@unique([materialId, batchNumber])` (rejeita duplicata no
mesmo material, aceita o mesmo número em material diferente); `ProductBatch` múltiplos por
`ProductionOrder` (um por rodada); `BatchConsumption` ligando `ProductBatch`→`MaterialBatch`
(`itemType="material"`, rastreabilidade de 1 nível, forward e backward); `BatchConsumption` ligando
`ProductBatch`→`ProductBatch` (`itemType="product"`, rastreabilidade multinível encadeada Mesa→
Estrutura→Tubo, forward e backward, provando que a cadeia funciona nos dois sentidos sem uma segunda
travessia de árvore).

**131/131 testes passando no total do projeto** (124 anteriores + 7 novos). `tsc --noEmit` confirma o
mesmo erro de ambiente pré-existente, não relacionado a este trabalho.

Subetapa 2 (Compras cria `MaterialBatch` no recebimento) aguardando início.

## Levantamento da Subetapa 2 (2026-07-10)

### Confirmação 1 — recebimentos parciais em lotes diferentes

**Confirmado, com precisão de escopo.** O fluxo já suporta isso hoje, mas via **chamadas separadas** a
`receive()` (uma por lote) — exatamente como a UI atual já funciona: `receiveQuantities` (`src/app/
page.tsx`) é um objeto `Record<purchaseOrderItemId, quantidade>`, então duas entradas do MESMO item numa
única submissão nem são estruturalmente possíveis na UI hoje. `PurchaseOrderItem.quantityReceived` já usa
`increment` (não `set`), então múltiplas chamadas ao longo do tempo já se acumulam corretamente — cada
uma pode legitimamente ter seu próprio lote.

**Achado relacionado, fora do escopo desta subetapa**: dividir UM item em 2 lotes DENTRO da MESMA
chamada (o mesmo `purchaseOrderItemId` duas vezes no array `items`) expõe um bug de validação
pré-existente em `PurchaseOrderService.receive()` — o laço de validação computa `outstanding` uma vez por
`itemsById` (snapshot antes do laço) e nunca acumula `quantityReceived` entre entradas da MESMA chamada
antes de checar contra esse saldo, então duas entradas do mesmo item poderiam, em teoria, somar mais que
o saldo em aberto sem serem pegas. **Inatingível hoje** (a UI nunca gera essa forma) e sem relação direta
com lotes — decisão do usuário: **não** incluir suporte a múltiplos lotes por item numa única chamada
nesta subetapa; o bug fica registrado, não corrigido (não há necessidade de corrigir um caminho que
nenhum código aciona).

### Confirmação 2 — FIFO usa `receivedAt`, nunca `createdAt`

**Confirmado por design.** `receivedAt` (`DateTime @default(now())`) é um campo distinto de `createdAt`
— editável explicitamente na criação (o `@default(now())` só se aplica quando nenhum valor é fornecido),
e é exatamente a coluna usada no índice composto `@@index([materialId, receivedAt])` para a ordenação
FIFO. `createdAt` permanece como o timestamp técnico de inserção no banco, nunca usado para decidir ordem
de consumo. Isso já protege contra distorções futuras de migração/importação/correção administrativa —
um lote inserido tardiamente (ex.: correção manual) pode receber um `receivedAt` retroativo sem afetar
`createdAt`.

### Achados adicionais da varredura do fluxo real (rota → DTO → Service → Repository → UI)

- `PurchaseOrderRepository.findByIdWithItems()` hoje inclui `items: true`, mas NÃO `items.material` — o
  Service não consegue ler `material.lotControlled` por item ainda. Ajuste necessário (não
  arquitetural): `include: { items: { include: { material: true } } }`.
- UI existente (`src/app/page.tsx`, diálogo de recebimento) **não precisa de nenhuma mudança** para a
  Subetapa 2 continuar 100% compatível — os novos campos de lote são opcionais no DTO; a UI atual
  continua enviando só `{ purchaseOrderItemId, quantityReceived }`, caindo automaticamente no caminho
  "sem número de lote informado" quando o material for `lotControlled`.
- **Decisão arquitetural real, validada com o usuário**: `StockMovement` ganha `materialBatchId`
  (nullable, aditivo) — cada `StockMovement` tipo `IN` de recebimento passa a referenciar diretamente o
  `MaterialBatch` que ele criou/incrementou, em vez de depender de correlação indireta por
  `referenceId`(`purchaseOrderId`)/proximidade de timestamp. Fortalece a auditoria no próprio ledger
  central por um custo mínimo (uma coluna nullable).

### Regra de incremento de lote (mesmo número de lote reenviado)

Quando o fornecedor informa um `batchNumber` explícito que já existe para o mesmo material
(`@@unique([materialId, batchNumber])`), o recebimento **incrementa** o `MaterialBatch` existente
(`quantityReceived`/`quantityAvailable` somados) em vez de tentar criar um duplicado (que violaria a
constraint). `unitCost` e `receivedAt` do lote existente **não são sobrescritos** — preservam o snapshot
e a data do primeiro recebimento daquele número de lote, tratando reenvios do mesmo lote como a mesma
entidade física ao longo do tempo. Quando nenhum `batchNumber` é informado, o fallback via
`NumberingService.getNextNumber('lote_material')` sempre gera um código novo — nunca colide, sempre cria.

## Decisões validadas com o usuário — Subetapa 2 (2026-07-10)

| Ponto | Decisão |
|---|---|
| Múltiplos lotes do mesmo item numa única chamada | **Não** incluído nesta subetapa — só via chamadas separadas (já suportado) |
| `StockMovement.materialBatchId` | **Adicionado** — referência direta e nullable ao lote que originou o movimento |
| `findByIdWithItems()` | Ajustado para incluir `items.material` (necessário para ler `lotControlled`) |
| Reenvio do mesmo número de lote | Incrementa o `MaterialBatch` existente; `unitCost`/`receivedAt` preservam o snapshot original |

## Subetapa 2 — Implementação (2026-07-10)

**Concluída e verificada, exatamente conforme o levantamento validado acima.**

- `prisma/schema.prisma`: `StockMovement.materialBatchId` (nullable, aditivo) + relação inversa
  `MaterialBatch.stockMovements`. `npx prisma db push` aplicado em dev e teste.
- `src/app/dto/index.ts`: `receivePurchaseOrderItemSchema` ganhou `batchNumber`/`expiresAt` opcionais.
- `src/app/repositories/purchase-order.repository.ts`: `findByIdWithItems()` passou a incluir
  `items.material` (`select: { lotControlled: true }`); `receiveItems()` ganhou a lógica de criar ou
  incrementar `MaterialBatch` (por `materialId_batchNumber`) quando `item.material.lotControlled`,
  preservando `unitCost`/`receivedAt` do lote em incrementos, e liga o `StockMovement` ao
  `materialBatchId` resultante (ou `null` quando o material não é lotControlled).
- `src/app/services/purchase-order.service.ts`: `receive()` resolve o `batchNumber` de fallback (via
  `numberingService.getNextNumber('lote_material')`) fora da transação, só quando o material é
  lotControlled e o fornecedor não informou um — Service chama Service, Repository só aplica,
  mesma disciplina do ADR-012.
- Nenhuma mudança na UI (`src/app/page.tsx`) — os campos novos são opcionais, o diálogo de recebimento
  existente continua funcionando sem alteração, caindo no caminho "sem lote informado" quando aplicável.

**Testes**: `tests/lot-traceability-receiving.test.ts` (5 testes) — material sem `lotControlled`
(regressão, nenhum `MaterialBatch` criado); material `lotControlled` com número informado (snapshot de
`unitCost`, `StockMovement` ligado); sem número informado (fallback via `NumberingService`); reenvio do
mesmo número de lote em chamada separada (incrementa, preserva `unitCost`/`receivedAt`); recebimento
parcial em 2 lotes diferentes via chamadas separadas (rastreabilidade correta para cada um, cada
`StockMovement` apontando para o lote certo).

**136/136 testes passando no total do projeto** (131 anteriores + 5 novos). `tsc --noEmit` confirma o
mesmo erro de ambiente pré-existente, não relacionado a este trabalho.

Subetapa 3 (Produção gera `ProductBatch`, consome via FIFO, grava `BatchConsumption`) aguardando início.

## Subetapa 3 — Implementação (2026-07-10)

Retomada após a pausa para a Fase 13 (ADR-015). Implementada seguindo exatamente o desenho já validado
nas seções 3.6/4 acima — nenhuma decisão nova reaberta, só a execução do que já estava especificado.

**Esclarecimento de granularidade, confirmado durante a implementação (não uma mudança de desenho)**: a
seleção de lote acontece na MESMA granularidade do laço de consumo físico de um nível (`lines`), não na
de `releaseTargets` (que é sobre liberação de reserva multinível, ADR-012, e pode pular direto a um
subconjunto sem reserva própria até a matéria-prima mais funda). "Mesa consome fisicamente 1 unidade de
Estrutura" — exatamente o exemplo do schema (seção 4 acima) — só existe no laço de `lines`; usar
`releaseTargets` para isso teria pulado Estrutura e tentado ligar o consumo de Mesa direto a um lote de
Tubo, quebrando a rastreabilidade de um nível que o próprio `BatchConsumption.itemType` foi desenhado
para representar. A quantidade consumida em cada linha já vem calculada pelo laço de consumo físico
existente (mesma fórmula da Subetapa 1/Fase 9) — nenhum novo cálculo de "quanto", só de "de qual lote",
exatamente como a seção 3.6 já previa.

**Achado técnico, resolvido sem alterar o schema**: `ProductBatch` (Subetapa 1) não tem um campo
`quantityAvailable` próprio (diferente de `MaterialBatch`) — não é possível decrementar diretamente
quando um subconjunto lotControlled é consumido como componente. Resolvido calculando a disponibilidade
sob demanda: `quantityProduced` menos a soma de `BatchConsumption.quantityConsumed` já registrada contra
aquele `ProductBatch` (via `consumedAsComponentIn`), ordenado por `producedAt` ascendente (FIFO). Mesmo
custo linear já aceito na auditoria da Subetapa 1 ("performance"); nenhuma coluna nova, nenhuma tabela
alterada.

### Implementação

- `src/app/repositories/production-order.repository.ts` (`produceWithTx()`): dentro do MESMO laço de
  consumo físico de um nível (nenhuma travessia nova), depois de decrementar `stockQty` como já fazia,
  verifica `updatedItem.lotControlled` (o `update()` do Prisma já retorna a linha completa, sem query
  extra) — se `material`, seleciona `MaterialBatch` por FIFO (`receivedAt` ascendente,
  `quantityAvailable > 0`) e decrementa; se `product` (subconjunto), seleciona `ProductBatch` por FIFO
  (`producedAt` ascendente, disponibilidade calculada como acima). Cada lote tocado vira uma entrada
  coletada em memória (`batchConsumptions`). Na seção de entrada do produto acabado, se
  `updatedProduct.lotControlled` (mesmo padrão — retornado pelo `update()` já existente), cria um
  `ProductBatch` para a rodada (`batchNumber: "<número da OP>-<sequência>"`, sequência =
  `count(productionOrderId) + 1`) e grava em lote (`createMany`) todas as `batchConsumptions`
  coletadas, agora com o `productBatchId` da rodada. Se o produto acabado NÃO for lotControlled, nenhum
  `ProductBatch`/`BatchConsumption` é criado nesta rodada — os lotes de matéria-prima/subconjunto
  consumidos ainda são corretamente decrementados (o flag de cada item é independente do flag do
  produto final), só não há lote de saída para ancorar o registro de consumo.
- Caminho de replay idempotente (`clientRequestId` já processado): retorna `productBatch: null` — o lote
  já foi criado corretamente na chamada original; a rastreabilidade de qual `ProductBatch` cada retry
  específico gerou não é reconsultada aqui, por ser ortogonal à mecânica de idempotência (mesma decisão
  já tomada na Subetapa 1 para não acoplar `ProductBatch` a `ProductionOrderExecution` via FK direta).
- Nenhuma mudança em `ProductionOrderService.produce()` (Service) — já repassa o resultado do
  Repository sem inspecionar campos específicos; `productBatch` no retorno fica disponível para quando
  a Subetapa 4 precisar dele, sem quebrar nenhum consumidor existente.
- Nenhuma mudança de API/rota — mesma disciplina de "fechar o domínio antes de expor UI" das Fases 4-6,
  reafirmada na seção 7 (plano de subetapas) deste documento.

**Testes**: `tests/lot-traceability-production.test.ts` (6 testes) — consumo simples (produto e material
lotControlled, `ProductBatch`/`BatchConsumption` corretos, `quantityAvailable` decrementado); FIFO
atravessando 2 lotes de matéria-prima quando o mais antigo não é suficiente sozinho; subconjunto
lotControlled consumido como componente (`itemType="product"`, `consumedProductBatchId` aponta pro lote
do subconjunto, disponibilidade calculada corretamente); produção parcial em rodadas separadas (cada
rodada com seu próprio `ProductBatch`, sequência incremental no `batchNumber`); produto acabado SEM
lotControlled mesmo com material lotControlled (nenhum `ProductBatch`/`BatchConsumption`, mas o
`MaterialBatch` do material ainda decrementa corretamente); compatibilidade total (nem material nem
produto lotControlled — comportamento idêntico à Fase 9/ADR-011, nenhuma tabela de lote tocada).

**144/144 testes passando no total do projeto** (138 anteriores + 6 novos). `tsc --noEmit`/`npm run
lint` (58 warnings, baseline da Fase 13 preservada)/`npm run build` limpos.

Subetapa 4 (consultas de rastreabilidade forward/backward, sem rota de API ainda) aguardando início.

## Subetapa 4 — Implementação (2026-07-10)

Consultas de rastreabilidade forward/backward, profundidade arbitrária, sem rota de API ainda (mesma
disciplina de fechar o domínio antes de expor UI, Fases 4-6). Requisitos adicionais de arquitetura
pedidos pelo usuário antes de codar, confirmados um a um abaixo.

### Requisitos confirmados

- **Profundidade arbitrária da BOM, com proteção contra ciclo**: a travessia é em largura (nível a
  nível, `while` até o nível seguinte vir vazio), não limitada a uma profundidade fixa de negócio —
  só um teto defensivo (`MAX_DEPTH = 100`, nunca esperado ser atingido por um dado real) contra dado
  corrompido. Ciclo é detectado por conjunto de ids já visitados NO MESMO caminho (mesmo idioma já
  usado por `bomExplosionService`, reaproveitado aqui, não reinventado) — lança
  `BadRequestException` com o id do lote que já havia aparecido. Testado com um ciclo construído
  artificialmente (X consome Y, Y consome X) diretamente no banco — estruturalmente impossível pelo
  fluxo real de `produce()` (um `ProductBatch` só pode consumir lotes já existentes no momento em que
  é criado), mesmo espírito de defesa em profundidade já usado no teste de ciclo de
  `bom-explosion.test.ts`.
- **Resultados determinísticos**: toda lista final é ordenada explicitamente por `(profundidade,
  número de lote)` antes de retornar — nunca depende da ordem física de retorno do banco. Toda query
  do Repository também tem `orderBy` explícito. Testado: duas chamadas seguidas para os mesmos dados
  devolvem exatamente a mesma ordem.
- **Sem N+1**: `BatchTraceabilityRepository` só aceita LISTAS de ids (nunca um id por vez) — cada
  nível da árvore vira exatamente 1 query (`WHERE id IN (...)`), independente de quantos nós existem
  naquele nível. Total de idas ao banco = O(profundidade), nunca O(número de nós).
- **DTOs internos, sem acoplamento a API/tela**: `MaterialBatchTraceNode`/`ProductBatchTraceNode`/
  `TraceabilityEdge`/`ForwardTraceResult`/`BackwardTraceResult` (todos em
  `batch-traceability.service.ts`) representam o domínio da rastreabilidade em si — nenhum tipo
  importado de `page.tsx`, nenhuma rota criada, nenhuma serialização JSON específica de API decidida
  ainda.
- **Resultados autocontidos para auditoria**: cada nó carrega produto/material, número de lote, OP/
  Pedido de Compra de origem, fornecedor, datas (`receivedAt`/`producedAt`/`consumedAt`), quantidades
  (`quantityReceived`/`quantityAvailable`/`quantityProduced`/`quantityConsumed`) e `unitCost` (quando
  aplicável) — tudo resolvido em cada query de nível (`include`), nunca exigindo uma segunda consulta
  para montar um relatório de auditoria a partir do resultado.
- **Complexidade e otimizações futuras**: documentado no próprio comentário de classe do Service —
  O(profundidade) idas ao banco, custo total proporcional às arestas realmente alcançáveis a partir da
  origem (mesma categoria de custo já aceita para `bomExplosionService`/
  `ReservationReconciliationService`, não uma característica nova). Otimização futura possível, não
  implementada: cache por lote se a mesma árvore for consultada repetidamente (relevante só quando
  existir uma tela/API real reconsultando a mesma origem com frequência).
- **Preparação para Qualidade/Financeiro**: cada `MaterialBatchTraceNode` já carrega `unitCost`
  (snapshot capturado desde a Subetapa 2) — uma futura consulta de custo de matéria-prima por
  `ProductBatch` já pode ser montada por cima deste resultado (`Σ quantityConsumed × unitCost` de
  `materialOrigins`), sem precisar de nenhum dado adicional. `ProductBatch` continua sem campo de
  custo próprio (decisão da Subetapa 1, não revisada aqui) — custeio de produção (mão de obra,
  overhead) continua sendo um problema do Financeiro (Fase 12), não desta subetapa. Para Qualidade:
  os resultados já carregam todos os ids/números de lote/OP/Pedido de Compra necessários para uma
  futura entidade de inspeção/não-conformidade referenciar um `MaterialBatch`/`ProductBatch`
  específico — nenhum campo adicional foi necessário nesta subetapa para isso.

### Implementação

- `src/app/repositories/batch-traceability.repository.ts` (novo): 4 métodos de leitura, cada um
  aceitando uma lista de ids — `findMaterialBatchById`/`findProductBatchById` (origem da consulta) e
  `findConsumptionsOfMaterialBatches`/`findConsumptionsAsComponent`/`findConsumptionsByProductBatches`
  (por nível de travessia).
- `src/app/services/batch-traceability.service.ts` (novo): `traceForward(materialBatchId)` — BFS a
  partir de um `MaterialBatch`, seguindo `BatchConsumption.consumedProductBatchId` nível a nível;
  `traceBackward(productBatchId)` — BFS a partir de um `ProductBatch`, separando por `itemType` em
  cada nível (material = origem folha; product = subconjunto a expandir no próximo nível).

**Testes**: `tests/batch-traceability.test.ts` (6 testes) — forward de 1 nível; forward de 2 níveis
(Tubo→Estrutura→Mesa, Mesa aparece na profundidade 2); backward a partir de Mesa (Estrutura como
subconjunto intermediário na profundidade 1, Tubo como origem de matéria-prima na profundidade 2, só
alcançável através de Estrutura); ordenação determinística; lote inexistente lança
`NotFoundException`; ciclo artificial detectado e rejeitado.

**150/150 testes passando no total do projeto** (144 anteriores + 6 novos). `tsc --noEmit`/`npm run
lint` (58 warnings, baseline preservada)/`npm run build` limpos.

### Avaliação crítica — limitações, débito técnico e oportunidades de evolução antes de expor por API

Pedida explicitamente pelo usuário antes de qualquer exposição futura destas consultas:

1. **Sem controle de acesso/RBAC definido ainda** — como são só métodos de Service, sem rota, não há
   hoje nenhuma decisão sobre qual permissão de módulo governaria uma futura rota (`estoque`?
   `producao`? uma futura `qualidade`? alguma combinação?). Decisão em aberto, não bloqueante porque
   não há rota ainda.
2. **Sem paginação/limite de resultado** — para uma árvore de consumo muito larga (um `MaterialBatch`
   consumido por centenas de `ProductBatch`, cada um consumido por dezenas de outros), o resultado
   cresce sem teto. Não é um problema na escala de dados real deste sistema hoje (BOMs de 2-4 níveis
   observadas), mas se uma futura API expuser isso diretamente para uma tela, precisaria de paginação
   ou limite de profundidade configurável.
3. **Sem cache** — cada chamada recalcula a árvore inteira do zero, mesmo que a mesma origem seja
   consultada repetidamente em sequência (ex.: uma tela de auditoria que o usuário reabre várias
   vezes). Aceitável para uma capacidade ainda sem consumidor real; vira relevante quando um
   consumidor de fato existir.
4. **`MAX_DEPTH = 100` é uma constante defensiva, não derivada de um requisito de negócio real** —
   nenhuma estrutura de produto conhecida neste sistema chega perto disso; existe só para transformar
   um ciclo não detectado (bug futuro hipotético) em um erro controlado em vez de um loop infinito.
5. **Custeio incompleto para Financeiro** — a rastreabilidade já permite calcular o custo de matéria-
   prima de um `ProductBatch` (via `unitCost` dos `MaterialBatch` de origem), mas não o custo
   "carregado" (mão de obra, overhead, custo dos próprios subconjuntos) — isso depende de um modelo de
   custeio de produção que é responsabilidade da Fase 12 (Financeiro), corretamente fora do escopo
   desta subetapa, mas registrado aqui para não ser assumido como já resolvido.
6. **Cobertura de teste limitada a 2 níveis de profundidade** — o algoritmo em si é genérico (laço,
   não uma recursão limitada a uma profundidade fixa), então não há uma limitação de desenho, só uma
   lacuna de teste: nenhum cenário de 3+ níveis foi testado explicitamente. Baixo risco (a mesma
   estrutura de 2 níveis já prova que o laço avança corretamente entre níveis), mas vale um teste
   adicional antes de expor por API, se o usuário priorizar essa garantia extra.
7. **`expiresAt` (validade) de `MaterialBatch` não aparece no DTO de rastreabilidade** — existe no
   schema desde a Subetapa 1 (reservado para uma futura estratégia FEFO, não usada ainda), mas não foi
   incluído no nó de rastreabilidade porque nenhum consumidor precisa dele hoje. Adição trivial e
   aditiva quando FEFO ou alertas de validade entrarem em escopo.

Subetapa 4 concluída. Fase 10 (Rastreabilidade por Lote) com as 4 subetapas do plano original
implementadas e verificadas.

### Reforço final de cobertura (2026-07-10) — cadeia de 4 níveis

Item 6 da avaliação crítica acima ("cobertura de teste limitada a 2 níveis") resolvido a pedido do
usuário, antes de declarar a fase definitivamente encerrada: `tests/batch-traceability.test.ts` ganhou
um 7º teste — cadeia de 4 níveis (Produto Final → Subconjunto A → Subconjunto B → Subconjunto C →
Matéria-prima), validando **forward** (a partir do lote de matéria-prima, os 4 `ProductBatch` aparecem
exatamente nas profundidades 1-4, na ordem certa) e **backward** (a partir do Produto Final, os 3
subconjuntos aparecem como intermediários nas profundidades 1-3, e a matéria-prima só aparece na
profundidade 4, confirmando que ela só é alcançável atravessando os 3 subconjuntos). Prova, com um
caso concreto além do de 2 níveis já testado, que o laço de travessia (genérico, sem profundidade
fixa no código) de fato generaliza para qualquer profundidade real.

**151/151 testes passando no total do projeto** (150 anteriores + 1 novo). `tsc --noEmit`/`npm run
lint` (58 warnings, baseline preservada)/`npm run build` limpos.

## FASE 10 (RASTREABILIDADE POR LOTE) — ENCERRAMENTO FORMAL

Todas as 4 subetapas do plano original implementadas, testadas e aprovadas pelo usuário — schema,
recebimento de compra cria/incrementa `MaterialBatch`, produção gera `ProductBatch`/consome via FIFO/
grava `BatchConsumption` (profundidade arbitrária, subconjuntos incluídos), e consultas de
rastreabilidade forward/backward com cobertura de teste até 4 níveis de profundidade. Avaliação
crítica de limitações registrada antes de qualquer exposição futura por API (seção acima). Nenhuma
rota de API criada nesta fase — decisão deliberada, mesma disciplina de "fechar o domínio antes de
expor UI" já usada nas Fases 4-6.

**Fase 10 formalmente encerrada.**

## Próximo passo

Conforme decisão do usuário: Fase 11 (Dashboard/KPIs) adiada — depende de dados financeiros que ainda
não existem. Levantamento arquitetural da Fase 12 (Financeiro Integrado) iniciado a seguir, sem código,
schema, migrations, APIs ou alteração de Services existentes nesta rodada.
