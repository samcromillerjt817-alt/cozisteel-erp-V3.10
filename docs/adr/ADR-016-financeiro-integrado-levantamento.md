# ADR-016 — Financeiro Integrado (Fase 12): Levantamento Arquitetural

- **Status**: **SUBETAPAS 1-4 IMPLEMENTADAS E EM PRODUÇÃO (2026-07-14)** — schema completo (`Invoice`,
  `AccountReceivable`, `Receipt`, `AccountPayable`, `Payment`, `ProductBatch.materialCost`),
  repositories, `CostingService` (Subetapa 2), `FinancialAccountService` cobrindo Contas a Pagar
  (Subetapa 3) e Contas a Receber (Subetapa 4), `InvoiceService`, wiring de Domain Events
  (`FATURA_EMITIDA` novo; `PEDIDO_COMPRA_RECEBIDO`/`ORDEM_PRODUCAO_FINALIZADA`/
  `PRODUCAO_PARCIAL_REALIZADA` ganharam seus primeiros consumidores) e 21 testes novos — tudo
  implementado, testado (263/263) e com `prisma db push` já aplicado ao banco compartilhado
  (autorizado explicitamente pelo usuário). **Ainda sem rotas de API nem UI — decisão pendente #6
  (RBAC `Module`) e as Subetapas 5-7 continuam por fazer** (`StockValuationService`,
  `FinancialReportService`, RBAC/rotas). Ver seção "Subetapas 1-4 implementadas" no fim deste
  documento para o detalhamento completo.
- **Data**: 2026-07-10 (levantamento) — arquivado 2026-07-10 (Fase 11 + 11.5 tinham prioridade), 7
  decisões pendentes resolvidas em 2026-07-14 assim que a Fase 11.5 fechou
- **Depende de**: ADR-008 (Infraestrutura Financeira, Fase 5.9 — prior art, incorporado aqui, não
  reaberto), ADR-005 (Engenharia/BOM), ADR-006 (Reserva), ADR-007 (MRP), ADR-009 (Requisição
  Corporativa), ADR-010 (Aprovação de Compras), ADR-011 (Produção Parcial), ADR-012 (Reconciliação
  Multinível), ADR-013 (Rastreabilidade de Lote — 4 subetapas, fechada).
- **Contexto de priorização original**: em 2026-07-10 o usuário reordenou o roadmap pela primeira vez —
  numeração das fases mantida (Fase 11 = Dashboard, Fase 12 = Financeiro), mas a **implementação** da
  Fase 12 aconteceria antes da Fase 11, porque o Dashboard depende de dados financeiros que não
  existiam ainda.
- **Escopo desta rodada** (por instrução explícita do usuário): "Não implementar código. Não alterar
  schema. Não criar migrations. Não criar APIs. Não alterar Services existentes. Quero apenas um
  levantamento arquitetural completo." Entregáveis: este ADR; fluxogramas completos; arquitetura
  proposta; entidades propostas; integrações; decisões pendentes; riscos; plano de implementação em
  subetapas.

## Atualização de priorização (2026-07-10)

O usuário **aprovou este levantamento na íntegra** e, na mesma mensagem, reordenou o roadmap uma
segunda vez, por segurança: antes de iniciar qualquer implementação da Fase 12, considerou mais seguro
consolidar primeiro a experiência do usuário e o módulo gerencial. **Nova ordem**: Fase 11 (Dashboard e
KPIs) → Consolidação de UX/UI do sistema → Correções gerais identificadas durante a implantação →
somente depois, implementação da Fase 12 (Financeiro).

Este ADR permanece **arquivado como levantamento técnico validado** — nenhuma das decisões técnicas
registradas aqui (estudo de custeio, entidades propostas, 7 decisões pendentes, riscos, plano de
subetapas) foi invalidada ou precisa ser refeita. Quando a Fase 12 voltar a ser a prioridade de
implementação, este documento é o ponto de partida — não um novo levantamento.

## Retomada (2026-07-14)

Fase 11 (Dashboard/KPIs) e Fase 11.5 (Plataforma Frontend, 12 subetapas + auditoria de consolidação +
rodada de Hardening) fecharam nesta data — ver [[reference-cozisteel-adr-018]]/ADR-018. Nada no
Comercial/Produção/Estoque/Compras mudou de forma que invalidasse este levantamento; a única atualização
de contexto real é que o papel RBAC `financeiro` (achado da Parte 1/10 abaixo) ganhou, nessa mesma rodada
de Hardening, uma aba própria no Dashboard v2 (`dashboard-access.service.ts::PROFILE_ACCESS`) — isso é a
camada de **perfil de Dashboard**, não o `Module` de RBAC que a decisão pendente #6 (Parte 6) trata; as
duas coisas continuam distintas e a decisão #6 segue precisando ser resolvida à parte, o que acontece
nesta mesma rodada. O usuário resolveu as 7 decisões pendentes da Parte 6 nesta data — ver cada uma
marcada como RESOLVIDO abaixo.

## Metodologia

O levantamento foi feito por 3 agentes de auditoria em paralelo, cada um lendo os ADRs relevantes antes
do código-fonte (disciplina do projeto):

1. **Comercial + Produção + Estoque** — Orçamento→Pedido de Venda, ProductionOrder/execução,
   StockMovement.
2. **Compras + Requisições + MRP + infraestrutura reutilizável** — Requisition/PurchaseOrder/
   MrpSuggestion, NumberingService, StatusHistoryService, AuditLog.
3. **Engenharia/BOM + débito técnico fresco** — BomLine/BomRevision, MaterialBatch/ProductBatch/
   BatchConsumption, RBAC, varredura de campos monetários já existentes.

Os três confirmam, de ângulos diferentes, o mesmo diagnóstico central: **existe hoje toda a
infraestrutura relacional (FKs, `referenceType`/`referenceId`, `StatusHistory`, `AuditLog`,
`NumberingService`) para o Financeiro se acoplar sem duplicar responsabilidade — mas não existe nenhum
dado monetário íntegro e auditável na produção, e a única peça de custeio real já implementada
(`MaterialBatch.unitCost`) está isolada, sem consumidor.**

---

## PARTE 1 — Auditoria de reutilização (por módulo)

Confirmação, módulo a módulo, de que o Financeiro pode reaproveitar a infraestrutura existente sem
duplicar responsabilidade (Princípio 5 do ADR-001, Fonte Única da Verdade):

