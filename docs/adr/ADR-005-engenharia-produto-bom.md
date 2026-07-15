# ADR-005 — Engenharia do Produto (BOM — Bill of Materials)

- **Status**: Implementado e verificado — Subetapas 1 (Estrutura da BOM), 2 (`Product.productType`) e 3
  (Operações) concluídas. Fase 4 completa
- **Data**: 2026-07-09
- **Depende de**: [ADR-001 — Princípios Arquiteturais](./ADR-001-principios-arquiteturais.md), princípios
  4 ("Documento Único, Responsabilidade Única"), 5 ("Fonte Única da Verdade") e 6 ("Rastreabilidade
  Total"); [ADR-002 — Máquina de Estados](./ADR-002-maquina-de-estados.md) (o conceito de Revisão proposto
  aqui reaproveita `checkTransition()`)
- **Escopo explicitamente fora desta fase** (por instrução do usuário): MRP, reserva de estoque,
  Financeiro, qualquer alteração em Produção existente (`ProductionOrder`/`ProductionOrderService`/
  `ProductionOrderRepository` não são tocados). Este ADR é levantamento e proposta — nenhum código,
  nenhuma migração de schema, nenhum dado movido.

## Contexto

O roadmap V4 (12 fases, aprovado em 2026-07-09) previa "BOM snapshot" como um item dentro de uma fase
maior ("Separação Comercial/Industrial"). O usuário decidiu elevar isso a uma fase própria — Engenharia
do Produto é grande e estruturalmente independente o suficiente para merecer seu próprio ADR antes de
qualquer código, especialmente porque o MRP (fase futura do roadmap) depende inteiramente de uma
estrutura de BOM que hoje é rasa (um nível só) e sem revisão.

## Levantamento — o que existe hoje

### Produtos (`Product`)
Cadastro plano: dimensões (`width`/`height`/`length`/`thickness`/`weight`), `volumeM3` calculado
(`width×height×length÷1_000_000`), preços (`costPrice`/`salePrice` — **campos manuais, não calculados**,
sem nenhuma lógica de rollup de custo a partir da estrutura), impostos (`ncm`/`ipi`/`icms`), um vínculo
"legado" `materialId` (1 material principal por produto, sem quantidade — não é a receita real) e
`active` (soft-delete). **Nenhum campo de versão/revisão existe.**

### Matérias-primas (`Material`)
Cadastro plano: `unit` (string livre — KG/UN/M/M2/M3/L/CHAPA), `stockQty`/`minStockQty`, `costPrice`
(último custo de aquisição), vínculo com fornecedores (`SupplierMaterial`, com `lastPrice`/`leadTimeDays`/
`isPreferred`).

### Estruturas — dois modelos, só um deles em uso real

- **`ProductMaterial`** (Produto ↔ Material, N:N com `quantity`/`unit`/`scrapPct`/`notes`) — **esta é a
  única estrutura realmente usada hoje**: `ProductService.linkMaterial()`/`unlinkMaterial()`/
  `listLinkedMaterials()` (CRUD completo), consumida por `ProductionOrderRepository
  .completeAndConsumeStock()` (baixa de matéria-prima na conclusão de OP) e por `RequisitionService
  .suggestForProductionOrder()` (sugestão de compra). É **plana — um nível só**: Produto consome
  Material diretamente, nunca Produto consome Produto.
- **`BomItem`** (Produto ↔ Produto, `componentId` aponta pra outro `Product`, com `quantity`/`unit`/
  `notes`) — **existe no schema, mas está completamente órfão**: nenhum Repository, nenhum Service,
  nenhuma rota de API o cria, edita ou apaga. `ProductRepository` só o inclui num `findByIdDetailed`
  (leitura, sempre vazio na prática) e `ProductService.update()` só o cita para excluí-lo do corpo de
  update genérico (evitar erro do Prisma). **Achado central deste levantamento**: a estrutura multinível
  já foi desenhada uma vez no schema e nunca foi construída — não é um gap a inventar do zero, é um
  scaffold morto a decidir se reaproveita ou substitui.

### Quantidades e perdas planejadas (scrap)
`ProductMaterial.quantity` (por 1 unidade do produto) + `ProductMaterial.scrapPct` (% de perda) — usados
juntos em `completeAndConsumeStock`: `consumedQty = pm.quantity × orderQty × (1 + pm.scrapPct/100)`. Isso
só existe para a relação Produto→Material. `BomItem` também tem `quantity`, mas nenhum `scrapPct` — e,
sendo órfão, não é consumido por nada.

