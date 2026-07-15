# ADR-006 — Reserva de Material (Fase 5)

- **Status**: Implementado e verificado — Subetapas 1 (Schema), 2 (Explosão de BOM) e 3 (Serviço de
  Reserva) concluídas. Fase 5 completa
- **Data**: 2026-07-09
- **Depende de**: [ADR-005 — Engenharia do Produto (BOM)](./ADR-005-engenharia-produto-bom.md) (a
  explosão de estrutura usa `BomRevision`/`BomLine`); [ADR-002 — Máquina de Estados](./ADR-002-maquina-de-estados.md)
  (cancelamento/reabertura de OP tocam a máquina de estados já existente)
- **Escopo explicitamente fora desta fase** (por instrução do usuário): MRP, compras automáticas,
  planejamento, capacidade finita, custo industrial. Este ADR é levantamento e proposta — nenhum código,
  nenhuma migração de schema.

## Contexto

A Fase 4 construiu o modelo de Engenharia (`BomRevision`/`BomLine`/`OperationType`/`ProductOperation`)
como estrutura puramente aditiva, sem tocar Produção. A Fase 5 é o próximo passo natural: o mecanismo que
usa essa estrutura para reservar material real contra uma Ordem de Produção, introduzindo a distinção
entre saldo físico, reservado e disponível — pré-requisito indispensável para o MRP (fase futura), que
precisa saber o que já está comprometido antes de calcular o que falta comprar.

## Levantamento — o que existe hoje

**Consumo de matéria-prima na OP hoje é só no final, e é "ao vivo".**
`ProductionOrderRepository.completeAndConsumeStock()` lê `order.product.materials` (a relação viva de
`ProductMaterial`, não uma revisão) **só no momento da conclusão** da OP — decrementa `Material.stockQty`
diretamente e cria um `StockMovement` tipo `OUT`. Não existe nenhum passo de reserva hoje: entre a
criação da OP e sua conclusão, o sistema não sabe (nem registra) que aquele material "já tem dono".

**Nenhuma reserva existe — `stockQty` é a única verdade.** `Material.stockQty`/`Product.stockQty`
representam exclusivamente o saldo físico. Duas OPs abertas para o mesmo material podem, hoje, "pensar"
que o mesmo saldo está livre para as duas.

**O schema já antecipa esta fase.** `StockMovement.type` já tem no comentário: *"IN (entrada), OUT
(saida), ADJUST (ajuste de inventario), **RESERVE, RELEASE**"* — valores nunca usados no código. Alguém
já reservou esse espaço para exatamente este momento.

**`RequisitionService.suggestForProductionOrder()` já faz um cálculo bruto, mas sem reserva.**
`grossNeeded = pm.quantity × orderQty × (1 + scrapPct/100)`, `missingQty = max(0, grossNeeded −
stockQty)` — um nível só (não explode `BomLine`/subconjunto), e sem descontar o que outras OPs já
reservaram. Essa é a lacuna que confirma por que Reserva de Material precisa vir antes do MRP de verdade.

**`ProductionOrder` não referencia nenhuma revisão.** Confirmado ao final da Fase 4: o modelo já suporta
adicionar `bomRevisionId` sem refatoração, mas o campo ainda não existe — hoje não há como uma OP dizer
"eu fui planejada contra ESTA estrutura específica".

**A Máquina de Estados da OP (Fase 2) tem `cancelled` como terminal.** `ALLOWED_TRANSITIONS.cancelled =
[]` — não existe hoje nenhuma transição de volta a partir de `cancelled`. "Reabertura" de uma OP cancelada
não é um conceito que já existe no sistema.

## Modelagem proposta

### 1. Como uma OP deve consumir uma revisão da BOM

