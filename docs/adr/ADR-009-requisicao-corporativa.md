# ADR-009 — Requisição Corporativa (Fase 7)

- **Status**: **Implementado e verificado — Fase 7 concluída.** Schema, regra de atendimento por
  estoque e integração MRP→Requisição implementadas e testadas (ver "Implementação" ao final).
- **Data**: 2026-07-09
- **Depende de**: [ADR-002 — Máquina de Estados](./ADR-002-maquina-de-estados.md) (`ALLOWED_TRANSITIONS`
  da Requisição, reaproveitado sem mudança); [ADR-007 — MRP](./ADR-007-mrp.md) (`MrpSuggestion`,
  consumida por esta fase); [ADR-008 — Infraestrutura Financeira](./ADR-008-infraestrutura-financeira.md)
  (`costCenterId` em `Requisition` já estava catalogado como candidato condicionado a esta fase — ver
  seção 5)
- **Escopo explicitamente fora desta fase**: nenhuma tela nova, nenhuma rota de API nesta rodada
  (domínio primeiro); nenhuma mudança em `PurchaseOrder`/`PurchaseOrderItem` (permanece limitado a
  `Material`, ajuste fica para a Fase 8 se necessário); nenhum novo fluxo de aprovação multi-nível (a
  máquina de estados existente já cobre isso, ver seção 5).

## Contexto

O MRP (Fase 6) já gera sugestões de compra/produção, mas não cria nenhum documento — por design (ADR-007:
"motor de inteligência, nunca executor automático"). A Fase 7 é o próximo elo natural: transformar a
Requisição, hoje um documento implicitamente ligado à Produção, num documento corporativo de solicitação
que qualquer departamento usa — e que o MRP pode alimentar quando o usuário aprovar uma sugestão.

## 1. Estado atual da Requisição — levantamento

**Campos hoje** (`model Requisition`): `number`, `status` (`draft`/`sent`/`approved`/`ordered`/
`cancelled`), `originModule` (`"manual"` | `"production_order"`), `productionOrderId` (opcional),
`date`, `neededBy`, `notes`, `approvedBy`/`approvedAt` (já capturam quem aprovou e quando — ver seção 5),
`userId` (quem criou — o "solicitante" já existe). `RequisitionItem`: `materialId` **obrigatório**,
`supplierId` opcional, `quantity`, `unit`, `estimatedPrice`, `notes`, mais `quotes` (cotações) e
`purchaseOrderItems`.

**Máquina de estados já existe e já tem um gate de aprovação**: `draft → sent → approved → ordered →
cancelled` (`RequisitionService`, `ALLOWED_TRANSITIONS`), com `approvedBy`/`approvedAt` gravados na
transição para `approved` — **isso já é o fluxo de aprovação que a seção 5 abaixo pergunta se falta**.
Não precisa ser inventado.

**Quem cria uma Requisição hoje**: qualquer usuário com permissão do módulo `requisicoes` (rota
`POST /api/requisitions`, `requireModulePermission('requisicoes', 'create')`) — **já não é
tecnicamente restrito à Produção**, mas na prática só é usado nesse contexto porque todo item exige
`materialId` (ver achado crítico abaixo) e o campo `originModule` só tem os valores `manual`/
`production_order`.

**Como conversa com Produção**: `productionOrderId` opcional + `originModule: "production_order"` —
um vínculo informativo, não uma automação (não encontrei nenhum código que crie uma Requisição
automaticamente a partir de uma OP hoje; `RequisitionService.suggestForProductionOrder()` só **calcula**
uma sugestão, não cria nada).

**Como conversa com Compras**: ao avançar para `"ordered"`, o evento `requisicao.aprovada_para_compra`
(ADR-003) dispara `PurchaseOrderService.createFromRequisition()`, que agrupa os itens por fornecedor
vencedor e gera um `PurchaseOrder` por fornecedor — **hoje, pela quantidade CHEIA de cada item, sem
nenhuma checagem de estoque**.

### Achado crítico: `RequisitionItem.materialId` é obrigatório

Isso é o maior obstáculo estrutural para "Requisição corporativa". Uma requisição de TI (licença de
software), RH (algo administrativo) ou Manutenção (serviço de conserto) frequentemente **não é sobre um
`Material` de estoque** — forçar isso hoje quebraria o próprio objetivo da fase. Proposta na seção 6.