### Unidades de medida
Não existe um cadastro mestre de unidade. `unit` é uma `String` livre repetida em pelo menos 7 lugares
(`Material.unit`, `Product.unit`, `ProductMaterial.unit`, `BomItem.unit`, `RequisitionItem.unit`,
`PurchaseOrderItem.unit`, itens de Orçamento/Pedido de Venda). Nenhuma validação de compatibilidade,
nenhum fator de conversão — o sistema confia cegamente no que foi digitado.

### Operações e tempo de fabricação
**Não existe nenhum modelo.** Nenhuma tabela de operação/roteiro, nenhum campo de tempo padrão (setup ou
processamento) em `Product` nem em `ProductionOrder`. `ProductionOrder.priority` (`low`/`normal`/`high`/
`urgent`) é a única noção de "tempo" hoje, e é só prioridade de fila, não estimativa de duração.

### Revisões de engenharia
**Não existe nenhum conceito de versão.** Uma alteração em `ProductMaterial` (quantidade, perda, ou
vínculo novo/removido) sobrescreve o estado atual sem deixar histórico — não há como saber, depois, qual
era a receita de um produto em uma data específica, nem justificar uma mudança de engenharia.

### O ponto mais importante encontrado: sem snapshot na Ordem de Produção
O ADR-001 (princípio 5) já declara: *"Engenharia controla a BOM (exceto o snapshot congelado dentro de
uma Ordem de Produção já criada)"* — mas esse snapshot **nunca foi implementado**.
`ProductionOrderRepository.completeAndConsumeStock()` lê `order.product.materials` (a relação viva de
`ProductMaterial`) **no momento da conclusão da OP**, não uma cópia capturada na criação. Consequência
prática: se alguém editar a receita (quantidade ou `scrapPct`) enquanto uma OP está `planned`/
`in_progress`, a baixa de estoque na conclusão usa a receita **nova**, não a que estava em vigor quando a
OP foi planejada — um problema real de rastreabilidade/auditoria (contradiz o próprio princípio 5, que já
foi formalmente adotado). Fechar esse gap é trabalho de uma fase futura (exige tocar `ProductionOrder`,
fora do escopo combinado agora) — mas a modelagem proposta abaixo precisa deixar isso possível sem
redesenho.

## Lacunas identificadas (mapeadas contra os 7 pontos pedidos)

| Lacuna pedida | Situação hoje |
|---|---|
| Estrutura multinível (BOM) | `BomItem` existe no schema, zero implementação — Produto só "explode" um nível (direto pra Material) |
| Componentes e subconjuntos | Nenhuma distinção entre "produto vendável", "subconjunto fabricado" e "item comprado pronto" — `Product` é um modelo único e indiferenciado |
| Revisão de engenharia | Inexistente — sem versão, sem histórico, sem estado (rascunho/liberado/obsoleto) |
| Perdas planejadas (scrap) | Existe só para Material (`ProductMaterial.scrapPct`); não existe para consumo de componente/subconjunto |
| Unidades de medida | Só strings livres, sem cadastro mestre, sem conversão |
| Tempo padrão de produção | Inexistente — nenhum modelo de Operação/Roteiro |
| Preparação para MRP | `RequisitionService.suggestForProductionOrder()` já faz um cálculo bruto-menos-saldo, mas só 1 nível — MRP de verdade precisa explodir a árvore inteira recursivamente, o que hoje é estruturalmente impossível (não há árvore, só uma relação direta) |

## Modelagem proposta

### Princípio orientador
Reaproveitar o que já existe sempre que fizer sentido (não descartar `ProductMaterial`/`BomItem` do dia
pra noite), introduzir uma estrutura **nova, aditiva**, e migrar Produção pra ela **numa fase futura**,
não nesta. As tabelas atuais continuam funcionando exatamente como estão enquanto a nova estrutura é
construída e validada em paralelo.

### 1. `BomRevision` — a Revisão de Engenharia (nova)
Uma revisão é um "instantâneo nomeado e versionado" da estrutura de um produto.