`ProductionOrder.bomRevisionId` (novo, opcional) — **confirmado com o usuário**: capturado no momento da
criação da OP (não numa transição posterior), disparando a explosão/reserva imediatamente. Dá
visibilidade de falta de material o mais cedo possível, inclusive para OPs geradas automaticamente na
aprovação do Orçamento (evento `orcamento.aprovado`, Fase 3). Regra: se o produto tem uma
`BomRevision` `released`, ela é referenciada; se não tem (produto sem engenharia formal ainda, ou
`productType` que não se aplica), a OP segue sem `bomRevisionId` e cai no comportamento herdado (receita
"ao vivo" via `ProductMaterial`, exatamente como hoje) — **nenhuma OP existente ou fluxo atual quebra**.
A partir do momento em que `bomRevisionId` está preenchido, toda necessidade de material daquela OP é
calculada a partir das `BomLine` daquela revisão específica — nunca a receita viva.

### 2. Como ocorre a explosão da estrutura

Uma função recursiva (proposta, não implementada) que, dado `bomRevisionId` + quantidade da OP, percorre
`BomLine`:
- **Linha `material`**: soma `quantity × (1 + scrapPct/100) × quantidadeAcumulada` na necessidade bruta
  daquele `Material` — mesma fórmula já usada em `completeAndConsumeStock` hoje, só que antecipada pra
  antes da conclusão.
- **Linha `component`**: busca a `BomRevision` `released` do `componentProductId`. Se existir, recorre —
  multiplicando a quantidade da linha pela quantidade acumulada do nível pai — e agrega as necessidades de
  material da subárvore inteira. Se não existir (produto sem revisão liberada — ex: item comprado
  pronto, `productType` diferente de `subassembly`/`finished`), trata a necessidade como direta daquele
  Product (não explode mais fundo — vira uma necessidade de "produto", não de "material").
- **Proteção contra ciclo indireto** (A→B→A através de vários níveis) passa a ser necessária de verdade
  aqui — a Fase 4 só bloqueou auto-referência direta na hora de montar a estrutura; a explosão recursiva
  é o primeiro lugar onde um ciclo indireto realmente quebraria algo (recursão infinita).
- Resultado: um mapa agregado `{ materialId → quantidadeBruta }`.

### 3. Saldo disponível × reservado × físico

Adoto os 4 campos já previstos no roadmap V4 aprovado (Fase 5, antes desta rodada de detalhamento):

```
Material / Product (campos novos, em ambos):
  stockQty          Float  // físico — já existe, sem mudança de significado
  reservedQty       Float  @default(0)  // comprometido com OPs abertas, ainda não consumido
  onOrderQty        Float  @default(0)  // a caminho via Pedido de Compra confirmado — CONFIRMADO: só
                                         // campo de schema nesta fase, sem nenhum gatilho automático no
                                         // PurchaseOrderService. Conectar o incremento/decremento fica
                                         // pra quando o MRP for de fato construído.
  inProductionQty   Float  @default(0)  // sendo produzido como saída de outra OP (produto acabado/
                                         // subconjunto no meio da produção)
```

`availableQty` **nunca é armazenado** — é sempre `stockQty − reservedQty`, calculado sob demanda. Guardar
os dois lados (disponível e reservado) como colunas separadas e deixar "disponível" implícito evita duas
fontes de verdade que podem divergir.

### 4. Regras para reserva parcial

Nova entidade `MaterialReservation` (uma linha por OP × Material):

```
MaterialReservation
  id
  productionOrderId    → ProductionOrder
  materialId           → Material
  quantityNeeded        Float   // calculado pela explosão, no momento da reserva
  quantityReserved       Float   // efetivamente reservado (pode ser < needed)
  quantityShortfall      Float   // needed - reserved, nunca negativo — o que falta
  status                 String  // "reserved" (needed = reserved), "partial" (reserved < needed), "released"
  createdAt / updatedAt
```

Reservar tenta cobrir `quantityNeeded` a partir do `availableQty` atual do Material: se houver saldo
suficiente, reserva tudo (`status: "reserved"`); se não houver, reserva o que der e registra
`quantityShortfall` (`status: "partial"`) — **sem bloquear a criação nem o planejamento da OP**. A
tentativa de reserva pode ser refeita mais tarde (ex: depois que uma compra chegou) sem duplicar — teria
que reconciliar contra o que já está reservado, não somar de novo.

### 5. Comportamento quando faltar material — **confirmado**