### Achado: hoje não existe "atendimento por estoque antes de compra"

Confirmado no código: `createFromRequisition()` gera Pedido de Compra pela quantidade total do item,
sempre — não há nenhuma comparação com `Material.stockQty` no caminho real (só existe, informalmente, em
`suggestForProductionOrder()`, uma sugestão que ninguém é obrigado a seguir). Implementar a regra pedida
na seção 4 é, portanto, uma mudança de comportamento real, não uma formalização do que já existe.

## 2. Nova visão corporativa — Tipo

**Lista final aprovada (2026-07-09)** — 6 valores, revista em relação à proposta inicial de 9 (removidos
`TI`, `RH`, `QUALIDADE`, sem substituto — não são áreas que o Cozisteel opera hoje neste sistema):

```
PRODUCAO, MANUTENCAO, ALMOXARIFADO, ENGENHARIA, SERVICOS, OUTROS
```

`Tipo` representa a origem/departamento da solicitação — **não é uma regra rígida de fluxo nesta fase**
(nenhuma transição de status, permissão ou validação varia por `Tipo` ainda; é só um dado descritivo).

`Requisition.tipo` (novo campo, `String`) — **`Tipo` já É a dimensão de "departamento"** pedida na
seção 5; não há necessidade de um campo `departamento` separado nem de um model `Department` novo.
Default `"PRODUCAO"` para preservar o significado de todas as ~centenas de linhas existentes (100% delas
são, hoje, requisições de matéria-prima para produção).

## 3. Integração com MRP

**Validado com o usuário**: construir já nesta fase, como subetapa própria (não adiar para depois) — ver
plano de subetapas.

Fluxo: `MrpSuggestion` (`status: "pending"`) → usuário aprova (`status → "accepted"`, transição nova a
implementar em `MrpSuggestionService`, hoje esse campo só é gravado como `"pending"` e nunca muda) →
`RequisitionService.createFromMrpSuggestion()` agrupa as sugestões `suggestionType: "purchase"` aceitas
numa Requisição `Tipo: "PRODUCAO"`, `originModule: "mrp"` (**novo valor** para esse campo, ao lado de
`manual`/`production_order`).

**Achado importante para a seção 4**: uma `MrpSuggestion` já é, por construção do motor de cálculo
(ADR-007), o resultado de **descontar estoque, reservas, compras em aberto e produção em andamento** —
`quantityShortfall` já é a necessidade líquida final. Uma Requisição nascida de uma `MrpSuggestion`
aprovada **não deve passar pela regra de atendimento por estoque da seção 4 de novo** — isso
recontaria/subtrairia estoque que o MRP já excluiu do cálculo, produzindo uma quantidade de compra menor
(ou até incorreta) do que a real. Proposta: quando `originModule === "mrp"`,
`quantityToPurchase = quantity` sempre (sem checagem de estoque nova); a regra da seção 4 se aplica só a
requisições que **não** vieram do MRP (criadas manualmente, de qualquer Tipo, sem netting prévio).

**Confirmado pelo usuário (2026-07-09)**: a proposta acima está correta e aprovada — refazer o desconto de
estoque numa Requisição originada do MRP contaria o mesmo saldo duas vezes, já que o motor de cálculo já
considerou estoque, reservas, compras em aberto e produção em andamento. `originModule = "mrp"` sempre
resulta em `quantityToPurchase = quantidade calculada pelo MRP`, sem nova consulta a `Material.stockQty`.