```
BomRevision
  id
  productId          → Product (o produto/subconjunto que esta revisão descreve)
  revisionCode        String   // "A", "B", "01", "02"... convenção da empresa, não fixada aqui
  status              String   // draft, released, obsolete — máquina de estados (ADR-002/checkTransition)
  effectiveFrom        DateTime?
  notes                String
  createdBy → User
  releasedBy → User?
  releasedAt           DateTime?
  createdAt / updatedAt
```
Regra de negócio proposta (não implementada agora, só desenhada): só uma revisão por produto pode estar
`released` (ativa) por vez — `draft` → `released` → `obsolete`, com `checkTransition()` do jeito que já
existe pra Requisição/Pedido de Compra. Isso dá rastreabilidade total: toda mudança de engenharia vira uma
revisão nova, nunca uma edição silenciosa da anterior.

### 2. `BomLine` — unifica material e componente numa só estrutura (nova, substitui conceitualmente `BomItem`)
Uma linha de uma revisão específica — material OU componente, nunca os dois.

```
BomLine
  id
  bomRevisionId       → BomRevision
  lineType             String   // "material" | "component"
  materialId           → Material?       (preenchido só se lineType = "material")
  componentProductId   → Product?        (preenchido só se lineType = "component")
  quantity              Float             // por 1 unidade do produto pai
  unit                  String
  scrapPct              Float             // perda planejada — agora vale pros DOIS tipos de linha
  referenceOperationId  → Operation?      (opcional — qual operação consome esta linha)
  order                 Int               // sequência de exibição
  notes                 String
```
Por que unificar em vez de manter `ProductMaterial` + `BomItem` separados: hoje são dois conceitos quase
idênticos (quantidade + unidade + perda + nota) só com o alvo diferente (Material vs. Produto) — manter
separados duplicaria toda a lógica de explosão de BOM (uma função pra percorrer material, outra pra
percorrer componente). Uma única `BomLine` com discriminador permite **um único algoritmo recursivo** de
explosão: para cada linha `component`, busca a `BomRevision` liberada daquele produto e repete.

### 3. `Operation` / `ProductOperation` — tempo padrão de fabricação (novo, mínimo)
Catálogo reaproveitável de tipos de operação + o vínculo por revisão com o tempo padrão:

```
OperationType             // catálogo mestre, mesmo padrão de Category/Material
  id
  name                    String   // "Corte a Laser", "Dobra", "Solda", "Pintura"...
  description             String

ProductOperation          // join: quais operações uma revisão usa, em que ordem, quanto tempo
  id
  bomRevisionId → BomRevision
  operationTypeId → OperationType
  sequenceOrder    Int
  setupTimeMinutes Float
  runTimeMinutesPerUnit Float
  notes            String
```
Deliberadamente mínimo: **não é** um sistema de roteiro/capacidade (sem alocação de recurso/máquina, sem
calendário, sem sequenciamento entre ordens). Isso é o suficiente pra guardar "quanto tempo padrão essa
revisão leva", que é o que foi pedido — um motor de capacidade real seria uma fase própria, futura, se e
quando for necessário.

### 4. `UnitOfMeasure` — cadastro mestre (novo, aditivo, não obrigatório ainda)
```
UnitOfMeasure
  code                 String @id   // "KG", "UN", "M", "M2", "M3", "L"...
  description           String
  family                String       // "massa", "comprimento", "area", "volume", "contagem"
  baseUnitCode          String?      // pra que unidade este converte, se houver
  conversionFactorToBase Float?
```
Proposta **deliberadamente conservadora**: criar o cadastro agora (barato, sem risco), mas **não** trocar
nenhum dos ~7 campos `unit: String` existentes por uma FK nesta fase — isso tocaria Orçamento, Pedido de
Venda, Requisição, Pedido de Compra, todos fora do escopo combinado. `BomLine.unit`/
`ProductOperation` (novos) podem opcionalmente referenciar `UnitOfMeasure.code` desde o início, já que são
tabelas novas sem dado legado para migrar.

### 5. Diferenciação de tipo de Produto (ajuste pequeno, aditivo)
Para o MRP futuro decidir corretamente se explode mais fundo ou trata como item de compra, proponho um
campo novo em `Product` (com default que preserva 100% do comportamento atual):
```
Product.productType   String @default("finished")  // "finished" | "subassembly" | "purchased"
```
`"finished"` continua sendo o padrão implícito de hoje (nada muda pra produtos existentes). Isso não
exige nenhuma outra alteração em `Product` nem em nenhuma rota atual — é só um campo novo com default.