| Módulo | O que já existe e é reutilizável | Lacuna para o Financeiro |
|---|---|---|
| **Comercial** (Quote/SalesOrder) | `SalesOrder.subtotal/discountTotal/total`, `SalesOrderItem.unitPrice/total`, `quoteId` (FK real 1:1) | Nenhum campo de faturamento (nota fiscal, data de faturamento); nenhum vínculo formal Pedido→Título |
| **Produção** (ProductionOrder/ProductBatch) | `ProductBatch`/`BatchConsumption` já capturam a árvore completa de consumo por lote; `bomRevisionId` congela a estrutura na origem | **Zero campo monetário em `ProductionOrder`/`ProductBatch`/`BatchConsumption`** — nenhum custo de mão de obra, overhead, ou custo de material consumido é gravado |
| **Estoque** (StockMovement) | `referenceType`/`referenceId` já é o padrão genérico de origem documental que o ADR-008 cancelou recriar em outro formato; `balanceAfter` já garante trilha de auditoria de quantidade | **Zero campo monetário** — nenhum "valor do movimento", nenhuma valorização; `balanceAfter` é saldo em quantidade, não em valor |
| **Compras** (Requisition/PurchaseOrder) | `PurchaseOrderItem.unitPrice/total`; `RequisitionItem.estimatedPrice`; `Requisition.tipo` já cobre a dimensão de "centro de custo por natureza" prevista no ADR-008 | Nenhum vínculo formal Pedido→Título a Pagar; `approvedBy`/`approvedAt` (ADR-010) já dá o dado de governança que uma Conta a Pagar vai precisar herdar |
| **Aprovação de Compras** (ADR-010) | Máquina de estados `draft→pending_approval→approved→sent→confirmed→partially_received→received` já dá o gatilho correto para "quando gerar o Título a Pagar" (no recebimento, não na aprovação) | — |
| **MRP** (MrpSuggestion) | `quantityShortfall`, rastreabilidade via `MrpSuggestionSource` | Nenhuma dimensão de custo nas sugestões — MRP hoje decide só por quantidade, nunca por impacto financeiro |
| **Requisições/Cotação** | `RequisitionItemQuote.price` já é o primeiro "preço real" que entra no sistema, antes mesmo do Pedido de Compra | — |
| **Lotes** (MaterialBatch/ProductBatch/BatchConsumption, ADR-013) | `MaterialBatch.unitCost` já existe, já é snapshot histórico imutável, já citado no próprio schema como "preparação para custeio por lote (Financeiro, Fase 12)"; `BatchConsumption.quantityConsumed` + `traceBackward()` já expõem toda a árvore de origem de um lote de produto | Nenhuma agregação — o dado bruto para custo real por lote de produto acabado já existe (soma de `unitCost × quantityConsumed` por toda a árvore), só falta a função que soma |
| **Rastreabilidade** (`batch-traceability.service.ts`, ADR-013 Subetapa 4) | `traceForward`/`traceBackward` já retornam DTOs internos com todos os nós e arestas necessários (produto, material, lote, OP, datas, quantidades) | Nenhum campo de custo nos DTOs (`MaterialBatchTraceNode`/`ProductBatchTraceNode`) — extensível sem quebra, são internos e já documentados como "cost calc incomplete for Financeiro" na avaliação crítica da Subetapa 4 |
| **Engenharia/BOM** (BomLine/BomRevision) | Estrutura e quantidade 100% confiáveis e congeladas por revisão | **`BomLine` não tem nenhum campo de custo** — nem a revisão congelada preserva o preço da matéria-prima na data do congelamento; um "custo padrão por revisão" não pode ser lido de lugar nenhum, só recalculado ao vivo |
| **NumberingService** | `getNextNumber(documentType: string)` — genérico por string, sem enum, sem constraint de schema; confirmado 100% reutilizável sem nenhuma mudança de código, só chamando com um novo `documentType` (ex.: `"titulo_receber"`, `"titulo_pagar"`) | — |
| **StatusHistory** | `entityType: string` (comentário no schema já lista os 6 domínios atuais mas o campo é livre-texto, sem enum/constraint) — reutilizável para `"titulo_receber"`/`"titulo_pagar"` sem migração | — |
| **AuditLog** | `module: string`, `beforeValue`/`afterValue` (Fase 5.9) já genéricos — reutilizável para um módulo `"financeiro"` sem mudança de schema | — |
| **RBAC** | Papel `'financeiro'` **já existe** em `src/app/middleware/rbac.ts` (`Role` union) e já é atribuível a usuários reais via UI (`src/app/page.tsx`) | `Module` (mesmo arquivo) **não tem** `'financeiro'` como valor — hoje o papel só enxerga módulos existentes (`orcamentos`, `compras`, `relatorios`, leitura); quando a Fase 12 criar rotas reais, será necessário adicionar `'financeiro'` a `Module` e redesenhar as permissões desse papel |

**Conclusão da Parte 1**: nenhum módulo precisa ser reescrito. O Financeiro se integra por FKs
opcionais + eventos + reaproveitamento de `NumberingService`/`StatusHistoryService`/`AuditService`,
exatamente como o roadmap original previu ("transversal, nunca inicia processo próprio, só reage").

---

## PARTE 2 — Estudo de custeio

### 2.1 O que existe hoje (dados brutos)

| Dado | Onde | Característica |
|---|---|---|
| `Material.costPrice` | `Material` | Manual, editado por humano, **não é atualizado automaticamente** por nenhum recebimento — pode divergir do custo real pago |
| `MaterialBatch.unitCost` | `MaterialBatch` | **Snapshot real e imutável** de `PurchaseOrderItem.unitPrice` no recebimento — o único custo 100% confiável do sistema hoje, mas nunca lido por nenhuma regra |
| `PurchaseOrderItem.unitPrice/total` | `PurchaseOrderItem` | Preço negociado, vira `MaterialBatch.unitCost` no recebimento |
| `RequisitionItemQuote.price` | Cotação | Preço estimado/negociado, anterior ao pedido formal |
| `Product.costPrice` | `Product` | Manual, **sem nenhuma lógica de rollup a partir da BOM** (confirmado — ADR-005 já registrava isso, o levantamento atual confirma que segue exatamente assim) |
| `BomLine` | Estrutura | **Nenhum campo de preço**, nem na revisão congelada — uma BomRevision de 2024 não diz quanto custava a matéria-prima naquela data |
| `BatchConsumption.quantityConsumed` × `MaterialBatch.unitCost` | Relação | **Calculável hoje, não persistido** — a árvore de consumo de um `ProductBatch` (via `traceBackward`, ADR-13) já permite somar `unitCost × quantityConsumed` de toda a origem, mas nenhuma função faz essa soma |
| Mão de obra | — | **Não existe em lugar nenhum** — nenhum apontamento de hora/turno é registrado por OP |
| Overhead (rateio de custos indiretos) | — | **Não existe** — nenhum conceito de rateio, nem manual |
| `StockMovement` | Estoque | **Zero campo monetário** — saldo só em quantidade (`balanceAfter`) |

### 2.2 Modelos de custeio possíveis (avaliação técnica, nenhuma decisão tomada)

**(a) Custo padrão (standard cost)** — explosão da BOM ativa × `Material.costPrice` atual.
- Vantagem: simples, rápido, útil para orçamento/precificação prospectiva.
- Desvantagem: não reflete o que foi realmente pago; `Material.costPrice` já é hoje desatualizado por
  natureza (manual); não tem histórico — recalcular a BOM de uma OP de 6 meses atrás dá o custo de
  HOJE, não o custo de então.

**(b) Custo médio ponderado (moving average cost)** — recalculado a cada entrada de `MaterialBatch`,
persistido em `Material` (novo campo, ex. `averageCost`). Padrão contábil comum (custo médio
ponderado móvel).
- Vantagem: reflete custo real, atualizado automaticamente, não exige navegar a árvore de lotes toda
  vez que se quer saber "quanto custa este material agora".
- Desvantagem: precisa de um evento de recálculo em toda entrada de `MaterialBatch` (acoplamento novo
  Compras→Financeiro); perde a granularidade por lote específico (dilui o real ganho arquitetural que
  o ADR-013 já entregou).

**(c) Custo real por lote (actual/specific cost)** — usa diretamente `MaterialBatch.unitCost` via a
árvore de `BatchConsumption` já existente (ADR-013), sem médias.
- Vantagem: **os dados brutos já existem inteiros**, zero novo campo em `Material`/`MaterialBatch`; é
  o modelo mais preciso (mesmo lote, mesmo preço, sempre); aproveita 100% do investimento já feito na
  Fase 10.
- Desvantagem: custo computado sob demanda (não hoje persistido) — para um relatório de margem
  histórica frequente, recalcular a árvore toda vez pode ser caro (mesma preocupação de performance já
  registrada na avaliação crítica da Subetapa 4 do ADR-013); mão de obra/overhead ainda precisam de um
  mecanismo próprio, não vêm de graça da árvore de lotes.

**Recomendação técnica preliminar (não é decisão — decisão pertence ao usuário na validação deste
ADR)**: **(c) como base de verdade** (aproveita a Fase 10 por completo, mais preciso, zero
retrabalho de schema em `MaterialBatch`), com **um novo campo persistido de custo real por
`ProductBatch`** (ex. `ProductBatch.materialCost` calculado e gravado no momento da produção — não
recalculado depois, mesmo princípio de imutabilidade de `MaterialBatch.unitCost`) para não precisar
re-percorrer a árvore toda vez que o Financeiro/Dashboard quiser ler o custo de um lote já produzido.
Mão de obra e overhead exigem um mecanismo novo e independente (ver 2.3), não derivável de lote
nenhum.

### 2.3 Mão de obra e overhead