A OP continua existindo e pode estar `planned` mesmo com `MaterialReservation.status = "partial"` em
algum item — isso não é um novo status na Máquina de Estados da OP, é um dado derivado (consultável via
`MaterialReservation`, não um campo novo em `ProductionOrder`). **Não** gera Requisição automaticamente
— isso é MRP, explicitamente fora do escopo desta fase. **Validado com o usuário**: a falta de material
**não bloqueia** `planned → in_progress` — só sinaliza (o chão de fábrica decide na prática; o sistema só
informa). A Máquina de Estados da OP (Fase 2) permanece exatamente como está.

### 6. Impacto sobre Estoque

`StockMovement.type` finalmente usa os valores `RESERVE`/`RELEASE` já previstos no comentário do schema
desde antes desta fase:
- Reservar cria um `StockMovement` tipo `RESERVE` — **não** afeta `stockQty`, só `reservedQty`.
- Liberar (cancelamento, ou ajuste de reserva) cria um `RELEASE` — o inverso.
- O consumo físico continua acontecendo **só na conclusão da OP**, exatamente como hoje (herdado da Fase
  1, não alterado nesta fase) — mas a baixa deveria, no futuro, debitar o que estava **reservado**
  (reduzindo `reservedQty` e `stockQty` juntos), não o saldo livre — evita que a conclusão "roube" saldo
  que outra OP também reservou.

### 7. Integração futura com MRP

O MRP (fase futura) usa `availableQty`/`reservedQty`/`onOrderQty` como entrada do cálculo líquido — sem
essa distinção, o MRP contaria em dobro material que já está reservado por outra OP aberta. A explosão de
estrutura desta fase (ponto 2) é exatamente o motor que o MRP reaproveita depois, só que rodando pra
**todas** as OPs abertas de uma vez, não uma por uma sob demanda.

### 8. Impacto sobre cancelamento e reabertura da OP

**Cancelamento**: cancelar uma OP (transição já existente, `* → cancelled`) deve liberar
(`MaterialReservation.status → "released"` + `StockMovement` tipo `RELEASE`) toda reserva pendente
daquela OP que ainda não foi consumida. Isso é aditivo à transição existente, não muda o mapa de
transições da Fase 2.

**Reabertura — confirmado**: `cancelled` continua terminal, a Máquina de Estados da OP (Fase 2) não é
alterada. "Reabertura" = só a re-tentativa de reserva quando uma OP `planned`/`in_progress` com
`shortfall > 0` recebe saldo novo depois (ex: chegou uma compra) — um recálculo de `MaterialReservation`,
nenhuma mudança de status envolvida. Menor risco, não reabre uma máquina de estados já validada e em
produção.

## Entidades novas (resumo)

```
Material / Product  + reservedQty, onOrderQty, inProductionQty (availableQty sempre calculado)
ProductionOrder      + bomRevisionId (opcional)
MaterialReservation  (nova) — por OP × Material: needed/reserved/shortfall/status
StockMovement        — passa a usar de fato os tipos RESERVE/RELEASE já previstos no comentário
```

## Fluxo de negócio (visão consolidada)

```
OP criada/planejada
  → captura bomRevisionId (se o produto tiver revisão liberada)
  → explode BomLine recursivamente → { materialId: quantidadeBruta }
  → pra cada material: tenta reservar contra availableQty
       → cobre tudo → MaterialReservation "reserved"
       → cobre parte → MaterialReservation "partial" (+ StockMovement RESERVE pela parte coberta)
       → sem cobertura → MaterialReservation "partial" (reserved=0, shortfall=needed)
  → OP segue planejada, com ou sem falta sinalizada

OP cancelada
  → toda MaterialReservation ainda não consumida → "released" + StockMovement RELEASE

OP concluída (comportamento já existente, Fase 1 — não mexido nesta fase)
  → baixa física de estoque (OUT) + entrada de produto acabado (IN)
  → [futuro, não desta fase] baixar a partir do reservado, não do saldo livre
```

## Decisões validadas com o usuário (2026-07-09)

1. **Falta de material não bloqueia** `planned → in_progress` — só sinaliza. Máquina de Estados da OP
   (Fase 2) intocada.