## Relacionamentos (visão consolidada)

```
Product ──┬── BomRevision (1:N, "as revisões que descrevem ESTE produto")
          │      └── BomLine (1:N, "as linhas desta revisão")
          │             ├── Material (se lineType=material)
          │             └── Product (se lineType=component — RECURSIVO: aponta pra outro produto,
          │                           que por sua vez tem suas próprias BomRevision/BomLine)
          │      └── ProductOperation (1:N, "as operações desta revisão")
          │             └── OperationType (catálogo)
          │
          └── ProductMaterial (mantido, inalterado — receita "plana" que Produção ainda lê)
          └── BomItem (mantido, inalterado, ainda órfão — decisão de aposentar fica pra depois)
```

## Impacto sobre o restante do ERP

- **Produção (`ProductionOrder`/`ProductionOrderService`/`ProductionOrderRepository`): zero mudança
  nesta fase.** Continua lendo `ProductMaterial` exatamente como hoje. O gancho para ler
  `BomRevision`/`BomLine` (e finalmente snapshotar a receita na criação da OP, fechando o gap do ADR-001
  princípio 5) é trabalho de uma fase futura, deliberadamente não iniciado agora.
- **Requisição (`RequisitionService.suggestForProductionOrder`): zero mudança nesta fase.** Continua
  explodindo só 1 nível via `ProductMaterial`. A explosão multinível recursiva via `BomLine` é o que
  habilita o MRP de verdade — não implementado agora.
- **Estoque, Financeiro: nenhum impacto.** Nenhum campo de saldo, nenhuma regra de custo/estorno é tocada.
- **Compras**: nenhuma mudança — `SupplierMaterial` continua sendo a única fonte de fornecedor/prazo.
- **Graphify**: grafo atualizado ao final deste ADR para refletir a nova documentação.

## Preparação para MRP (documentado, não implementado)

Quando o MRP for de fato construído (fase futura do roadmap), ele precisará de: (1) percorrer
recursivamente `BomLine` a partir da `BomRevision` `released` de um produto, agregando necessidade bruta
por matéria-prima final (parando a recursão em linhas `lineType=material` ou em componentes
`productType=purchased`); (2) cruzar com saldo de Estoque e prazos de `SupplierMaterial`/`Supplier`; (3)
gerar Requisições com `Tipo=Produção` (decisão já tomada na Fase 7 do roadmap original). Nada disso é
construído agora — a modelagem acima existe para que, quando chegar a hora, não seja necessário redesenhar
o schema de novo.

## Campos de preparação para Financeiro (cross-cutting, por diretriz permanente já registrada)
Nenhum campo de `originDocumentType`/`originDocumentId`/`costCenterId` é necessário nestas tabelas novas —
Engenharia não gera lançamento financeiro nem documento rastreável por Centro de Custo diretamente
(quem gera é a Ordem de Produção, quando eventualmente referenciar a revisão). Nada a preparar aqui além
do que já foi decidido.

## Decisões validadas com o usuário (2026-07-09)

1. **Unificar em `BomLine`** (confirmado) — um só modelo de linha de BOM (material ou componente), um só
   algoritmo de explosão recursiva. `ProductMaterial`/`BomItem` continuam existindo e funcionando
   exatamente como hoje (Produção não é tocada); a migração de fonte de verdade fica para fase futura.
2. **`Product.productType`** (confirmado) — campo novo, default `"finished"`, preserva 100% do
   comportamento de todo produto existente.
3. **Escopo de Operação/Tempo Padrão** (confirmado) — catálogo mínimo (`OperationType` +
   `ProductOperation`, tempo de setup/execução por revisão), sem motor de capacidade, roteiro ou alocação
   de recurso/máquina.

## Subetapa 1 — Estrutura da BOM (implementada e verificada, 2026-07-09)

**Schema**: `BomRevision` e `BomLine` adicionados exatamente como modelados (ver seções acima), com as
relações reversas em `Product` (`bomRevisions`, `bomLineUsages`), `Material` (`bomLines`) e `User`
(`bomRevisionsCreated`/`bomRevisionsReleased`). `OperationType`/`ProductOperation` **não** foram incluídos
neste push — ficam reservados para a Subetapa 3, mantendo cada subetapa isolada em sua própria mudança de
schema. `prisma db push` aplicado no banco de dev e no banco de teste dedicado (`.env.test`).