Nenhum dado bruto existe hoje para nenhum dos dois. Duas abordagens possíveis, ambas puramente
propostas:
- **Mão de obra**: taxa fixa por hora/tipo de produto × tempo padrão da BOM (se algum dia a BOM
  ganhar um campo de tempo de operação — hoje não tem) ou apontamento manual por OP (novo model,
  ex. `ProductionLaborEntry`, fora do escopo de dado já existente).
- **Overhead**: rateio percentual sobre custo de material (mais simples, sem novo domínio) ou rateio
  por centro de custo (dependeria de `CostCenter` existir — ver ADR-008, gatilho ainda não satisfeito).

Nenhuma das duas tem dado bruto suficiente hoje para ser implementada sem antes decidir a política de
apuração (fora do escopo "levantamento" — vira decisão pendente, seção 6).

### 2.4 Valorização de estoque

Decorre diretamente da escolha de 2.2: se (c), a valorização de estoque de matéria-prima é a soma de
`quantityAvailable × unitCost` de todo `MaterialBatch` aberto (dado já existente, só falta a
agregação); a valorização de produto acabado depende do novo `ProductBatch.materialCost` (proposto)
mais mão de obra/overhead ainda não modelados.

---

## PARTE 3 — Fluxogramas completos

### 3.1 Contas a Receber

```
Orçamento (Quote)
    │  aprovado → convertido manualmente
    ▼
Pedido de Venda (SalesOrder)  [quoteId FK 1:1 — já existe]
    │  status: open → in_production → completed
    ▼
[NOVO] Invoice (entidade própria — decisão pendente #1 RESOLVIDA em 2026-07-14:
        Invoice como entidade própria, não campo/estado em SalesOrder — suporta
        faturamento parcial/múltiplas notas fiscais por Pedido de Venda)
    │  salesOrderId FK (1:N — um SalesOrder pode gerar mais de 1 Invoice)
    ▼
[NOVO] Título Financeiro a Receber (AccountReceivable)
    │  gerado a partir de Invoice.total (não mais direto de SalesOrder.total —
    │  suporta faturamento parcial desde o dia 1)
    │  referenceType="invoice", referenceId=Invoice.id  (padrão já em produção
    │  no StockMovement, reaproveitado — ADR-008 já cancelou um par genérico
    │  concorrente)
    │  status: aberto → parcialmente_recebido → recebido → cancelado (StatusHistory)
    ▼
[NOVO] Recebimento (Payment/Receipt — baixa)
    │  1 ou mais recebimentos parciais por Título (paralelo ao já existente
    │  PurchaseOrderItem.quantityReceived incremental)
    ▼
Baixa do Título (status final, StatusHistory + AuditLog)
```

### 3.2 Contas a Pagar

```
Requisição (Requisition, tipo=PRODUCAO/outros — ADR-009)
    │  status: draft → sent → approved → ordered
    ▼
Pedido de Compra (PurchaseOrder)  [requisitionId FK obrigatória — já existe]
    │  status: draft → pending_approval → approved → sent → confirmed →
    │          partially_received → received  (ADR-010, já implementado)
    ▼
Recebimento físico (já implementado — gera MaterialBatch, incrementa
    PurchaseOrderItem.quantityReceived, cria StockMovement)
    │
    ▼
[NOVO] Título Financeiro a Pagar (AccountPayable)
    │  gerado no recebimento (gatilho natural — approvedAt/sentAt já existem mas
    │  não geram obrigação financeira; a obrigação nasce quando a mercadoria
    │  chega, salvo decisão em contrário do usuário)
    │  referenceType="purchase_order", referenceId=PurchaseOrder.id
    │  valor inicial = PurchaseOrderItem.unitPrice × quantityReceived (não o total
    │  do pedido, para suportar recebimento parcial corretamente desde o dia 1)
    ▼
[NOVO] Pagamento (Payment — baixa)
    │  1 ou mais pagamentos parciais por Título
    ▼
Baixa do Título (status final, StatusHistory + AuditLog)
```

### 3.3 Produção (custo)

```
Ordem de Produção (ProductionOrder) — bomRevisionId congela estrutura (Fase 5)
    │
    ▼
produce() — rodada de produção parcial (ADR-011)
    │  consome MaterialBatch (FIFO) e/ou ProductBatch de subconjunto (ADR-013,
    │  Subetapa 3 — já implementado)
    │  cria BatchConsumption (materialBatchId ou consumedProductBatchId,
    │  quantityConsumed) — já implementado
    ▼
[NOVO] Cálculo de custo real do lote produzido
    │  soma, sobre a árvore de BatchConsumption deste ProductBatch (reaproveita
    │  traceBackward(), ADR-013 Subetapa 4): Σ (unitCost × quantityConsumed)
    │  em toda a origem de matéria-prima
    ▼
[NOVO] ProductBatch.materialCost (proposto — persistido no momento da produção,
        imutável depois, mesmo princípio de MaterialBatch.unitCost)
    │  + mão de obra/overhead (política pendente, Parte 2.3)
    ▼
[NOVO] Produto acabado entra no estoque com custo conhecido
    │  → alimenta Valorização de Estoque (Parte 2.4) e, quando o produto for
    │  vendido, a margem real da venda (SalesOrderItem.unitPrice - custo real)
    ▼
[NOVO] Resultado (receita da venda - custo real de produção) → Financeiro/Dashboard
```

### 3.4 Estoque (valorização)

```
Entradas
    MaterialBatch criado (recebimento de compra) — unitCost já existe
    ProductBatch criado (produção) — materialCost proposto (Parte 3.3)
        │
        ▼
Saídas
    Consumo em produção (BatchConsumption, FIFO) — já rastreado em quantidade
    Venda de produto acabado (SalesOrderItem) — já rastreado em quantidade e preço
        de venda, falta custo de saída (COGS) explícito
        │
        ▼
Transferências (futuras — fora do escopo atual, nenhum model existe)
        │
        ▼
[NOVO] Valorização = Σ (quantityAvailable × unitCost) [matéria-prima, já calculável]
                    + Σ (quantidade em estoque × materialCost) [produto acabado,
                      depende do campo proposto em 3.3]
        │
        ▼
[NOVO] Inventário (comparação valorização calculada vs. contagem física —
        fora do escopo dos 4 fluxos centrais pedidos, citado aqui só como
        consumidor futuro natural da valorização)
```

---

## PARTE 4 — Arquitetura proposta

### 4.1 Princípio geral (reafirma o roadmap original)

Financeiro é um módulo **transversal e reativo**: nunca inicia um processo de negócio sozinho, só
reage a eventos/transições de outros módulos e expõe consultas (saldo, título, extrato). Nenhum
Service de Comercial/Compras/Produção/Estoque passa a *depender* do Financeiro para completar sua
própria operação — a geração de Título é uma consequência, não uma condição (ex.: um Pedido de Venda
continua sendo criado com sucesso mesmo que, hipoteticamente, a geração do Título falhe — tratado como
evento assíncrono/best-effort na mesma linha do ADR-003/ADR-004, não uma transação atômica bloqueante
com o processo comercial).

### 4.2 Camadas (mesmo padrão Route→Service→Repository de todo o projeto)

```
FinancialAccountService        (AccountReceivable / AccountPayable — CRUD + baixa)
FinancialTransactionService    (Payment/Receipt — registra baixa parcial ou total)
CostingService                 (custo real por lote — Σ unitCost×quantityConsumed via
                                 traceBackward(); calcula e persiste ProductBatch.materialCost)
StockValuationService          (valorização de estoque — matéria-prima + produto acabado)
FinancialReportService         (agregações para Dashboard — saldo a receber/pagar, margem,
                                 fluxo de caixa projetado)
```

Cada um com seu Repository próprio (`account-receivable.repository.ts`,
`account-payable.repository.ts`, `payment.repository.ts`), seguindo exatamente o padrão já usado por
`batch-traceability.repository.ts` (métodos read-only aceitando listas de ids, eager-loading
explícito, sem N+1).

### 4.3 Como o Financeiro é alimentado (reativo, não invasivo)

Duas opções técnicas, ambas compatíveis com o que já existe:

**(a) Domain Events** (ADR-003 já implementado) — `SalesOrderConcluida`, `PurchaseOrderRecebida`,
`ProducaoFinalizada` já existem ou são extensões naturais dos payloads já emitidos; um novo handler em
`register-domain-event-handlers.ts` cria o Título correspondente. **Vantagem**: zero acoplamento de
código entre módulos — o módulo de origem nem precisa saber que o Financeiro existe. **Já é o padrão
arquitetural formalmente decidido no ADR-003**, reaproveitar aqui é a opção coerente com o restante do
projeto.

**(b) Chamada direta de Service** (`SalesOrderService` chama `FinancialAccountService` explicitamente)
— mais simples de rastrear no código, mas cria acoplamento direto que o Princípio de módulo-
independência do ADR-001 desaconselha quando um evento já resolveria o mesmo problema.

**Recomendação técnica preliminar**: (a), Domain Events — consistente com a arquitetura já validada
desde a Fase 3 e com o próprio enunciado do roadmap ("Financeiro ... fed by other modules via
Services/Events/document references only").

### 4.4 Integrações confirmadas (reaproveitamento, zero mudança de código nelas)

| Integração | Como |
|---|---|
| `NumberingService` | `getNextNumber("titulo_receber")` / `getNextNumber("titulo_pagar")` — já 100% genérico |
| `StatusHistoryService` | `record("titulo_receber", ...)` / `record("titulo_pagar", ...)` — já 100% genérico |
| `AuditService`/`AuditLog` | `module: "financeiro"` — já 100% genérico |
| Lotes (ADR-013) | `CostingService` chama `batchTraceabilityService.traceBackward()` (read-only, já implementado) para obter a árvore de origem de um `ProductBatch` |
| Produção | Hook no fim de `produceWithTx()` (ou evento pós-produção) para calcular e persistir `ProductBatch.materialCost` |
| Compras | Hook no recebimento (já existe o ponto exato — onde `MaterialBatch` é criado hoje) para gerar `AccountPayable` |

---

## PARTE 5 — Entidades propostas

Todas com `String?` opcionais onde a integridade referencial ainda não está 100% garantida (mesma
disciplina do ADR-008), migrações aditivas apenas.

```prisma
// NOVO — decisão pendente #1 RESOLVIDA (2026-07-14): Invoice como entidade própria, não campo/
// estado em SalesOrder. Um SalesOrder pode gerar mais de 1 Invoice (faturamento parcial).
model Invoice {
  id            String   @id
  number        String   @unique          // via NumberingService "nota_fiscal" (ou "invoice")
  salesOrderId  String
  salesOrder    SalesOrder @relation(...)
  total         Float
  issuedAt      DateTime
  notes         String   @default("")
  createdAt     DateTime @default(now())
  userId        String
  accountReceivable AccountReceivable?
}

model AccountReceivable {
  id            String   @id
  number        String   @unique          // via NumberingService "titulo_receber"
  invoiceId     String   @unique           // FK real — sempre existe uma origem (Invoice, não mais SalesOrder direto)
  invoice       Invoice @relation(...)
  amount        Float
  dueDate       DateTime
  status        String   @default("open") // open, partially_paid, paid, cancelled
  notes         String   @default("")
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  userId        String
  receipts      Receipt[]
}

model Receipt {
  id                   String @id
  accountReceivableId  String
  amount               Float
  paidAt               DateTime
  notes                String @default("")
  userId               String
}

model AccountPayable {
  id                String   @id
  number            String   @unique       // via NumberingService "titulo_pagar"
  purchaseOrderId   String
  purchaseOrder     PurchaseOrder @relation(...)
  amount            Float
  dueDate           DateTime
  status            String   @default("open")
  notes             String   @default("")
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  userId            String
  payments          Payment[]
}

model Payment {
  id                String @id
  accountPayableId  String
  amount            Float
  paidAt            DateTime
  notes             String @default("")
  userId            String
}
```

**Extensão proposta em entidade existente** (não uma entidade nova):

```prisma
model ProductBatch {
  // ... campos existentes, inalterados ...
  materialCost  Float?  // NOVO — Σ(unitCost × quantityConsumed) da árvore de origem no
                         // momento da produção; imutável depois, mesmo princípio de
                         // MaterialBatch.unitCost. Null enquanto não calculado.
}
```

**Não propostos nesta rodada** (avaliados e descartados ou adiados, com justificativa):
- `CostCenter` — decisão pendente #5 RESOLVIDA (2026-07-14): **continua adiado**. Segue exatamente a
  decisão já consolidada do ADR-008 (infraestrutura oportunista, condicionada a dois gatilhos); a Fase
  12 não é o gatilho — fica para quando um rateio por centro de custo for exigido por regra de negócio
  concreta.
- `ProductionLaborEntry`/rateio de overhead — decisão pendente #4 RESOLVIDA (2026-07-14): **fora do
  escopo desta rodada**. Sem dado bruto suficiente hoje (Parte 2.3); implementar só custo de material
  primeiro (Subetapa 2), mão de obra/overhead numa subetapa futura quando houver apontamento real.

---

## PARTE 6 — Decisões pendentes (todas RESOLVIDAS pelo usuário em 2026-07-14)

1. **Faturamento é uma entidade própria (`Invoice`) ou um campo/estado dentro de `SalesOrder`?**
   Impacta diretamente o modelo de `AccountReceivable` (referenceType aponta para `SalesOrder` direto,
   ou para `Invoice`, que por sua vez aponta para `SalesOrder`).
   **RESOLVIDO: `Invoice` como entidade própria.** Suporta faturamento parcial/múltiplas notas fiscais
   por Pedido de Venda desde o dia 1. Schema atualizado na Parte 5, fluxo atualizado na Parte 3.1.
2. **O gatilho de geração do Título a Pagar é o recebimento físico (proposta da Parte 3.2) ou a
   confirmação do pedido (`confirmedAt`)?** Afeta se compras "a caminho" já aparecem como obrigação
   financeira ou só quando a mercadoria chega.
   **RESOLVIDO: recebimento físico**, conforme a proposta original da Parte 3.2 — sem mudança no
   fluxograma.
3. **Modelo de custeio**: (a) padrão, (b) médio ponderado, ou (c) real por lote (recomendação técnica
   preliminar da Parte 2.2) — decisão do usuário, não deste levantamento.
   **RESOLVIDO: (c) custo real por lote**, confirmando a recomendação técnica preliminar — sem mudança
   na Parte 2.2/2.4/3.3.
4. **Política de mão de obra e overhead**: taxa fixa, apontamento manual, ou fora do escopo inicial da
   Fase 12 (implementar só custo de material primeiro, mão de obra/overhead numa subetapa posterior)?
   **RESOLVIDO: fora do escopo inicial.** Subetapa 2 (`CostingService`) cobre só custo de material;
   mão de obra/overhead ficam para uma subetapa futura, fora do plano desta rodada (ver Parte 9).
5. **`CostCenter` (ADR-008)**: a Fase 12 é o gatilho (2) que o ADR-008 previu? Se sim, este é o
   momento de finalmente criar o model, já que o gatilho (1) — domínio real de Centro de Custos —
   também estaria nascendo agora pela primeira vez junto com o Financeiro.
   **RESOLVIDO: não é o gatilho.** `CostCenter` continua adiado, mesma condição do ADR-008 original —
   sem mudança na Parte 5 ("Não propostos nesta rodada").
6. **RBAC**: adicionar `'financeiro'` a `Module` agora (nesta fase) ou só quando as rotas reais forem
   criadas (subetapa de implementação, não de levantamento)?
   **RESOLVIDO: só na Subetapa 7**, junto com as rotas reais — sem mudança no plano da Parte 9.
7. **Domain Events vs. chamada direta (Parte 4.3)** — confirmar a recomendação técnica preliminar
   (Events) ou preferir acoplamento direto por simplicidade de rastreamento no código.
   **RESOLVIDO: Domain Events**, confirmando a recomendação técnica preliminar — sem mudança na Parte
   4.3.

---

## PARTE 7 — Riscos

| Risco | Descrição | Mitigação proposta |
|---|---|---|
| **Retrabalho em `ProductionOrder`/`PurchaseOrder`/`Requisition`** | O ADR-008 previa que `costCenterId`/`financialReferenceId` entrariam "de carona" nas Fases 7/8 — essa janela já passou sem aproveitamento (achado do Agente 3). A Fase 12 vai precisar tocar essas 3 tabelas de qualquer forma. | Aceitar o retrabalho como já reconhecido pelo próprio ADR-008 ("se as duas condições não se confirmarem, o campo continua adiado — não é criado só porque a tabela já está sendo mexida"); a mudança agora é uma migração aditiva de baixo risco, não uma remodelagem. |
| **Cálculo de custo sob demanda pode ser caro em relatórios frequentes** | `CostingService` que recalcula via `traceBackward()` toda vez que o Dashboard pedir margem de uma venda específica repete a mesma preocupação de performance já registrada na avaliação crítica do ADR-013 Subetapa 4. | Persistir `ProductBatch.materialCost` no momento da produção (Parte 5) resolve a maior parte do custo de leitura recorrente; documentar a complexidade esperada na subetapa de implementação, sem otimizar prematuramente. |
| **Divergência entre `Material.costPrice` (manual) e `MaterialBatch.unitCost` (real)** | Já existe hoje; se o Financeiro usar o campo errado como base, o custeio fica sistematicamente incorreto. | Modelo de custeio (c) da Parte 2.2 usa exclusivamente `MaterialBatch.unitCost`, nunca `Material.costPrice`, eliminando a ambiguidade por design. |
| **Recebimento/pagamento parcial multiplica estados** | Títulos com baixas parciais (`Receipt`/`Payment` 1:N) precisam de uma máquina de estados análoga à de `PurchaseOrder` (`partially_received`) — não trivial de acertar na primeira tentativa. | Reaproveitar literalmente o padrão já testado em `PurchaseOrderItem.quantityReceived` (incremental, idempotente) em vez de desenhar um novo do zero. |
| **Escopo de custeio (mão de obra/overhead) sem dado bruto** | Modelar essas entidades sem uma política decidida é especulação — o oposto da disciplina do projeto. | Decisão pendente #4 (Parte 6) resolve isso antes de qualquer schema ser desenhado para essas duas dimensões. |
| **RBAC incompleto para rotas reais do Financeiro** | Papel `'financeiro'` já existe mas sem módulo próprio — se rotas forem criadas sem atualizar `Module`, o RBAC não consegue proteger `financeiro/*` de forma granular. | Resolver a decisão pendente #6 antes de criar a primeira rota real (subetapa de implementação). |

---

## PARTE 8 — Preparação para Fase 11 (Dashboard) — indicadores que passam a existir automaticamente

Conforme pedido explicitamente pelo usuário, mapeamento do que o Dashboard poderá exibir sem
levantamento adicional assim que a Fase 12 estiver implementada:

- **Saldo total a receber / a pagar** (soma de `AccountReceivable`/`AccountPayable` em aberto).
- **Fluxo de caixa projetado** (títulos por `dueDate`, já com o dado de vencimento no modelo proposto).
- **Margem real por venda** (receita de `SalesOrderItem` menos custo real via `ProductBatch.materialCost`
  + mão de obra/overhead quando decididos).
- **Valorização de estoque** (matéria-prima: imediata, via `MaterialBatch`; produto acabado: quando
  `ProductBatch.materialCost` existir).
- **Inadimplência/atraso** (títulos vencidos e não baixados — decorre diretamente de `dueDate` +
  `status`).
- **Custo médio por produto ao longo do tempo** (série histórica de `ProductBatch.materialCost` por
  produto, já rastreável por `producedAt`).

Indicadores que **não** ficam disponíveis automaticamente (dependem de decisões pendentes ainda não
tomadas): margem líquida (falta overhead), custo padrão vs. real (falta decisão de modelo de custeio),
qualquer indicador de centro de custo (falta `CostCenter`, ADR-008).

---

## PARTE 9 — Plano de implementação em subetapas (proposto, não iniciado)

1. **Subetapa 1 — Schema e infraestrutura básica**: `Invoice`, `AccountReceivable`, `Receipt`,
   `AccountPayable`, `Payment`, `ProductBatch.materialCost` (migração aditiva). `CostCenter` NÃO entra
   (decisão pendente #5 resolvida: continua adiado).
2. **Subetapa 2 — `CostingService`**: cálculo real de custo de MATERIAL por `ProductBatch` via
   `traceBackward()` existente, persistido no momento da produção (hook em `produceWithTx()` ou Domain
   Event `ProducaoFinalizada`). Mão de obra/overhead ficam fora (decisão pendente #4 resolvida).
3. **Subetapa 3 — Contas a Pagar**: `FinancialAccountService`/`Repository` para `AccountPayable`,
   gatilho no recebimento físico de `PurchaseOrder` (decisão pendente #2 resolvida), via Domain Event
   (decisão pendente #7 resolvida), `NumberingService`/`StatusHistoryService` reaproveitados.
4. **Subetapa 4 — Faturamento + Contas a Receber**: `Invoice` (decisão pendente #1 resolvida — entidade
   própria) gerada a partir de `SalesOrder`, depois `AccountReceivable` a partir do `Invoice`, espelhando
   a máquina de baixa parcial da Subetapa 3.
5. **Subetapa 5 — `StockValuationService`**: valorização de matéria-prima (imediata) e produto acabado
   (depende da Subetapa 2).
6. **Subetapa 6 — `FinancialReportService`**: agregações que alimentam a Fase 11 (Dashboard) — só
   depois das subetapas anteriores existirem, para não construir sobre dado incompleto.
7. **Subetapa 7 — RBAC e rotas**: `Module` ganha `'financeiro'` (decisão pendente #6 resolvida — só
   aqui, não antes), rotas reais expostas, revisão das permissões hoje concedidas ao papel
   `'financeiro'` (achado do Agente 3, Parte 1).
8. **Subetapa 8 (futura, fora do escopo desta rodada) — Mão de obra e overhead**: registrada aqui só
   para não se perder — depende de uma política de apuração ainda não decidida (decisão pendente #4:
   "fora do escopo inicial"); não tem levantamento próprio ainda, precisa de um quando for retomada.

Cada subetapa segue a mesma disciplina de todas as fases anteriores: levantamento específico se
necessário, implementação, testes, `graphify update .`, atualização do ADR-001. Mudança de schema
(Subetapa 1) exige autorização explícita e separada do usuário antes de rodar contra o banco
compartilhado — mesma regra permanente do projeto, mesmo com o ADR já validado.

---

## PARTE 10 — Achados de débito técnico registrados nesta rodada

Novos (não catalogados em nenhum ADR anterior), confirmados pelo Agente 3:

1. **Papel RBAC `'financeiro'` já existe sem módulo próprio** (`src/app/middleware/rbac.ts`,
   `src/app/page.tsx:3769`) — promessa de UI antecipando uma fase que ainda não existia. Não é bug
   funcional hoje (não há rota a proteger), mas deve ser resolvido antes da Subetapa 7 acima.
2. **Janela de aproveitamento oportunista do ADR-008 já passou** — Fases 7 e 8 tocaram `Requisition`/
   `PurchaseOrder`/`ProductionOrder` sem o segundo gatilho (`CostCenter` real) ter se confirmado a
   tempo; a Fase 12 vai precisar voltar a essas tabelas, o retrabalho que o ADR-008 tentava evitar.
   Não é um erro de execução — o próprio ADR-008 já previa esse cenário como possível — mas fica
   formalmente registrado aqui como o desfecho real.
3. **`BomLine`/`BomRevision` não preservam preço nem na revisão congelada** — mais fino que o já
   catalogado ADR-005 (que fala da ausência de rollup em `Product`): mesmo uma revisão `released`
   antiga não tem como responder "quanto custava esta estrutura quando foi congelada".

Estes 3 itens serão adicionados ao log de decisões do ADR-001 nesta mesma rodada de atualização de
documentação.

---

## Conclusão

Este levantamento confirma que a Fase 12 é tecnicamente viável com retrabalho baixo a médio,
apoiando-se quase inteiramente em infraestrutura já construída (NumberingService, StatusHistory,
AuditLog, ADR-013 lotes/rastreabilidade, ADR-008 já validado). O maior vazio real era o custeio (nenhum
custo de produção jamais foi calculado ou persistido) e as 7 decisões da Parte 6 — **todas resolvidas
pelo usuário em 2026-07-14**: custo real por lote, `Invoice` como entidade própria, Título a Pagar no
recebimento físico, mão de obra/overhead fora do escopo inicial, `CostCenter` continua adiado, `Module`
RBAC só na Subetapa 7, integração via Domain Events.

**O levantamento está encerrado. A Subetapa 1 (schema/infraestrutura básica) está pronta para começar,
pendente apenas da autorização explícita e separada do usuário para a migração de schema contra o banco
compartilhado** — a mesma regra que se aplicou a toda mudança de schema neste projeto até aqui, mesmo
com a arquitetura já 100% validada.

---

## Subetapas 1-4 implementadas (2026-07-14)

Usuário autorizou a migração completa numa passada só ("banco compartilhado está praticamente vazio... não vejo vantagem em manter o schema do código e o banco divergentes"), com uma diretriz explícita: **priorizar um schema limpo e bem modelado em vez de compatibilidade com estruturas provisórias** — este é o melhor momento para acertar a modelagem, antes do Financeiro entrar em uso real.

**Schema** (`prisma/schema.prisma`) — migração 100% aditiva, confirmada via `prisma migrate diff` antes do `db push` (1 `ALTER TABLE ProductBatch ADD COLUMN materialCost` nullable + 5 `CREATE TABLE` novas, nenhum `DROP`/alteração de coluna existente):
- `Invoice` (novo, decisão pendente #1): `salesOrderId` (FK, sem `@unique` — 1 Pedido de Venda pode gerar N faturas, faturamento parcial).
- `AccountReceivable`: `invoiceId @unique` (1 fatura → no máximo 1 título), `status` open/partially_paid/paid/cancelled.
- `Receipt`: `accountReceivableId` (`onDelete: Cascade` — histórico de baixa nunca sobrevive sozinho ao título).
- `AccountPayable`: `purchaseOrderId @unique` (1 pedido de compra → no máximo 1 título, valor recalculado a cada recebimento parcial, nunca duplicado) — SEM cascade a partir de `PurchaseOrder` (mesmo princípio já usado por `MaterialBatch.purchaseOrderId`: um registro financeiro nunca deve sumir só porque o documento de origem foi apagado).
- `Payment`: `accountPayableId` (`onDelete: Cascade`, mesmo motivo de `Receipt`).
- `ProductBatch.materialCost Float?` — calculado e persistido pela `CostingService`, `null` até o primeiro cálculo.
- Back-relations adicionadas em `User` (5 novas: `invoices`/`accountReceivables`/`receipts`/`accountPayables`/`payments`), `SalesOrder.invoices`, `PurchaseOrder.accountPayable`.

**Domain Events** (`src/lib/domain-events.ts`) — 1 evento novo (`FATURA_EMITIDA`) + os 3 primeiros consumidores reais de eventos que já existiam "sem consumidor nesta fase" desde fases anteriores (`PEDIDO_COMPRA_RECEBIDO` desde a Fase 8; `ORDEM_PRODUCAO_FINALIZADA`/`PRODUCAO_PARCIAL_REALIZADA` desde a Fase 9) — nenhum produtor precisou saber que o Financeiro existe, só os payloads de produção ganharam `productBatchId` (já disponível em runtime via `produceWithTx()`, só nunca antes exposto no contrato do evento).

**Services** (`src/app/services/`):
- `costing.service.ts` — `calculateAndPersistMaterialCost(productBatchId)`: soma `unitCost × quantityConsumed` de toda a árvore de `batchTraceabilityService.traceBackward()` (já achatada através de subconjuntos multinível, Fase 10/ADR-013), persiste em `ProductBatch.materialCost`. Idempotente.
- `financial-account.service.ts` — CRUD + baixa de Contas a Pagar/Receber (um só Service para os dois lados, mesmo desenho do ADR-016 Parte 4.2). `upsertPayableFromPurchaseOrder()` recalcula `amount` do zero a cada recebimento (nunca incrementa — resiliente a um handler eventualmente repetido); `registerPayment()`/`registerReceipt()` rejeitam valor acima do saldo em aberto e títulos já `paid`/`cancelled`; `cancelPayable()`/`cancelReceivable()` só permitidos em `open` (zero baixa registrada).
- `invoice.service.ts` — `createFromSalesOrder(salesOrderId, amount, dueDate, userId)`: `amount` sempre explícito (nunca herdado automaticamente de `SalesOrder.total`), preparado para faturamento parcial mesmo sem nenhuma tela ainda decidindo como o usuário informaria um valor parcial.

**Achado disclosed, não uma das 7 decisões resolvidas**: nenhuma das 7 decisões cobria "de onde vem o vencimento" de um título. Adotado um padrão default de 30 dias corridos a partir do evento gatilho (`DEFAULT_DUE_DAYS` em `financial-account.service.ts`), comentado explicitamente no código como provisório — revisar quando o Financeiro ganhar uma política real de condição de pagamento (a mesma lacuna já existe hoje em `Quote`/`Supplier.paymentTerms`, texto livre sem uso em nenhum cálculo).

**Testes** — 21 novos (263/263 total): `tests/costing-service.test.ts` (5, incluindo produção parcial vs. total, produto sem `lotControlled`, e árvore com subconjunto de 2 níveis), `tests/financial-account-payable.test.ts` (8, incluindo recálculo idempotente em 2º recebimento parcial, rejeição de pagamento acima do saldo, `AuditLog`), `tests/financial-account-receivable.test.ts` (8, incluindo faturamento parcial com 2 Invoices por SalesOrder, idempotência de `createReceivableFromInvoice`). 2 testes pré-existentes (`purchase-order-approval.test.ts`, `lot-traceability-receiving.test.ts`) tiveram sua limpeza (`afterAll`) ajustada para apagar `AccountPayable`/`Payment` antes do `PurchaseOrder` — consequência esperada da nova FK sem cascade, não uma regressão.

**Fora do escopo desta rodada, por decisão do usuário nas 7 perguntas**: rotas de API, RBAC `Module`, qualquer UI — ver decisão pendente #6 (Parte 6) e o restante do plano de subetapas (5-7, Parte 9).

tsc/lint(58, líquido zero)/build/263 testes limpos, `prisma db push` aplicado ao banco compartilhado (diff 100% aditivo, autorizado explicitamente pelo usuário), `pm2 restart` executado, `graphify update .` e esta atualização executados no fechamento.

### Correção mesma data: vencimento deixa de ser um prazo fixo, passa a ler `paymentTerms`

Achado do usuário revisando a entrega: o `DEFAULT_DUE_DAYS=30` acima ignorava que `Quote`/`SalesOrder`/
`PurchaseOrder`/`Supplier` já carregam um campo `paymentTerms` (`PAYMENT_TERMS_OPTIONS`,
`src/lib/payment-terms.ts`, Subetapa 11.5.10) — duplicação de regra evitada a tempo, não implementada.
Investigação confirmou: o campo é hoje **só um rótulo de exibição** (interpolado em PDFs, nunca
parseado em lugar nenhum) — nenhuma lógica de cálculo de vencimento existia para reaproveitar
diretamente, só a lista de valores possíveis.

`payment-terms.ts` ganhou `resolveDueDays()`/`resolveDueDate()` — única fonte de verdade tanto para o
vocabulário quanto para o cálculo de prazo, usada por `FinancialAccountService`
(`purchaseOrder.paymentTerms`) e `InvoiceService` (`salesOrder.paymentTerms`, `dueDate` deixou de ser
parâmetro explícito do `createFromSalesOrder`, sempre derivado). Termos de parcela única
("30 dias", "À vista") são exatos; termos com mais de uma parcela ("30/60 dias", "30/60/90 dias",
"Entrada + 30 dias") usam o prazo da ÚLTIMA parcela como vencimento do título inteiro — simplificação
disclosed, não uma tentativa de repartir o valor: o schema atual modela 1 título = 1 valor = 1
vencimento; parcelas de fato como títulos separados exigiria relaxar `invoiceId`/`purchaseOrderId` de
`@unique` para 1:N, uma decisão de schema nova. 2 testes novos (265/265 total) provam a leitura correta
(`45 dias`/`À vista`). tsc/lint(58)/build/265 testes limpos, `pm2 restart` executado (sem mudança de
schema — campo já existia).

**Decisão do usuário sobre a lacuna de parcelamento**: manter a simplificação atual (1 título = prazo
da última parcela) — não modelar parcelas separadas agora. Revisitar quando o Financeiro tiver tela real
e o parcelamento verdadeiro for de fato exigido, evitando modelar uma política de repartição (proporção
de entrada? parcelas iguais?) sem validação de negócio concreta.

Usuário aprovou as 4 confirmações (Invoice 1:N, mapa de eventos, fluxogramas, `materialCost` congelado)
e autorizou as Subetapas 5-7, com 4 diretrizes permanentes reforçadas para o resto da evolução do ERP:
Domain Events como primeira opção de integração entre módulos (nunca chamada direta quando um evento
resolve); Services concentram toda regra de negócio, Repositories sem lógica de domínio, rotas finas;
reaproveitamento máximo antes de qualquer lógica paralela; `StockValuationService`/`FinancialReportService`
pensados como componentes reutilizáveis (API + Dashboard + relatórios futuros), nunca implementação
específica de uma tela.

## Subetapa 5 — StockValuationService (implementada, 2026-07-14)

**Matéria-prima**: valorização precisa por lote — `Σ (MaterialBatch.quantityAvailable × unitCost)`,
mesmo dado que já alimenta `CostingService`/`traceBackward()` (Fase 10), nunca `Material.costPrice`
(manual, já catalogado como não confiável na Parte 2.1). `getRawMaterialValuation()` agrupa por
material e devolve também um custo médio ponderado (`value / quantityAvailable`) para exibição.

**Produto acabado — achado novo, disclosed antes de implementar** (mesmo padrão usado para
parcelamento/vencimento): diferente de `MaterialBatch`, `ProductBatch` não tem campo
`quantityAvailable` — nada no schema decrementa um lote de produção quando o produto é vendido
(`SalesOrderItem` não referencia `ProductBatch`). Não há como saber "quanto resta em estoque de um
lote de produção específico" — só o saldo agregado (`Product.stockQty`) existe. `getFinishedGoodsValuation()`
usa esse saldo agregado × o custo de material do `ProductBatch` mais recente já produzido daquele
produto — uma **aproximação**, não uma soma por lote como a de matéria-prima. Produtos sem nenhum
`ProductBatch` (nunca produzidos via fluxo `lotControlled`) devolvem `unitCost`/`value` como `null`
(ausência de dado, não zero). Modelar precisão por lote de verdade exigiria adicionar
`quantityAvailable` a `ProductBatch` e decrementá-lo também na venda — mudança de schema nova, fora do
escopo desta subetapa (mesmo espírito da decisão de parcelamento: evoluir quando houver necessidade
concreta).

Novo repository `stock-valuation.repository.ts` (leitura pura, deliberadamente separado de
`stock.repository.ts` — domínio de lotes/custo, não de operação de estoque) usa `distinct`+`orderBy`
do Prisma para resolver "o `ProductBatch` mais recente por produto" sem N+1. `StockValuationService`
não é chamado por nenhuma rota/UI ainda (Subetapa 7) — já nasce reutilizável por desenho: qualquer
consumidor futuro (API, Dashboard, relatório) chama os mesmos 3 métodos (`getRawMaterialValuation`,
`getFinishedGoodsValuation`, `getTotalValuation`), nunca uma versão paralela.

5 testes novos (270/270 total). tsc/lint(58, líquido zero)/build/270 testes limpos, `pm2 restart`
executado (sem mudança de schema).

## Subetapa 6 — FinancialReportService (implementada, 2026-07-14)

Agregações financeiras de leitura, pensadas desde o início como componente reutilizável (nenhum método
é específico de tela) — mesma diretriz reforçada pelo usuário antes de autorizar as Subetapas 5-7.
`getStockValuation()` **delega inteiramente** a `StockValuationService` (Subetapa 5), nunca recalcula
por conta própria — zero duplicação entre os dois serviços.

5 métodos, todos em `financial-report.service.ts`:
- `getAccountBalances()`: saldo em aberto/vencido de Contas a Receber e a Pagar, somando sobre
  `findOpenWithReceipts()`/`findOpenWithPayments()` (novos métodos nos repositories já existentes —
  nenhum repository novo só pra isso).
- `getProjectedCashFlow(daysAhead)`: agrupa o saldo em aberto por dia de vencimento; títulos já vencidos
  caem no bucket de hoje (nunca omitidos, nunca soltos num bucket passado que a UI teria que filtrar).
- `getStockValuation()`: delega, como descrito acima.
- `getGrossMarginEstimate(from, to)`: **estimativa agregada, disclosed** — mesma limitação estrutural já
  identificada na Subetapa 5 (nenhum vínculo `SalesOrderItem`→`ProductBatch` no schema). Calcula receita
  real do período menos um custo estimado via o `ProductBatch.materialCost` mais recente conhecido por
  produto × quantidade vendida — não é margem calculada venda a venda. Expõe `costCoveragePercent`
  (% da receita cujo produto tinha custo conhecido) para o consumidor decidir se a estimativa é confiável
  o bastante pro que está exibindo. Resolver de verdade exigiria a mesma mudança de schema já registrada
  como pendente na Subetapa 5 (rastrear qual lote atendeu qual venda) — não antecipada aqui, mesmo
  espírito da decisão de parcelamento/valorização por lote.
- `getMaterialCostHistory(productId)`: série histórica de `ProductBatch.materialCost` por produto, direto
  do fato imutável já estabelecido na Subetapa 2.

Novo repository `financial-report.repository.ts`, só com as 2 leituras que não pertencem a nenhum
repository de entidade já existente (`findSalesOrderItemsInPeriod`, `findMaterialCostHistory`).

**Bug de teste encontrado e corrigido durante o gate, não no serviço**: `financial-report-service.test.ts`
tinha um `afterAll` que travava com violação de FK ao apagar os usuários de teste. Causa raiz: aprovar um
Orçamento com item vinculado a um Produto real gera Ordem(ns) de Produção automaticamente
(`quote.service.ts::changeStatus`, comportamento já existente desde a Fase 8/ADR-010, documentado no
plano de Hardening da Plataforma) — o teste 4 (margem bruta) faz exatamente isso ao vender 3 unidades de
um produto recém-produzido, e a OP gerada automaticamente nunca era capturada em `createdOrderIds`,
deixando `ProductionOrder`/`MaterialReservation`/`StockMovement` órfãos referenciando o usuário de teste.
Corrigido capturando `generatedProductionOrders` do retorno de `changeStatus(..., 'approved', ...)` nos
dois helpers do arquivo. Isso também eliminava o efeito colateral que fazia `mrp-execution.test.ts` falhar
(poluição de `ProductionOrder` órfã vista pelo teste seguinte na mesma execução da suíte) — resolvido como
consequência direta, não por uma correção separada.

5 testes novos (275/275 total). tsc/lint(58, líquido zero)/build/275 testes limpos, `pm2 restart`
executado (sem mudança de schema).

## Subetapa 7 — RBAC e rotas (implementada, 2026-07-14)

**RBAC**: `Module` ganha `'financeiro'` (decisão pendente #6 da Parte 6, só nesta subetapa, como
decidido). Fecha também o achado ① da Parte 10 (papel `financeiro` sem módulo próprio). Revisão da
matriz completa (achado do Agente 3, Parte 1) — nenhuma permissão pré-existente do papel `financeiro`
em outros módulos foi alterada, só a nova coluna `financeiro` foi adicionada a todos os 9 papéis,
seguindo o mesmo padrão já usado para `compras`/`estoque` (módulo cujo papel homônimo já existia):
- `admin` e `financeiro` (dono do domínio): CRUD completo + `manage` + `export`.
- `manager`: CRUD completo + `export`, sem `manage` — mesmo nível que já tem em `compras`/`estoque`.
- `user`, `viewer`, `comercial`, `producao`, `compras`, `estoque`: só `read` — mesma visibilidade ampla
  e somente-leitura que esses papéis já têm sobre a maioria dos módulos operacionais do ERP.

`role-permissions-preview.tsx` (Hardening pós-11.5) ganhou o rótulo "Financeiro" — sem isso o TypeScript
já teria barrado o build (`Record<Module, string>` exige todo membro do union), confirmando que o tipo
protege exatamente essa classe de esquecimento.

**Rotas** — todas finas (só `requireAuth`/`requireModulePermission` + `validateDto` + chamada a um
Service já existente, nenhuma regra de negócio na rota), seguindo exatamente a mesma convenção do resto
do projeto (GET só exige sessão autenticada, sem checagem de módulo — mesmo padrão já usado em
`/api/purchase-orders`/`/api/reports`; mutações exigem `requireModulePermission('financeiro', 'update')`):

- `GET /api/financeiro/contas-a-pagar` / `GET .../[id]` — novos `listPayables`/`getPayableById` em
  `FinancialAccountService` (únicos métodos de Service genuinamente novos desta subetapa; o resto da
  lógica de negócio — criação, baixa, cancelamento — já existia desde as Subetapas 1/3/4).
- `POST /api/financeiro/contas-a-pagar/[id]/pagamentos` — `registerPayment`.
- `POST /api/financeiro/contas-a-pagar/[id]/cancelar` — `cancelPayable`.
- Mesma tríade espelhada em `/api/financeiro/contas-a-receber` (`listReceivables`/`getReceivableById`,
  `registerReceipt`, `cancelReceivable`).
- `GET /api/financeiro/relatorios/{saldo,fluxo-caixa,valorizacao-estoque,margem,custo-material/[productId]}`
  — expõem 1:1 os 5 métodos de `FinancialReportService` (Subetapa 6), sem transformação nenhuma além de
  parsing de query string (`daysAhead`, `from`/`to`).

Novos schemas `registerPaymentSchema`/`registerReceiptSchema` em `src/app/dto/index.ts` (`amount`
positivo, `paidAt`, `notes` opcional) — mesmo formato dos DTOs já existentes no arquivo.

**Sem UI nesta subetapa** (fora do escopo desta rodada, igual às Subetapas 5/6) — as rotas existem e
estão prontas para consumo, mas nenhuma tela do Financeiro foi construída. 6 testes novos, cobrindo só a
lógica de Service genuinamente nova (`listPayables`/`getPayableById`/`listReceivables`/
`getReceivableById` — filtro por status, paginação, relacionamentos no detalhe, `NotFoundException` para
id inexistente). As rotas em si não têm teste dedicado, seguindo o mesmo limite de cobertura já usado em
todo o projeto (nenhuma rota de API deste repositório é testada via HTTP direto — só os Services por
trás dela; não há suíte e2e contra o banco compartilhado do PM2, regra permanente do projeto).

281/281 testes. tsc/lint(58, líquido zero)/build/281 testes limpos, `pm2 restart` executado (sem mudança
de schema).

**Com isso, a Fase 12 (Financeiro Integrado) tem as Subetapas 1-7 completas** — schema, custeio real por
lote, Contas a Pagar, Faturamento + Contas a Receber, valorização de estoque, relatórios agregados e
RBAC/rotas, todas em produção. Resta só a Subetapa 8 (mão de obra/overhead), registrada como futura desde
a Parte 9, sem levantamento próprio ainda — não é gatilho automático, aguarda necessidade concreta.

## Subetapa 7-UI — Telas de Contas a Pagar/Receber (implementada, 2026-07-14)

As rotas da Subetapa 7 ficaram sem nenhuma tela até aqui, por decisão explícita. O usuário pediu para
seguir para a UI do Financeiro logo depois do relatório consolidado das Subetapas 5-7 — primeiro uso real
de tudo que foi implementado nas 7 subetapas anteriores.

**Arquitetura**: segue o mesmo padrão "plataforma" da Fase 11.5 (component-first) sem nenhuma exceção —
`src/components/modules/financeiro/financeiro-page.tsx` replica exatamente a estrutura de
`estoque-page.tsx` (abas dentro do `actions` do `PageHeader`, cada aba com seu próprio efeito de
carregamento, nunca um efeito compartilhado) e de `compras-page.tsx` (`DetailDrawer` + diálogo de ação
totalmente controlado pela página, sem lógica de fetch dentro do diálogo). 3 arquivos novos:
`financeiro/types.ts`, `financeiro/financeiro-page.tsx`, `financeiro/register-movement-dialog.tsx` (um
único diálogo para as duas ações de baixa — Contas a Pagar/Receber têm exatamente os mesmos 3 campos,
`kind` só muda rótulo e endpoint). `status-tokens.ts` ganhou o domínio `financeiro` (`open/partially_paid/
paid/cancelled`, o mesmo vocabulário dos dois modelos). `page.tsx` ganhou a entrada `financeiro` em
`ModuleKey`/`breadcrumbMap`/`navGroups` (grupo "GESTÃO", ao lado de Relatórios) e o bloco de renderização
condicional — nenhuma mudança de RBAC necessária (`Module` e a matriz de permissões já existiam desde a
Subetapa 7 de backend).

**Bug pré-existente encontrado e corrigido, fora do escopo original desta rodada**: `CurrencyInput`
(`src/components/form/currency-input.tsx`) sobrepunha seu próprio prefixo visual "R$" a um `text` que já
vinha de `formatCurrency()` — e `formatCurrency()` passou a incluir "R$" no próprio texto desde a
Hardening pós-11.5 (Prioridade 4). Resultado: todo campo monetário do sistema (8 telas já existentes:
Orçamentos, Requisições, Materiais, Produtos, Fornecedores) exibia "R$ R$ 1.234,56" em produção, um bug
real e já ativo, não introduzido por esta rodada — só descoberto porque o novo diálogo de pagamento ia
reproduzir o mesmo problema visivelmente. Corrigido removendo o prefixo visual duplicado do componente
(o texto de `formatCurrency()` já é suficiente); nenhum call site precisou mudar.

**Achado de disciplina de lint, não um atalho aceito às cegas**: a primeira versão do
`RegisterMovementDialog` sincronizava `amount`/`dateText`/`notes` via um `useEffect` reagindo a `open`
(mesma ideia de um formulário que reseta ao reabrir) — isso gerou um warning novo de
`react-hooks/set-state-in-effect`. Em vez de aceitar o warning ou usar um artifício, o diálogo foi
redesenhado para ser 100% controlado pelo chamador (mesmo padrão já usado por
`purchase-order-receive-dialog.tsx`): `financeiro-page.tsx` semeia os 3 campos no próprio handler de
clique que abre o diálogo (`openRegisterPayment`/`openRegisterReceipt`), nunca num efeito — o warning foi
eliminado, não suprimido. Os 2 warnings que sobraram (`financeiro-page.tsx`, os dois efeitos
`if (view === 'pagar') loadPayables()`/`if (view === 'receber') loadReceivables()`) são exatamente o
mesmo padrão sistêmico já presente 3× em `estoque-page.tsx` (aceito no baseline há poucas horas, mesma
sessão) e em todo o resto do ERP — nenhuma alternativa local existe sem uma mudança arquitetural de
"carregamento de lista" cross-cutting, fora do escopo de uma tela nova. Lint final: 60 (baseline 58 + 2
desta categoria já tolerada, líquido zero para qualquer coisa evitável).

**Incidente operacional durante o deploy, não relacionado ao código**: ao reiniciar o PM2 após o build,
o daemon havia sido resetado (`pm2 list` veio vazio) — provavelmente um reinício do WSL entre as sessões
anteriores e esta. Recuperado com `pm2 resurrect` (restaura a partir do dump salvo em
`~/.pm2/dump.pm2`), confirmado com um `curl` retornando 200 antes de prosseguir. Nenhuma perda de dados —
o processo só precisou ser re-registrado no daemon, o build e o banco de dados nunca foram afetados.

tsc limpo, lint 60 (líquido zero para o evitável), build limpo, 281/281 testes (nenhuma mudança de
lógica de backend, suíte inalterada), `pm2 restart` confirmado com smoke test HTTP 200. Validação visual
funcional depende do usuário no navegador — mesma regra permanente do projeto (sem ferramenta de
screenshot/e2e automatizado).