2. **"Reabertura" não é uma transição nova** — `cancelled` continua terminal; reabertura é só recálculo
   de `MaterialReservation` quando chega saldo novo para uma OP com `shortfall`.
3. **Reserva acontece na criação da OP**, não numa transição posterior.
4. **`onOrderQty` é só campo de schema nesta fase** — sem gatilho no `PurchaseOrderService`.

## Subetapa 1 — Schema (implementada e verificada, 2026-07-09)

**Alterações** (todas aditivas, push em dev e teste):
- `Material`/`Product`: `reservedQty`/`onOrderQty`/`inProductionQty` (`@default(0)`) — `availableQty`
  continua **não armazenado**, calculado sob demanda como `stockQty - reservedQty` sempre que precisar.
- `ProductionOrder.bomRevisionId` (opcional, FK para `BomRevision`) — OPs existentes e novas sem
  engenharia formal continuam funcionando exatamente como antes (`null`).
- `MaterialReservation` (nova): `itemType` (`"material"`/`"product"`) com `materialId`/`productId`
  nulináveis (mesmo padrão de discriminador já usado em `BomLine`) — cobre tanto necessidade de matéria-
  prima quanto de um produto-componente sem revisão própria (ver ponto 2 da modelagem, "explosão da
  estrutura"). `quantityNeeded`/`quantityReserved`/`quantityShortfall` guardados separadamente, como
  pedido — nenhum é derivado do outro no schema, o cálculo fica no Service (Subetapa 3).

**Por que não uma constraint de unicidade no banco**: uma tentativa de `@@unique([productionOrderId,
itemType, materialId, productId])` não garantiria idempotência de verdade — em SQL, colunas `NULL` nunca
são consideradas iguais entre si por uma constraint `UNIQUE`, então duas linhas com `productId: null`
passariam pela constraint sem conflito. A idempotência do algoritmo de reserva (pedida explicitamente)
será garantida no Service (Subetapa 3) via busca-antes-de-criar, não no schema.

**Decisão explicitamente temporária, validada com o usuário**: nesta fase, o **Service é a única fonte de
verdade para a idempotência** de `MaterialReservation` — não há nenhuma garantia estrutural no banco.
Isso é aceito conscientemente pelas limitações atuais da modelagem (chave composta com colunas opcionais,
onde `NULL` não colide em `UNIQUE`), não por preferência definitiva. **Registro para uma evolução
futura**: quando a modelagem permitir uma chave natural adequada para a reserva (por exemplo, se
`itemType` virar dois relacionamentos obrigatórios separados via uma tabela intermediária, ou se o SQLite/
Prisma ganhar suporte a índice único parcial condicional), a proteção deve passar a ser **Service + banco
trabalhando em conjunto** — o Service continua validando a regra de negócio, mas o banco passa a
recusar duplicatas mesmo em caso de falha do Service (ex: condição de corrida, bug futuro). Não é uma
ação pendente com prazo — é um lembrete arquitetural para quando a modelagem evoluir.

**Testes** (`tests/material-reservation-schema.test.ts`, 3 casos): defaults zerados em Material/Product;
`ProductionOrder.bomRevisionId` opcional, aceitando tanto uma revisão liberada quanto `null`;
`MaterialReservation` gravando `needed`/`reserved`/`shortfall` separadamente para os dois `itemType`.
**29/29 testes passando** no total (3 novos + 26 da Fase 4). `tsc --noEmit` limpo.

## Subetapa 2 — Explosão de BOM (implementada e verificada, 2026-07-09)

**`src/app/services/bom-explosion.service.ts`** — função pura de leitura (não persiste nada), reutilizável
pela reserva (Subetapa 3) e futuramente pelo MRP. `explode(productId, quantity)` percorre `BomLine` da
revisão `released` do produto, agregando em dois mapas: `materialNeeds` (materialId → quantidade bruta,
já aplicando `quantity × (1 + scrapPct/100) × quantidadeAcumulada`) e `productNeeds` (productId →
quantidade, para componentes sem revisão liberada própria — tratados como necessidade direta de produto,
não explodidos mais fundo).

**Detecção de ciclo (direto e indireto), dando atenção especial pedida pelo usuário**: implementada via
`path: Set<string>` — o conjunto de produtos já visitados **neste ramo específico** da recursão (não
globalmente). Cada chamada recursiva recebe uma cópia do `path` do seu chamador direto, nunca compartilhada
entre ramos irmãos — isso é o que permite uma estrutura em losango (o mesmo componente usado em dois
ramos diferentes do mesmo produto) funcionar normalmente, e ao mesmo tempo detectar um ciclo de verdade
(o mesmo produto reaparecendo como ancestral **do próprio ramo**, direto ou através de qualquer
profundidade de níveis indiretos) lançando `BadRequestException` antes de estourar a pilha de chamadas.

**Testes** (`tests/bom-explosion.test.ts`, 7 casos):
- Explosão de um nível (só material), com scrap aplicado corretamente.
- Explosão de múltiplos níveis (subconjunto com revisão própria), multiplicação em cascata correta.
- Componente sem revisão liberada tratado como necessidade direta de produto.
- **Ciclo direto** detectado — dado inserido diretamente via Prisma (bypassando a checagem de
  auto-referência do `BomService`, Fase 4) para provar que a própria explosão se defende
  independentemente, não só confiando na checagem de criação.
- **Ciclo indireto** (A→B→A) detectado — construído pelo fluxo normal do `BomService` (a Fase 4 só
  bloqueava auto-referência direta; um ciclo indireto de 2 produtos é perfeitamente criável hoje sem essa
  proteção nova).
- **Estrutura profunda** (4 níveis encadeados: produto→subconjunto→subconjunto→subconjunto→material) —
  multiplicação em cascata verificada (`2 × 3 × 2 × 5 = 60`).
- **Estrutura em losango** (mesmo componente usado em 2 ramos de um mesmo produto) — agregação correta
  (`10 + 15 = 25`) **sem** disparar falso positivo de ciclo, confirmando que `path` por ramo (não global)
  é a escolha certa.

**36/36 testes passando** no total (7 novos + 29 anteriores). `tsc --noEmit` limpo.

## Subetapa 3 — Serviço de Reserva (implementada e verificada, 2026-07-09)

**`bom-explosion.service.ts` ganhou `explodeRevision(bomRevisionId, quantity, rootProductId)`** —
diferente do `explode(productId, quantity)` da Subetapa 2 (que busca a revisão *ativa agora*), esta
recebe a revisão já conhecida e explode a partir dela diretamente. É o que garante o ponto mais
importante pedido pelo usuário: **a reserva sempre honra a `BomRevision` congelada em
`ProductionOrder.bomRevisionId`, nunca a que porventura esteja liberada agora para o produto** — os
níveis abaixo do topo (subconjuntos) continuam resolvendo pela revisão ativa deles mesmos, já que só
`ProductionOrder` tem esse campo de congelamento; não existe (nem foi pedido) um conceito de "congelado"
em cada nível da árvore.

**`material-reservation.repository.ts`** — toda a transação vive aqui (mesmo padrão de
`ProductionOrderRepository.completeAndConsumeStock`/`PurchaseOrderRepository.receiveItems`):
- `reserveMany()` abre **uma única transação** cobrindo todos os itens necessários de uma OP (ADR-001
  princípio 3; pedido explícito do usuário) — ou o conjunto inteiro é processado, ou nada é gravado.
- `reserveItemWithTx()` (privado, roda dentro da transação já aberta) calcula o **delta** entre o que já
  está reservado e o que ainda falta, reserva só esse delta do saldo disponível, e decide idempotência:
  se nada mudou desde a última tentativa (mesma necessidade, saldo zero pra reservar), retorna sem
  escrever nada — nem `StockMovement`, nem `reservedQty`, nem a própria linha de `MaterialReservation`.
  Isso é o que garante "totalmente idempotente" como pedido: chamar de novo sem mudança nenhuma é um
  no-op completo, não só "não duplica".
- `releaseMany()`/`releaseItemWithTx()` — mesmo padrão para o cancelamento: uma única transação,
  idempotente (nada ativo → nada a liberar), e **nunca apaga a linha de `MaterialReservation`** — só
  zera `quantityReserved`, marca `quantityShortfall = quantityNeeded` e `status: "released"`. Histórico
  preservado, como pedido.

**`material-reservation.service.ts`** — orquestra: busca a OP, confere que tem `productId` e
`bomRevisionId` (senão, `[]` — OP sem engenharia formal, compatibilidade preservada), chama a explosão
pinada, monta a lista de necessidades (material + produto-componente sem revisão própria) e delega ao
Repository.

**Integração com `ProductionOrderService`** (única mudança em código de Produção nesta fase, esperada e
aprovada pelo ADR-006 — diferente da Fase 4, que não tocava Produção):
- `create()` e `createFromApprovedQuote()`: capturam `bomRevisionId` (revisão liberada do produto, se
  houver) e chamam `reserveForProductionOrder()` logo depois de criar a OP — confirmado desde a
  Subetapa 1: reserva acontece na criação, não numa transição posterior.
- `update()`: nova variável `isCancellingNow` (mesmo padrão de `isCompletingNow` já existente) — na
  transição para `cancelled`, chama `releaseForProductionOrder()` depois que o campo de status já foi
  persistido. Mapa de transições da Fase 2 **não foi alterado**.

**Compatibilidade com MRP/Compras futuros**: nada de `PurchaseOrderService` foi tocado — `onOrderQty`
continua só no schema. A explosão (`bomExplosionService`) e a reserva (`materialReservationService`) são
os dois blocos que o MRP vai reaproveitar diretamente quando for construído — nenhum redesenho previsto.

**Testes** (`tests/material-reservation.test.ts`, 7 casos, via `productionOrderService.create()`/
`.update()` — integração real, não chamando o Service de reserva diretamente, exceto onde o próprio
teste pede retentativa/idempotência explícita):
- **Reserva completa** (saldo 100, necessidade 20) → `reserved`, `reservedQty` += 20, 1 `StockMovement
  RESERVE` de 20.
- **Reserva parcial** (saldo 12, necessidade 20) → `partial`, reservado 12, falta 8, **OP criada
  normalmente** (nenhum bloqueio).
- **Ausência total** (saldo 0) → reservado 0, falta 20 inteira, **nenhum** `StockMovement RESERVE`
  criado (delta zero).
- **Recálculo** (saldo sobe de 12 pra 30 depois da 1ª tentativa) → só o delta (8) vira `StockMovement`
  novo; total reservado sai 20 (12+8), nunca duplicado nem somado errado.
- **Cancelamento** → `MaterialReservation` vira `released` (linha preservada, não apagada),
  `reservedQty` devolvido a zero, 1 `StockMovement RELEASE` de 20.
- **Reexecução idêntica da reserva** (3 chamadas seguidas, nada muda) → nenhum `StockMovement` novo,
  nenhuma linha duplicada, mesmo `quantityReserved`.
- **Reexecução do release** (chamar liberar 2x numa OP já liberada) → nenhum `StockMovement RELEASE`
  duplicado.

**43/43 testes passando** no total (7 novos + 36 anteriores). `tsc --noEmit` limpo.

## Fase 5 — Conclusão

As 3 subetapas (Schema, Explosão de BOM, Serviço de Reserva) estão implementadas, testadas e
documentadas. `MaterialReservation` sempre honra a revisão congelada na OP; toda operação de reserva/
liberação roda dentro de uma única transação; nenhuma reserva bloqueou a criação de OP nenhuma; toda
alteração de reserva gerou o `StockMovement` `RESERVE`/`RELEASE` correspondente; idempotência verificada
tanto para reserva quanto para liberação. MRP, compras automáticas, planejamento, capacidade finita e
custo industrial permanecem inteiramente fora do escopo, como combinado.

## Log de Decisões

| Data | Decisão |
|---|---|
| 2026-07-09 | Levantamento completo do domínio de Reserva de Material: nenhuma reserva existe hoje, consumo só acontece na conclusão da OP lendo a receita "ao vivo"; `StockMovement.type` já antecipa `RESERVE`/`RELEASE` desde antes desta fase; `ProductionOrder` ainda não referencia nenhuma `BomRevision`; Máquina de Estados da OP tem `cancelled` como terminal |
| 2026-07-09 | Modelagem proposta e validada: `ProductionOrder.bomRevisionId` (capturado na criação); explosão recursiva de `BomLine` com proteção contra ciclo indireto (necessária pela primeira vez nesta fase); 4 campos de saldo (`stockQty`/`reservedQty`/`onOrderQty`/`inProductionQty`, `availableQty` sempre calculado); nova entidade `MaterialReservation` (needed/reserved/shortfall, suporta reserva parcial sem bloquear a OP); `StockMovement` passa a usar `RESERVE`/`RELEASE` de fato |
| 2026-07-09 | 4 pontos em aberto validados via `AskUserQuestion`: falta de material só sinaliza (não bloqueia); reabertura não mexe na máquina de estados (só recálculo de reserva); reserva acontece na criação da OP; `onOrderQty` fica só no schema nesta fase, sem gatilho no `PurchaseOrderService` |
| 2026-07-09 | Confirmado explicitamente: nenhuma implementação nesta rodada — MRP, compras automáticas, planejamento, capacidade finita e custo industrial permanecem fora do escopo. Implementação da Fase 5 começa apenas quando o usuário der o próximo sinal |
| 2026-07-09 | **Subetapa 1 concluída**: campos de saldo (`reservedQty`/`onOrderQty`/`inProductionQty`) adicionados a `Material`/`Product`; `ProductionOrder.bomRevisionId` opcional; `MaterialReservation` criada com discriminador `itemType` (mesmo padrão de `BomLine`), guardando `quantityNeeded`/`quantityReserved`/`quantityShortfall` separadamente. Decisão de não usar constraint de unicidade no banco para idempotência (NULLs não colidem em `UNIQUE` no SQL) — idempotência fica a cargo do Service na Subetapa 3. 3 testes novos, 29/29 passando no total |
| 2026-07-09 | Registrado como **temporário**, validado com o usuário: nesta fase o Service é a única fonte de verdade para idempotência de `MaterialReservation`; quando a modelagem permitir uma chave natural adequada, a proteção deve evoluir para Service + banco em conjunto — não é uma tarefa pendente com prazo, é um lembrete arquitetural |
| 2026-07-09 | **Subetapa 2 concluída**: `bom-explosion.service.ts` implementado — explosão recursiva de `BomLine` com detecção de ciclo (direto e indireto) via `path` por ramo de recursão (não global), permitindo estruturas em losango sem falso positivo. Verificado com estrutura profunda (4 níveis, multiplicação em cascata) e ambos os tipos de ciclo. 7 testes novos, 36/36 passando no total |
| 2026-07-09 | **Subetapa 3 concluída**: `explodeRevision()` adicionado ao `bom-explosion.service.ts` (explode a partir de uma revisão conhecida, nunca "a ativa agora" — fecha o requisito de honrar `ProductionOrder.bomRevisionId`). `material-reservation.repository.ts` concentra a transação (uma única, cobrindo todos os itens de uma OP) e a lógica de delta/idempotência; `material-reservation.service.ts` orquestra. `ProductionOrderService.create()`/`.createFromApprovedQuote()` passam a capturar `bomRevisionId` e reservar; `.update()` libera na transição pra `cancelled` (`isCancellingNow`, mesmo padrão de `isCompletingNow`) — única mudança em Produção nesta fase, esperada e aprovada. 7 testes novos cobrindo reserva completa/parcial/ausência total/recálculo/cancelamento/reexecução (reserva e release), 43/43 passando no total |
| 2026-07-09 | **Fase 5 concluída.** As 3 subetapas implementadas, testadas e documentadas. Nenhuma reserva bloqueou criação de OP; toda operação rodou em transação única; toda alteração gerou RESERVE/RELEASE; idempotência verificada para reserva e liberação. MRP, compras automáticas, planejamento, capacidade finita e custo industrial permanecem fora do escopo |