**Repository**: `bom-revision.repository.ts` e `bom-line.repository.ts`, seguindo o padrão de Fase 1
(`BaseRepository`, sem regra de negócio). Destaque: `BomRevisionRepository.release()` roda numa
`db.$transaction` — obsoleta qualquer outra revisão `released` do mesmo produto antes de ativar a atual,
garantindo atomicidade da regra "só uma revisão ativa por vez" (ADR-001 princípio 3).

**Service**: `bom.service.ts` concentra toda a regra de negócio:
- `createRevision`/`updateRevision`/`deleteRevision` — só rascunho pode ser editado ou excluído; revisão
  liberada ou obsoleta é imutável (histórico).
- `changeStatus` — usa `checkTransition()` (mesmo motor da Fase 2) com o mapa `draft→[released,
  obsolete]`, `released→[obsolete]`, `obsolete→[]`. Uma vez liberada, uma revisão nunca volta pra
  rascunho — mudanças de estrutura exigem uma revisão nova.
- `addLine`/`updateLine`/`removeLine` — só permitidas com a revisão em `draft`; valida que o material ou
  produto-componente referenciado existe; bloqueia um produto ser componente de si mesmo (checagem direta,
  não detecção de ciclo profundo — ver "o que fica de fora" abaixo).

**Decisão explícita: sem rotas de API nesta subetapa.** Diferente dos outros domínios do ERP (que já
tinham rotas por trás de uma UI existente antes da extração pra Service), Engenharia do Produto é
funcionalidade nova, sem consumidor hoje. Adicionar rotas + módulo de RBAC (`engenharia` em
`src/app/middleware/rbac.ts`, que exigiria tocar as 9 combinações de Role) antes de a estrutura de dados
estar completa (falta Subetapa 2 e 3) geraria retrabalho. Rotas ficam para quando a Subetapa 3 estiver
pronta ou quando uma UI for de fato necessária.

**Testes** (`tests/bom-revision.test.ts`, 7 casos, integração contra o banco de teste dedicado):
criação da primeira revisão; rejeição de `revisionCode` duplicado; adição de linha de material E de
componente na mesma revisão; rejeição de auto-referência (produto componente de si mesmo); liberação de
revisão obsoletando automaticamente a anterior (incluindo `releasedById`); rejeição de transição inválida
(`obsolete → released`) e bloqueio de edição de estrutura fora de rascunho; exclusão permitida em
rascunho e bloqueada em revisão liberada. **16/16 testes passando** (7 novos + 9 da Fase 3.1).
`tsc --noEmit` limpo (só o débito de `page.tsx` já catalogado no ADR-001).

**O que fica de fora, por decisão** (não é lacuna esquecida — é escopo deliberado desta subetapa):
detecção de ciclo profundo (A contém B contém A através de várias camadas) — só a auto-referência direta
é checada; ciclos indiretos só importam quando a explosão de BOM existir de fato (fora do escopo,
restrição explícita do usuário). Migração de dado de `ProductMaterial`/`BomItem` para `BomLine` — não
iniciada, os modelos antigos continuam sendo a fonte de verdade que Produção lê.

**Confirmação arquitetural verificada** (2026-07-09, nada implementado): o modelo atual já suporta uma
futura `ProductionOrder.bomRevisionId` sem refatoração estrutural — ver seção "Log de Decisões" abaixo
para o raciocínio completo. Uma revisão liberada/obsoleta nunca é editada nem apagada pelo Service, e
`BomLine` é sempre escopado por revisão, então o mecanismo de snapshot que o ADR-001 (princípio 5) já
promete sai de graça da Subetapa 1, sem precisar de uma tabela de cópia separada.

## Subetapa 2 — Tipos de Produto (implementada e verificada, 2026-07-09)