**Escopo confirmado**: só sugestões `suggestionType: "purchase"` viram Requisição nesta fase — sugestões
de produção (`"production"`) não têm destino automatizado ainda (não existe hoje um caminho "aprovar
sugestão de produção → cria Ordem de Produção"; fica para uma fase futura). Cada aprovação individual
(`mrpSuggestionService.approve()`) gera sua própria Requisição, com um item — não há agrupamento de
múltiplas sugestões aprovadas numa única Requisição nesta versão (candidato a uma evolução futura, se o
volume de aprovações justificar).

## 4. Regra de atendimento (estoque antes de compra)

**Validado com o usuário**: split explícito no item, não só informativo.

`RequisitionItem` ganha `quantityFromStock` (`Float @default(0)`) e `quantityToPurchase`
(`Float @default(0)`) — calculados no momento da transição para `"ordered"` (mesmo ponto onde o Pedido de
Compra já é gerado hoje, sem precisar antecipar o cálculo para `"sent"`/`"approved"`, onde o estoque
poderia mudar antes da compra de fato acontecer). `quantityFromStock = min(quantity, material.stockQty)`,
`quantityToPurchase = quantity - quantityFromStock`. **Só se aplica quando `materialId` está presente**
(itens sem material — ver seção 6 — não têm "estoque" contra o que checar, são 100% `quantityToPurchase`
por definição) **e quando `originModule !== "mrp"`** (seção 3).

**Mudança de comportamento real, deliberada e nova**: a parte `quantityFromStock` gera um `StockMovement`
tipo `OUT` (`referenceType: "requisition"`) na mesma transação da transição para `"ordered"` — primeira
vez que Requisição, por si só, movimenta estoque (hoje só Produção e Compras tocam `StockMovement`
diretamente). Só `quantityToPurchase` (não mais `quantity` inteira) alimenta a geração do
`PurchaseOrderItem`.

## 5. Aprovação — mapeamento (sem implementar)

- **Aprovação**: já existe — transição `sent → approved`, sem necessidade de novo estado.
- **Responsável (quem aprovou)**: já existe — `Requisition.approvedBy`/`approvedAt`.
- **Solicitante (quem pediu)**: já existe — `Requisition.userId`.
- **Departamento**: coberto pelo novo `Tipo` (seção 2) — sem campo adicional.
- **Centro de custo futuro**: **não implementar agora**, confirmando a própria regra do ADR-008 —
  `costCenterId` em `Requisition` está catalogado como candidato, mas condicionado a **dois** gatilhos
  simultâneos: domínio real de Centro de Custos existir **e** uma fase tocar a entidade. A Fase 7 satisfaz
  o segundo gatilho, mas não o primeiro (`CostCenter` ainda não existe, nenhum caso de uso real
  validado) — então o campo continua fora do escopo, exatamente como o ADR-008 já previa.

## 6. Schema — impacto completo

### `Requisition`
- `tipo String @default("PRODUCAO")` — novo.
- `originModule` ganha o valor `"mrp"` (sem mudança de schema — já é `String` livre).

### `RequisitionItem`
- `materialId String` → **`materialId String?`** (torna-se opcional) — mudança de obrigatoriedade, não
  aditiva no sentido estrito, mas **segura**: nenhuma linha existente tem `materialId` nulo, então nenhum
  dado é afetado; só relaxa a constraint para permitir itens sem material daqui pra frente.
- `description String @default("")` — novo, usado quando `materialId` é nulo (requisição de serviço/item
  não-estocável — ex.: "conserto do ar-condicionado da sala 3", "licença Adobe Photoshop").
- `quantityFromStock Float @default(0)`, `quantityToPurchase Float @default(0)` — novos (seção 4).
- `originMrpSuggestionId String?` (FK opcional para `MrpSuggestion`) — rastreabilidade quando o item
  nasce de uma sugestão aprovada (seção 3); `MrpSuggestion` ganha a relação inversa `requisitionItems[]`.

### Impacto em relações existentes
- `PurchaseOrderItem.requisitionItemId` (FK opcional já existente) continua funcionando sem mudança —
  só passa a existir quando `quantityToPurchase > 0`.
- `StockMovement` ganha um terceiro `referenceType` em uso real (`"requisition"`, já previsto no
  comentário do campo desde a Fase 1, nunca usado até agora).
- Nenhuma rota, Service ou DTO existente quebra: `materialId` continua sendo enviado normalmente por
  todo fluxo de Produção existente (obrigatório só na validação do DTO para `Tipo: "PRODUCAO"` — a
  decidir se o Zod schema exige `materialId` XOR `description` dependendo do Tipo, ou deixa mais aberto;
  proponho validar isso quando o DTO for desenhado na implementação, não uma decisão de schema).

### Riscos de quebrar fluxo atual
- **Baixo** para o schema em si — tudo aditivo ou relaxamento de constraint (nunca o oposto).
- **Médio** para o comportamento da seção 4 — é a primeira vez que Requisição decrementa estoque; testes
  precisam cobrir explicitamente que o fluxo de Produção existente (`originModule: "production_order"`
  ou `"manual"` ligado a uma OP) continua gerando Pedido de Compra corretamente quando combinado com a
  nova baixa parcial por estoque.
- **Fora desta fase, mas identificado**: `PurchaseOrderItem.materialId` continua obrigatório — uma
  Requisição de Manutenção/TI/Serviços que precise virar Pedido de Compra formal (não só "atendida por
  estoque") esbarra nisso. Registrado como candidato a endereçar na Fase 8 (Aprovação de Compras), não
  nesta fase.

## 7. API/UI

Confirmado: nenhuma rota nova, nenhuma tela nesta fase. Ordem mantida: Service → Repository → (API → UI
em fase futura).

## Plano de implementação em subetapas

1. **Subetapa 1 — Schema**: `Requisition.tipo`, `RequisitionItem.materialId` opcional + `description` +
   `quantityFromStock`/`quantityToPurchase`. Testes de schema, sem lógica ainda.
2. **Subetapa 2 — Regra de atendimento por estoque**: split calculado na transição para `"ordered"`,
   `StockMovement` `OUT` gerado, só `quantityToPurchase` alimentando `PurchaseOrderItem`. Testes
   cobrindo: item com estoque total suficiente, parcial, zero, e confirmação de que o fluxo de Produção
   existente não muda de comportamento observável para requisições que hoje já funcionam.
3. **Subetapa 3 — Integração MRP → Requisição**: `MrpSuggestion.status` ganha a transição
   `pending → accepted`; `RequisitionService.createFromMrpSuggestion()` agrupa sugestões de compra
   aceitas numa Requisição `Tipo: "PRODUCAO"`, `originModule: "mrp"`, pulando a regra de atendimento da
   Subetapa 2 (seção 3). Testes cobrindo o fluxo completo sugestão→aprovação→requisição.

## Validação técnica antes da migration (2026-07-09)

### Schema final

```prisma
model Requisition {
  // ... campos existentes, sem mudança ...
  tipo         String @default("PRODUCAO") // PRODUCAO, MANUTENCAO, ALMOXARIFADO, ENGENHARIA, SERVICOS, OUTROS
  originModule String @default("manual")   // manual, production_order, mrp
}

model RequisitionItem {
  // ... campos existentes ...
  materialId            String?           // era obrigatório — agora opcional
  material              Material?         // idem
  description           String  @default("")
  quantityFromStock     Float   @default(0)
  quantityToPurchase    Float   @default(0)
  originMrpSuggestionId String?
  originMrpSuggestion   MrpSuggestion? @relation(fields: [originMrpSuggestionId], references: [id])
}

model MrpSuggestion {
  // ... campos existentes ...
  requisitionItems RequisitionItem[] // inversa de originMrpSuggestionId
}
```

### Impacto nas tabelas existentes

- `Requisition`: 1 coluna nova (`tipo`), 1 valor novo num campo `String` já livre (`originModule`) — não
  é uma migração de coluna, não precisa de nada especial.
- `RequisitionItem`: 1 constraint relaxada (`materialId` NOT NULL → nullable) + 4 colunas novas
  (`description`, `quantityFromStock`, `quantityToPurchase`, `originMrpSuggestionId`). SQLite trata
  `NOT NULL` → `NULL` como operação seibra (não exige backfill, não quebra nenhuma linha existente).
- `MrpSuggestion`: 1 relação inversa nova (`requisitionItems[]`) — não adiciona coluna nenhuma nesse
  model (a FK mora em `RequisitionItem`).
- Nenhuma tabela perde coluna, nenhum tipo de coluna muda, nenhum índice existente é removido.

### Estratégia de migração dos registros atuais

**Nenhuma migração de dados é necessária.** Todas as colunas novas têm `@default(...)` (`tipo` →
`"PRODUCAO"`, as demais → `0`/`""`/`null`) — `prisma db push` aplica isso automaticamente a cada linha
existente no momento em que a coluna é criada. Toda Requisição e todo `RequisitionItem` já cadastrados
passam a ter, respectivamente, `tipo = "PRODUCAO"` (correto, já que 100% deles são hoje requisições de
produção) e `quantityFromStock = quantityToPurchase = 0` (correto, já que essas colunas só passam a ter
significado para requisições que ainda vão avançar para `"ordered"` — histórico já concluído não precisa
ser recalculado retroativamente).

### Impacto nas integrações Produção/Compras

- **Produção**: nenhuma mudança de comportamento observável para o fluxo que já existe
  (`originModule: "manual"`/`"production_order"`, item com `materialId`) — a única diferença é que, a
  partir de agora, parte da necessidade pode ser atendida por estoque em vez de virar 100% Pedido de
  Compra. Isso é o objetivo da fase, não uma regressão; coberto pelos testes de "estoque suficiente" e
  "estoque parcial".
- **Compras**: `PurchaseOrderService.createFromRequisition()` recebe `quantityToPurchase` em vez de
  `quantity` — a interface `RequisitionItemForPurchase` já esperava exatamente esse formato (`materialId`
  obrigatório, `quantity` numérica), então nenhuma mudança de tipo foi necessária ali, só a origem do
  valor mudou na chamada. Itens sem `materialId` são filtrados **antes** de chegar em Compras — nunca
  geram `PurchaseOrderItem` nesta fase (`PurchaseOrderItem.materialId` continua obrigatório, fora do
  escopo — candidato à Fase 8).

## Implementação (2026-07-09)

**Concluída e verificada — Fase 7 completa**, as 3 subetapas:

- **Subetapa 1 (Schema)**: campos acima aplicados em dev e teste.
- **Subetapa 2 (Atendimento por estoque)**: `RequisitionRepository.advanceToOrderedWithFulfillment()`
  (nova, transacional) — calcula o split por item, decrementa `Material.stockQty` e grava
  `StockMovement` `OUT` só para a parte atendida, então avança o status. O guard de "cotação vencedora
  obrigatória" em `RequisitionService.changeStatus()` foi ajustado para exigir fornecedor só dos itens
  que realmente ainda precisam de compra (projeção de estoque calculada antes do guard, não a
  quantidade bruta do item).
- **Subetapa 3 (MRP → Requisição)**: `mrp-suggestion.repository.ts` + `mrp-suggestion.service.ts`
  (novos) — `approve()` valida `status === "pending"` e `suggestionType === "purchase"`, delega a
  `RequisitionService.createFromMrpSuggestion()`, que cria a Requisição e marca a sugestão como
  `"accepted"` numa única transação (`RequisitionRepository.createFromMrpSuggestion()`, nova). `dismiss()`
  também implementado (`status → "dismissed"`, já previsto no schema desde a Fase 6).

**Testes** — 3 novos arquivos, 24 casos: `requisicao-corporativa.test.ts` (Tipo e itens não-estocáveis),
`requisicao-atendimento-estoque.test.ts` (estoque suficiente/parcial/zero, item não-estocável, todos
verificando `StockMovement` e `PurchaseOrderItem` corretos), `mrp-suggestion-approval.test.ts` (aprovar
gera Requisição correta; aprovar duas vezes falha; sugestão de produção rejeitada; descartar; Requisição
do MRP pula a checagem de estoque mesmo com saldo disponível). **77/77 testes passando no total do
projeto.** `tsc --noEmit` confirma o mesmo erro de ambiente pré-existente, não relacionado a este
trabalho.

## Decisões validadas com o usuário (resumo)

| Decisão | Escolha |
|---|---|
| Lista de Tipos | 6 valores finais: `PRODUCAO`/`MANUTENCAO`/`ALMOXARIFADO`/`ENGENHARIA`/`SERVICOS`/`OUTROS` — `TI`/`RH`/`QUALIDADE` removidos da proposta inicial |
| Escopo da integração MRP→Requisição | Construída já na Fase 7, subetapa própria; sem geração automática sem ação humana |
| Regra de atendimento por estoque | Split explícito e persistido (`quantityFromStock`/`quantityToPurchase`), com baixa de estoque real |
| Requisição vinda do MRP e a regra de atendimento | Confirmado: pula a regra por completo (`originModule === "mrp"` → `quantityToPurchase = quantidade calculada pelo MRP`, sem novo desconto de estoque) |