**Validação de impacto** (pedida antes de qualquer migração): `ProductRepository` não enumera campos
(tudo `Record<string, unknown>` repassado ao Prisma) e toda consulta de Produto usa `include` só para
relações — o campo escalar novo aparece automaticamente em qualquer resposta existente, sem tocar
Repository. `ProductService.create()` monta o objeto de inserção campo a campo (não usa spread), então um
produto novo só ganha `productType` se eu adicionar essa linha explicitamente — decisão foi não adicionar,
então todo produto novo continua recebendo o default do schema exatamente como antes. `ProductService
.update()` já espalha o corpo da requisição (`...updateData`), então o campo seria tecnicamente aceitável
via PUT assim que a coluna existisse — mas nada envia isso hoje, efeito prático zero. **Confirmado: mudança
100% aditiva, sem efeito no comportamento atual.**

**Valores confirmados com o usuário**: `productType String @default("finished")` — `"finished"` (Produto
Acabado), `"subassembly"` (Subconjunto), `"raw_material"` (Matéria-prima), `"service"` (Serviço). Mesmo
padrão de outros enums do schema (`ProductionOrder.status`, `.priority`): código em inglês, comentário em
português no schema.

**Decisão confirmada**: campo existe só no schema por enquanto — **não** adicionado a
`createProductSchema` nem ao corpo explícito de `ProductService.create()`/`update()`. Mesma disciplina da
Subetapa 1: expor via API fica para quando a Subetapa 3 estiver pronta ou quando houver consumidor real.

**Testes** (`tests/product-type.test.ts`, 5 casos): produto novo sem informar nada recebe `"finished"`
por padrão; os 4 valores propostos são gravados e lidos corretamente. **21/21 testes passando** no total
(5 novos + 16 anteriores). `tsc --noEmit` limpo.

## Subetapa 3 — Operações (implementada e verificada, 2026-07-09)

**Schema**: `OperationType` (catálogo mestre — só `name`/`description`/`active`, nenhum tempo) e
`ProductOperation` (a operação de fato, específica de uma `BomRevision` — `sequenceOrder`,
`description`, `setupTimeMinutes`, `runTimeMinutesPerUnit`, `workCenter` texto livre, `notes`).
Orientação de modelagem do usuário seguida à risca: tempo pertence só a `ProductOperation`, nunca ao
catálogo; `workCenter` continua texto livre nesta fase; nenhuma capacidade finita, programação,
apontamento ou calendário. `BomRevision` ganhou a relação reversa `operations ProductOperation[]`. Push
aplicado em dev e teste.

**Sequência preparada para inserção futura**: `sequenceOrder` usa incrementos de 10 (10, 20, 30...),
calculados automaticamente pelo Service quando não informado (`SEQUENCE_STEP = 10` em
`bom.service.ts`) — `findMaxSequenceOrder()` no Repository busca o maior valor já usado na revisão e
soma 10; a primeira operação de uma revisão nova recebe 10. Um `sequenceOrder` explícito (ex: 15) pode
ser informado para inserir uma operação entre duas existentes sem renumerar nada — verificado no teste
"respeita sequenceOrder explícito e permite inserir entre operações existentes".

**Service**: `bomService` ganhou `listOperationTypes`/`createOperationType` (catálogo, com checagem de
nome duplicado) e `listOperations`/`addOperation`/`updateOperation`/`removeOperation` (escopados por
revisão, reaproveitando o mesmo `assertDraft()` já usado pelas linhas de estrutura — operação também só
pode ser alterada com a revisão em rascunho, mesma imutabilidade de revisão liberada/obsoleta da
Subetapa 1).

**Decisão mantida**: sem rotas de API — mesma disciplina das Subetapas 1 e 2.

**Testes** (`tests/product-operation.test.ts`, 5 casos): criação de tipo de operação + rejeição de nome
duplicado; auto-atribuição de sequência em incrementos de 10; sequência explícita permitindo inserção no
meio sem renumerar; rejeição de `operationTypeId` inexistente e bloqueio de edição/remoção fora de
rascunho; atualização e remoção completas em revisão de rascunho. **26/26 testes passando** no total (5
novos + 21 anteriores). `tsc --noEmit` limpo.

## Fase 4 — Conclusão

As 3 subetapas (Estrutura da BOM, Tipos de Produto, Operações) estão implementadas, testadas e
documentadas. Nenhuma rota de API foi criada em nenhuma das 3 — decisão consistente, validada a cada
etapa, de terminar o modelo de domínio primeiro. Nenhuma linha de código de Produção, Estoque, Financeiro
ou Compras foi tocada. MRP, reserva de estoque, explosão automática de BOM, custeio, planejamento e
controle de qualidade permanecem inteiramente fora do escopo, como combinado.

## Log de Decisões

| Data | Decisão |
|---|---|
| 2026-07-09 | Levantamento completo do domínio de Engenharia do Produto: `BomItem` existe no schema desde antes, mas está órfão (sem Repository/Service/rota) — achado central; `ProductMaterial` é a única estrutura em uso, plana, um nível só; sem snapshot de BOM na criação de OP apesar do ADR-001 princípio 5 já prometer isso; zero suporte a Operação/Tempo Padrão/Revisão de Engenharia |
| 2026-07-09 | Modelagem proposta e validada com o usuário: `BomRevision` (revisão versionada via `checkTransition()`), `BomLine` (unifica material+componente, substituindo `ProductMaterial`/`BomItem` como conceito, sem migrar dado ainda), `OperationType`/`ProductOperation` (tempo padrão mínimo, sem motor de capacidade), `UnitOfMeasure` (cadastro mestre novo, sem migrar campos de texto livre existentes), `Product.productType` (novo, default seguro) |
| 2026-07-09 | Confirmado explicitamente: nenhuma implementação nesta rodada — Produção, Estoque, Financeiro e Compras permanecem intocados; nenhuma migration de schema executada. Implementação da Fase 4 começa apenas quando o usuário der o próximo sinal |
| 2026-07-09 | **Subetapa 1 concluída**: `BomRevision`/`BomLine` implementados no schema (push em dev e teste), `BomRevisionRepository`/`BomLineRepository`/`BomService` criados seguindo o padrão Route→Service→Repository; regra "só uma revisão ativa por vez" implementada via transação atômica; imutabilidade de revisão liberada/obsoleta aplicada em todos os métodos de escrita; 7 testes de integração cobrindo as regras de negócio, todos passando; decisão explícita de não criar rotas de API ainda (sem consumidor/UI nesta fase) |
| 2026-07-09 | **Confirmação arquitetural** (verificada, nada implementado): o modelo atual já suporta uma futura `ProductionOrder.bomRevisionId` sem refatoração estrutural. Motivos: (1) seria um FK opcional novo, mesmo padrão já usado por `productId`/`salesOrderId` em `ProductionOrder`; (2) uma revisão `released`/`obsolete` é imutável e nunca é apagada pelo Service (`deleteRevision` só aceita `draft`), então o registro referenciado sobrevive indefinidamente; (3) `BomLine` é escopado por `bomRevisionId` (nunca editado fora de `draft`), então consultar as linhas de uma revisão específica no futuro sempre retorna exatamente o conjunto congelado daquele momento — o mecanismo que fecharia o gap de snapshot do ADR-001 princípio 5 sai de graça da Subetapa 1, sem precisar de uma tabela de cópia separada. Único cuidado para quando essa integração for construída: validar em Service que `bomRevision.productId === productionOrder.productId` (validação cruzada comum, não uma restrição de schema) |
| 2026-07-09 | **Subetapa 2 concluída**: `Product.productType` adicionado (`finished`/`subassembly`/`raw_material`/`service`, default `"finished"`), validado como mudança 100% aditiva antes do `db push` (Repository não enumera campos, `create()` não usa spread — produtos novos continuam sem o campo definido explicitamente). Decisão confirmada de não expor via API ainda, mesma disciplina da Subetapa 1. 5 testes novos (default + os 4 valores), 21/21 passando no total |
| 2026-07-09 | **Subetapa 3 concluída**: `OperationType`/`ProductOperation` implementados exatamente conforme orientação do usuário (tempo só em `ProductOperation`, `workCenter` texto livre, sem capacidade/programação/apontamento/calendário). `sequenceOrder` em incrementos de 10, auto-calculado pelo Service, permitindo inserção futura sem renumeração — verificado em teste dedicado. Mesma imutabilidade de revisão liberada/obsoleta da Subetapa 1 reaproveitada via `assertDraft()`. 5 testes novos, 26/26 passando no total |
| 2026-07-09 | **Fase 4 concluída.** As 3 subetapas implementadas, testadas e documentadas sem tocar Produção/Estoque/Financeiro/Compras e sem expor nenhuma rota de API — decisão consistente de terminar o modelo de domínio antes de expor interface. MRP, reserva de estoque, explosão automática, custeio, planejamento e controle de qualidade permanecem fora do escopo |
