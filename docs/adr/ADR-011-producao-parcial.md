# ADR-011 — Produção Parcial (Fase 9)

- **Status**: **Subetapas 1 e 2 implementadas e verificadas — Fase 9 completa.** Um achado arquitetural
  importante (seção "Validação antes da Subetapa 2", ponto 5) permanece **registrado, não corrigido**:
  incompatibilidade entre o nível de explosão da Reserva (multinível) e do Consumo (um nível), ver detalhe
  abaixo — não bloqueia o MRP, mas precisa de uma decisão futura do usuário.
- **Data**: 2026-07-09
- **Depende de**: [ADR-002 — Máquina de Estados](./ADR-002-maquina-de-estados.md) (estados atuais da OP,
  mantidos sem adição); [ADR-005 — Engenharia do Produto](./ADR-005-engenharia-produto-bom.md)
  (`BomRevision`/`BomLine`, candidatos a substituir `ProductMaterial` no consumo); [ADR-006 — Reserva de
  Material](./ADR-006-reserva-de-material.md) (`reservedQty`, `MaterialReservation`, o que esta fase
  corrige); [ADR-007 — MRP](./ADR-007-mrp.md) (`inProduction` calculado a partir de OPs abertas — precisa
  ajuste); [ADR-010 — Aprovação de Compras](./ADR-010-aprovacao-compras.md) (`receive()` é o precedente
  direto que esta fase espelha)
- **Escopo explicitamente fora desta fase**: rastreabilidade por lote (Fase 10 do roadmap); consumo
  manual por material (decidido não usar, ver seção 3); nenhuma rota/tela nova.

## Contexto

Toda produção hoje é tudo-ou-nada: uma OP de 100 unidades só existe como "0% pronta" ou "100% pronta" —
não há como registrar que 30 unidades já saíram e o restante continua em andamento. A Fase 9 introduz
produção parcial seguindo o mesmo precedente que a Fase 8 já validou para Compras: `PurchaseOrder.
receive()` já resolve exatamente este problema (receber em várias rodadas, quantidade cumulativa por
item, status derivado automaticamente) — Produção Parcial é o mesmo padrão aplicado ao outro lado do
processo produtivo.

## 1. Estado atual da Ordem de Produção — levantamento

**Estados e transições** (`ProductionOrderService.ALLOWED_TRANSITIONS`, inalterado desde a Fase 2):
```
planned:     [in_progress, completed, cancelled]
in_progress: [paused, completed, cancelled]
paused:      [in_progress, cancelled]
completed:   []
cancelled:   []
```
`planned → completed` direto é permitido de propósito (preserva o fluxo atual — nada força passar por
`in_progress`).

**Criação** (`create()`/`createFromApprovedQuote()`): congela `bomRevisionId` (revisão `released` ativa
no momento, Fase 5), publica `ordem_producao.criada`, chama `materialReservationService.
reserveForProductionOrder()` — reserva o que der do saldo disponível, parcial ou zero sem bloquear a OP.

**Início** (`→ in_progress`) e **pausa** (`→ paused` / `paused → in_progress`): puramente administrativas
hoje — só mudam `status`, gravam `StatusHistory`, nenhum efeito colateral em estoque/reserva.

**Conclusão** (`→ completed`, via `ProductionOrderRepository.completeAndConsumeStock()`): tudo-ou-nada,
numa única transação — para cada linha de `order.product.materials` (**a "receita" VIVA,
`ProductMaterial` — ver achado crítico abaixo**), decrementa `Material.stockQty` na quantidade cheia
(`pm.quantity × order.quantity × (1+scrapPct/100)`) e grava `StockMovement` `OUT`; depois incrementa
`Product.stockQty` em `order.quantity` inteiro e grava `StockMovement` `IN`. Sempre a quantidade **total**
da OP, de uma vez.

**Cancelamento** (`→ cancelled`): único ponto que chama `materialReservationService.
releaseForProductionOrder()` — libera toda `MaterialReservation` ativa daquela OP (`reservedQty` volta,
`StockMovement` `RELEASE`).

### Achado crítico nº 1 — `reservedQty` nunca é liberado na conclusão

Varredura completa de `completeAndConsumeStock()`: ele decrementa `Material.stockQty` diretamente, mas
**nunca toca `Material.reservedQty`**. Isso é um bug pré-existente, não introduzido por esta fase: hoje,
concluir uma OP normalmente deixa `reservedQty` "preso" para sempre — só `releaseForProductionOrder()`
(chamado exclusivamente no cancelamento) zera isso. Como a Fase 9 precisa mexer exatamente neste código
(consumo, agora parcial), **esta é a oportunidade natural de corrigir o bug junto** — confirmado com o
usuário, ver seção 4.

### Achado crítico nº 2 — consumo usa `ProductMaterial` (receita viva), não `BomLine` (revisão congelada)

`completeAndConsumeStock()` lê `order.product.materials` — a relação **viva** `ProductMaterial` —
**nunca** a `BomRevision`/`BomLine` que `order.bomRevisionId` já congela desde a Fase 5. A Reserva de
Material (ADR-006) já usa a revisão congelada (`bomExplosionService.explodeRevision()`); o consumo real
na conclusão, não. Isso significa que, se a receita mudar entre a criação e a conclusão de uma OP, o que
foi reservado pode divergir do que é efetivamente consumido — um risco que cresce exatamente com a
produção parcial (janela de tempo maior entre criação e fechamento total). **Confirmado com o usuário**:
corrigir agora, migrando o consumo para `BomLine`/`bomRevisionId` (ver seção 3).

## 2. Produção parcial — abordagem

**Mesmo padrão já validado em Compras** (`PurchaseOrder.receive()`, ADR-010): uma ação dedicada
(`ProductionOrderService.produce()`, nova — não uma transição de status genérica) recebe "quanto foi
produzido nesta rodada", incrementa um campo cumulativo (`ProductionOrder.quantityCompleted`, seção 8) e
deriva o `status` automaticamente — a OP só vira `completed` quando `quantityCompleted` atinge `quantity`.
Isso responde diretamente à seção 7 (nenhum estado novo — um campo quantitativo resolve, exatamente como
`PurchaseOrderItem.quantityReceived` já resolve para recebimento parcial).

```
OP = 100 unidades (quantity: 100, quantityCompleted: 0)
produce(30) → quantityCompleted: 30, status permanece "in_progress" (ou o que já estava)
produce(20) → quantityCompleted: 50
produce(50) → quantityCompleted: 100 → status muda para "completed" automaticamente
```

**Nunca duplicar**: cada chamada de `produce()` só processa o **delta** informado (a quantidade desta
rodada), nunca recalcula com base no acumulado — mesma disciplina de idempotência já usada em `receive()`
e na Reserva (ADR-006). Uma validação de guarda (mirror de `receive()`): a soma de todas as rodadas nunca
pode exceder `quantity` (`outstanding = quantity − quantityCompleted`, rejeita se
`quantidade da rodada > outstanding`).

## 3. Consumo de materiais

**Confirmado com o usuário**: consumo proporcional automático, não informado manualmente.

```
consumedQty(material) = (quantidadeDestaRodada / quantity) × line.quantity × (1 + line.scrapPct/100)
```

**Vantagens do proporcional automático** (por que foi escolhido): mesma fórmula já usada hoje na
conclusão total, só escalada pela fração produzida — automático, sem risco de esquecer um material da
receita, determinístico e fácil de testar.

**Desvantagens, registradas para consciência futura**: não reflete variação real de refugo por rodada
(sempre assume que toda produção parcial segue a mesma proporção da receita) — se isso precisar mudar no
futuro, é candidato natural à Fase 10 (rastreabilidade por lote), que já vai precisar de consumo granular
por lote de qualquer forma.

**Consumo manual, não escolhido** (registrado só para referência): exigiria uma tela por rodada com um
campo por material da receita, mais preciso para refugo real, mas mais lento operacionalmente e com mais
risco de erro humano — decisão explícita do usuário de não seguir por este caminho nesta fase.

**Confirmado com o usuário (achado crítico nº 2)**: o consumo passa a usar `BomLine` da revisão
**congelada** (`order.bomRevisionId`), não mais `ProductMaterial`. Isso alinha consumo e reserva na mesma
fonte de verdade — ambos passam a usar exatamente a mesma revisão, a mesma que `bomExplosionService.
explodeRevision()` já usa para reservar. OPs sem `bomRevisionId` (produto sem engenharia formal) mantêm o
comportamento herdado via `ProductMaterial`, exatamente como o resto do sistema já trata esse caso hoje
(ADR-006, "OP sem engenharia formal, comportamento herdado preservado").

## 4. Reserva de material — impacto e correção

**Confirmado com o usuário**: `reservedQty` é liberado **proporcionalmente a cada rodada** de produção
parcial — o que foi fisicamente consumido nesta rodada deixa de estar "reservado" (`MaterialReservation.
quantityReserved` e `Material.reservedQty` decrementam na mesma quantidade que acabou de ser consumida),
gerando `StockMovement` `RELEASE` correspondente. Isso corrige o achado crítico nº 1 de quebra: ao
terminar a última rodada (`quantityCompleted === quantity`), `reservedQty` daquela OP já terá sido
zerado por completo, incrementalmente — nunca mais "preso" após a conclusão.

**Alternativa não escolhida** (registrada para referência): manter a reserva presa até a conclusão total
— mudaria menos código agora, mas perpetuaria o bug até o fechamento 100%, só "adiando" a correção sem
resolvê-la de fato.

## 5. MRP — impacto

**Achado, decorrente diretamente da seção 2**: `mrp-calculation.service.ts` hoje soma `op.quantity`
(o total, não o restante) para calcular tanto a demanda de nível 0 quanto `inProduction` (ver ADR-007,
seção 4). Com produção parcial, uma OP em andamento (`quantityCompleted > 0`, ainda não `completed`)
continua "aberta" — sem ajuste, ela superestimaria tanto a demanda quanto o supply em `inProduction`,
contando o que já foi produzido como se ainda estivesse por produzir.

**Correção necessária** (proposta, a confirmar formalmente na implementação desta fase ou logo em
seguida): `ProductionOrderRepository.findManyOpenForMrp()` passa a expor `quantity − quantityCompleted`
(o restante) em vez de `quantity` — tanto no bootstrap (Fase A) quanto em `openQuantityByProduct`
(cálculo de `inProduction`). Nenhuma mudança na arquitetura do motor (ADR-007) — só a origem do número
que ele já usa.

Como a seção 4 já corrige `reservedQty` para refletir só o que falta consumir, e o MRP já lê `reservedQty`
diretamente (não `MaterialReservation`, correção da Subetapa 2 do ADR-007), esse lado do cálculo já fica
automaticamente correto assim que a seção 4 for implementada — só o ajuste de `quantity → restante`
(acima) precisa de mudança de código explícita no motor.

## 6. Estoque

**Confirmado com o usuário**: cada produção parcial gera seu próprio `StockMovement` `IN` do produto
acabado, no momento da própria rodada (`produce()`) — não só na conclusão final. Mesma lógica já usada
para o consumo de material (`OUT` proporcional, seção 3), mesmo padrão que `receive()` já usa em Compras
desde a Fase 8/antes. Reflete a realidade física (produto pronto já é utilizável/vendável assim que sai
daquela rodada, sem esperar o restante da OP terminar) e mantém o histórico completo reconstruível via
`StockMovement` (sem precisar de nenhuma tabela nova de histórico — mesma decisão de design já usada em
Compras).

## 7. Máquina de estados

**Confirmado**: os 5 estados atuais (`planned`/`in_progress`/`paused`/`completed`/`cancelled`) continuam
suficientes — nenhum estado novo. `completed` passa a ser alcançado de duas formas, ambas válidas:
- **Direto** (`planned`/`in_progress` → `completed` via `changeStatus`/`update`, como hoje): continua
  funcionando exatamente como está, para quem não usa produção parcial — consome/produz 100% de uma vez,
  `quantityCompleted` vai direto para `quantity`. **Zero mudança de comportamento para este caminho.**
- **Incremental** (via `produce()`, nova): status muda para `completed` automaticamente só quando a
  última rodada fecha `quantityCompleted === quantity` — o usuário nunca precisa chamar `changeStatus`
  separadamente para fechar a OP nesse caminho.

`ALLOWED_TRANSITIONS` não muda. `checkTransition()`/`StatusHistory` reaproveitados sem alteração.

## 8. Schema

### `ProductionOrder`
- `quantityCompleted Float @default(0)` — novo, cumulativo, mirror exato de `PurchaseOrderItem.
  quantityReceived`.

### `ProductionOrderExecution` — nova, adicionada na validação final (ver seção dedicada abaixo)

Revisão em relação ao rascunho original deste ADR (que dizia "nenhuma tabela nova, mirror de Compras"):
a exigência de idempotência (ponto 4 da validação final) motivou a criação de uma tabela pequena,
append-only, para registrar cada rodada de produção com uma chave opcional de idempotência.

### Migração dos registros existentes

**Diferente das fases anteriores**: aqui é necessário um backfill de dados, não só o default de schema.
Toda OP já `completed` hoje representa, por definição do comportamento antigo (tudo-ou-nada), 100% do
`quantity` produzido — mas o default `quantityCompleted: 0` deixaria essas OPs com uma leitura enganosa
("0% produzida" numa OP que na verdade já terminou). Proposta:
```sql
UPDATE ProductionOrder SET quantityCompleted = quantity WHERE status = 'completed'
```
OPs em `planned`/`in_progress`/`paused`/`cancelled` ficam corretamente em `quantityCompleted: 0` (nenhuma
delas tem produção parcial registrada sob o comportamento antigo — o próprio motivo desta fase existir).

### Impacto em `mrp-calculation.service.ts`

`findManyOpenForMrp()` ganha `quantityCompleted` no `select`; o cálculo de demanda/`inProduction` passa a
usar `quantity - quantityCompleted` em vez de `quantity` (seção 5).

## 9. Testes planejados

1. **Várias produções parciais somando o total** (30+20+50=100): cada rodada consome proporcionalmente
   (verificado por material), `quantityCompleted` acumula corretamente, a última rodada muda o `status`
   para `completed` automaticamente, sem chamada explícita a `changeStatus`.
2. **Consumo parcial correto por material**: `StockMovement` `OUT` gerado em cada rodada com a
   quantidade proporcional exata (via `BomLine` da revisão congelada), nunca a quantidade cheia.
3. **Conclusão final bate exatamente com a quantidade original**: soma de todas as rodadas =
   `quantity`, sem sobra nem falta por arredondamento.
4. **Cancelamento após produção parcial**: produto já produzido/consumido **não é revertido** (é
   realidade física já ocorrida); só a reserva do que **ainda não foi produzido** é liberada
   (`quantity - quantityCompleted` no momento do cancelamento).
5. **Compatibilidade com Reserva**: `reservedQty` decrementa incrementalmente a cada rodada (seção 4),
   chegando a exatamente `0` (para aquela OP) quando a última rodada fecha — nunca "preso".
6. **Compatibilidade com MRP**: uma OP parcialmente produzida contribui só com `quantity -
   quantityCompleted` (o restante) para a demanda e para `inProduction` do MRP — nunca o total original.
7. **Guarda contra excesso**: tentar produzir mais do que o restante (`quantity - quantityCompleted`) é
   rejeitado, mirror exato da guarda já existente em `receive()`.
8. **Retrocompatibilidade total**: uma OP concluída de uma vez só (`planned`/`in_progress` → `completed`
   direto, sem nenhuma chamada a `produce()`) continua funcionando exatamente como hoje — comportamento
   idêntico, `quantityCompleted` vai direto a `quantity`.
9. **OP sem `bomRevisionId`** (produto sem engenharia formal): consumo continua via `ProductMaterial`
   (comportamento herdado), tanto no caminho direto quanto no incremental.

## Validação Arquitetural Final (2026-07-09)

Direção geral aprovada antes desta rodada, incluindo as duas correções (liberação progressiva de
`reservedQty`; consumo sempre pela `BomRevision` congelada). Validação ponto a ponto antes de codar:

### 1. Retrocompatibilidade

Confirmado: `update(id, { status: 'completed' }, userId)` — a chamada exata que já existe hoje, sem
nenhum parâmetro novo — continua funcionando de fora para dentro exatamente como está. Por dentro
(seção 2), ela passa a delegar para `produce()` com a quantidade restante inteira, mas o resultado
observável (consumo total, entrada total do produto, `status: "completed"`) é idêntico ao de hoje.
`planned → completed` direto continua permitido, sem forçar passagem por `in_progress`.

### 2. `produce()` como único ponto de entrada

Confirmado — e é uma correção sobre o rascunho original deste ADR, que ainda descrevia dois caminhos
("direto" e "incremental") como se fossem duas implementações. **Não são.** Existe só uma implementação
de consumo/entrada/liberação de reserva, em `ProductionOrderRepository.produceWithTx()`. Os dois
"caminhos" de entrada (`update()` com `status: completed`, e a nova chamada explícita a `produce()`) são
só duas formas de **chegar** na mesma lógica:
- `update(id, { status: 'completed' })` → calcula `remaining = quantity - quantityCompleted` →
  `produce(id, remaining, userId)`.
- `produce(id, quantidadeDestaRodada, userId)` → chamada direta, para produção parcial.

Quando `quantityCompleted` (após somar a rodada) atinge `quantity`, o próprio `produce()` marca
`status: "completed"` — nunca uma segunda chamada, nunca lógica duplicada.

### 3. Movimentações de estoque — só o delta da rodada

Confirmado: cada chamada de `produce()` opera **só** sobre `quantityThisRound` (a quantidade daquela
rodada específica) — nunca recalcula com base no acumulado. Consumo de material, liberação de reserva e
entrada do produto acabado são todos proporcionais só a essa rodada. Isso já era o desenho original deste
ADR; a validação confirma que não há nenhum caminho de código que recalcule "do zero" a cada chamada.

### 4. Idempotência — proposta nova: `ProductionOrderExecution`

**Achado da validação**: o precedente que este ADR cita (`PurchaseOrder.receive()`) **não tem** proteção
contra requisição duplicada — chamar `receive()` duas vezes com o mesmo payload duplicaria o recebimento.
Copiar esse precedente ao pé da letra não protegeria `produce()` do jeito que o usuário pediu.

**Proposta**: nova entidade `ProductionOrderExecution` (append-only, uma linha por rodada de produção):
```prisma
model ProductionOrderExecution {
  id                String          @id @default(cuid())
  productionOrderId String
  productionOrder   ProductionOrder @relation(fields: [productionOrderId], references: [id], onDelete: Cascade)
  quantity          Float  // quanto foi produzido NESTA rodada
  clientRequestId   String? // opaco, opcional — ver abaixo
  createdAt         DateTime @default(now())
  userId            String
  user              User @relation(fields: [userId], references: [id])

  @@unique([productionOrderId, clientRequestId])
  @@index([productionOrderId])
}
```
`clientRequestId` é **opcional**: quando o chamador (uma futura tela/rota) gerar um identificador único
por ação de usuário (ex.: um UUID criado uma vez ao clicar "registrar produção", reenviado sem mudar em
caso de nova tentativa/erro de rede), a constraint `@@unique([productionOrderId, clientRequestId])`
impede uma segunda gravação — `produce()` detecta a violação e devolve o resultado já registrado, sem
processar de novo (nem consumo, nem movimentação, nem liberação de reserva duplicados). Sem
`clientRequestId` (ex.: chamadas diretas de teste/Service), não há essa proteção específica — mas a
aritmética em si (seção 3) já é seguramente transacional e nunca duplica dentro de uma única chamada.

**Limite honesto desta proteção**: nesta fase não existe rota/tela (por instrução do próprio ADR), então
não há ainda quem gere um `clientRequestId` de verdade — o campo existe e a constraint já protege,
pronta para quando a interface for construída. Isso é consistente com o padrão já usado neste projeto de
preparar um campo antes do seu primeiro consumidor real (ex.: `bomRevisionId` na Fase 5).

**Efeito colateral bem-vindo**: como `ProductionOrderExecution` já registra "quanto, quando, por quem" a
cada rodada, o histórico de produção parcial fica mais explícito do que só reconstruir via
`StockMovement` — sem precisar de nenhuma consulta complexa (mesma disciplina já usada em `StatusHistory`
e `MrpRun`/`MrpSuggestion`).

### Achado adicional (decorrente do ponto 3): `MaterialReservation` ganha um status novo

Ao liberar `reservedQty` proporcionalmente (seção 4 do levantamento original), o que fazer com o
`status`/`quantityNeeded` de `MaterialReservation`? Hoje `status: "released"` significa especificamente
"cancelado, devolvido sem uso" (ADR-006) — usar o mesmo valor para "consumido de verdade na produção"
seria enganoso para quem ler o histórico depois (pareceria que o material nunca foi usado). **Proposta**:
`MaterialReservation.status` ganha um quarto valor, `"consumed"` — usado quando `quantityNeeded` chega a
zero por consumo de produção (nunca por cancelamento). `quantityNeeded` e `quantityReserved` diminuem
juntos, na mesma quantidade consumida por rodada (o que foi produzido não é mais "necessário" nem
"reservado" — foi gasto), preservando `quantityShortfall = max(0, quantityNeeded − quantityReserved)`
sempre consistente.

### 5. Eventos de domínio

**Confirmado, um evento novo**: `producao.parcial_realizada` (`OrdemProducaoParcialRealizadaPayload`),
emitido a cada `produce()` que **não** completa a OP. Quando a rodada **completa** a OP (direto ou pela
última parcial), o evento existente `ordem_producao.finalizada` continua sendo emitido, sem mudança —
preserva o único ponto de extensão que já existia. Nenhum consumidor registrado nesta fase (mesma
disciplina do ADR-003 — preparação para Fase 10/11, sem uso agora).

### 6. Impacto no MRP

Confirmado: `MrpSuggestion` já são fotografias históricas de uma execução (ADR-007) — nenhuma sugestão
existente é recalculada retroativamente quando uma OP muda; isso já é verdade hoje e continua sendo.
Uma nova execução (`mrpExecutionService.run()`) lê `ProductionOrder.quantity`/`quantityCompleted` ao vivo
no momento em que roda — assim que o ajuste do motor (`quantity → quantity - quantityCompleted`,
seção 5 do levantamento original) for aplicado, toda execução nova reflete automaticamente o saldo real
restante de qualquer OP parcialmente produzida. Esse ajuste fica para a **Subetapa 2** (abaixo) — não
faz parte da Subetapa 1.

### 7. Testes — lista final (Subetapa 1)

Consolidando os 9 cenários do levantamento original com os 7 adicionais pedidos nesta validação:

1. 10 produções de 10% chegando exatamente a 100% (`quantityCompleted` acumula sem erro de arredondamento).
2. Consumo proporcional correto por material, a cada rodada, nunca a quantidade cheia.
3. Conclusão final bate exatamente com a quantidade original.
4. Tentativa de produzir acima do saldo restante — rejeitada.
5. Produção após cancelamento — rejeitada (`produce()` só aceita OP em `planned`/`in_progress`/`paused`).
6. Produção após conclusão — rejeitada (mesma guarda).
7. Cancelamento após produção parcial — reserva do que falta é liberada, o que já foi produzido não é revertido.
8. Compatibilidade com Reserva: `reservedQty` chega a exatamente `0` quando a última rodada fecha.
9. Compatibilidade com MRP: OP parcial contribui só com o restante (verificado depois da Subetapa 2).
10. Consumo proporcional correto com BOM multinível — **esclarecimento de desenho**: consumo em
    `produce()` é **de um nível só** (as `BomLine` diretas da revisão congelada do produto da OP), nunca a
    explosão multinível que a Reserva usa. Um componente tipo `"component"` (subconjunto) é consumido como
    unidade pronta do próprio estoque do subconjunto (`Product.stockQty`), nunca explodindo nas matérias-
    primas dele — essas já foram consumidas quando a OP **daquele** subconjunto foi produzida
    separadamente. O teste monta uma estrutura Mesa→Estrutura→Tubo e confirma que produzir a Mesa consome
    só 1 Estrutura por unidade (nunca toca Tubo diretamente).
11. Retrocompatibilidade total: `update()` → `completed` direto, sem nenhuma chamada a `produce()`
    antes, continua idêntico ao comportamento de hoje.
12. OP sem `bomRevisionId`: consumo via `ProductMaterial` herdado, nos dois caminhos de entrada.
13. Idempotência: duas chamadas de `produce()` com o mesmo `clientRequestId` processam só uma vez —
    sem consumo, movimentação ou liberação de reserva duplicados.
14. Nenhuma quantidade negativa: `quantityCompleted`, `reservedQty` e `quantityShortfall` nunca ficam
    abaixo de zero, mesmo em sequências de chamadas no limite exato do saldo restante. **Esclarecimento**:
    isso é sobre a aritmética das novas quantidades (clamps defensivos, mesma disciplina já usada na
    Reserva) — não é uma nova regra bloqueando `Material.stockQty` negativo, que continua exatamente como
    hoje (sem nenhuma checagem, comportamento herdado, fora do escopo desta fase).

## Plano de subetapas

1. **Subetapa 1 — `produce()` único ponto de entrada** — **implementada e verificada.**
2. **Subetapa 2 — Ajuste do MRP** (a seguir, com sua validação antes de codar): `quantity -
   quantityCompleted` em `mrp-calculation.service.ts`; testes confirmando que uma OP parcialmente
   produzida contribui só com o restante para demanda e `inProduction`.

## Subetapa 1 — Implementação (2026-07-09)

**Concluída e verificada.**

- `prisma/schema.prisma`: `ProductionOrder.quantityCompleted` (novo); model `ProductionOrderExecution`
  (novo, com `@@unique([productionOrderId, clientRequestId])`); `MaterialReservation.status` ganha o
  valor `"consumed"` no comentário.
- **Backfill de dados**: `UPDATE ProductionOrder SET quantityCompleted = quantity WHERE status =
  'completed'` aplicado no banco de desenvolvimento (1 registro afetado).
- `src/lib/domain-events.ts`: novo evento `producao.parcial_realizada` +
  `ProducaoParcialRealizadaPayload`.
- `ProductionOrderRepository`: `completeAndConsumeStock()` **removido** — substituído por
  `produceWithTx()`, único método transacional que lida com consumo/entrada/liberação de reserva,
  parcial ou total.
- `ProductionOrderService`: novo `produce()` (único ponto de entrada de produção) + `resolveConsumptionLines()`
  (resolve `BomLine` da revisão congelada, com fallback para `ProductMaterial` herdado). `update()` foi
  refatorado — ao completar, delega para `produce()` com a quantidade restante inteira, em vez de ter sua
  própria lógica de consumo.

**Correção feita durante a implementação** (antes de rodar os testes): a fórmula de consumo proporcional
inicialmente escrita dividia por `order.quantity` — errado, porque `BomLine.quantity` já é "por 1 unidade
do produto pai" (não um total). Corrigida para `line.quantity × quantityThisRound × (1+scrapPct/100)`,
mesma fórmula que `completeAndConsumeStock` sempre usou, só trocando a quantidade total pela quantidade
da rodada. Também corrigido: a atualização de `MaterialReservation` (quantityNeeded/quantityShortfall/
status) agora acontece mesmo quando não há mais `reservedQty` para liberar (ex.: produção continuando
além do que já foi reservado) — só o `StockMovement` `RELEASE` e o decremento em `Material`/
`Product.reservedQty` ficam condicionados a haver algo real para liberar.

**Testes** (`tests/production-order-partial.test.ts`, 13 casos — os 14 planejados, com os itens 1+3
consolidados numa cobertura equivalente): 10 produções de 10% completando automaticamente; consumo
proporcional correto com 2 materiais de quantidades diferentes; conclusão com soma não-redonda
(33+33+34); rejeição ao exceder o saldo restante; rejeição após cancelamento; rejeição após conclusão;
cancelamento após parcial (produzido preservado, só o restante da reserva liberado); reserva chegando a
exatamente zero (`status: "consumed"`) na última rodada; BOM multinível (Mesa→Estrutura→Tubo, confirma
consumo de um nível só); retrocompatibilidade total (`update()→completed` direto, idêntico a antes);
OP sem `bomRevisionId` (herdado via `ProductMaterial`); idempotência via `clientRequestId` (chamada
duplicada não reprocessa); nenhuma quantidade negativa nos limites exatos da reserva. **100/100 testes
passando no total do projeto.** `tsc --noEmit` confirma o mesmo erro de ambiente pré-existente, não
relacionado a este trabalho.

## Validação antes da Subetapa 2 (2026-07-09)

### 1. Demanda restante

Confirmado e corrigido: `mrp-calculation.service.ts` usava `op.quantity` em 3 lugares (bootstrap com
`BomLine`, bootstrap com `ProductMaterial` herdado, `openQuantityByProduct`/`inProduction`) — os 3
passaram a usar `remaining = op.quantity - op.quantityCompleted`. Uma OP com `remaining <= 0` agora é
ignorada explicitamente no bootstrap (`continue`), garantindo que nunca contribui demanda, mesmo antes de
chegar à etapa de nivelamento.

**Achado adicional, fora de `mrp-calculation.service.ts`**: `RequisitionService.
suggestForProductionOrder()` (o helper de sugestão de uma OP por vez, anterior ao MRP, ADR-006) também
usava `productionOrder.quantity` diretamente — a mesma inconsistência, num lugar diferente. Corrigido da
mesma forma (`remainingQuantity = quantity - quantityCompleted`). Nenhum outro ponto do projeto usa
`ProductionOrder.quantity` para representar demanda (confirmado por varredura).

`bomExplosionService`/`materialReservationService.reserveForProductionOrder()` continuam usando
`order.quantity` (cheio) de propósito — Reserva acontece **uma vez**, no momento da criação da OP, quando
`quantityCompleted` é sempre `0` (`remaining === quantity` nesse instante) — não há necessidade de mudar,
e mudar para `remaining` ali seria equivalente e sem risco caso o método seja chamado de novo no futuro.

### 2. `inProductionQty`

Confirmado e corrigido (mesma mudança do ponto 1): `openQuantityByProduct` soma `remaining`, nunca
`quantity`. Uma OP de 100 com 70 já produzidas contribui só 30 como supply futuro — os 70 já produzidos já
estão contados em `stockQty`/`freeStock`, contá-los de novo em `inProduction` seria dobrar a mesma
disponibilidade.

### 3. Sugestões antigas

Confirmado: `MrpSuggestion` são fotografias imutáveis (ADR-007) — nenhum código atualiza os campos de
quantidade de uma sugestão já persistida depois de criada (as únicas escritas posteriores são
`status: pending → accepted/dismissed`, ADR-009, que nunca tocam `quantityNeeded`/`quantityAvailable`/
`quantityShortfall`). `calculate()` não usa cache — cada chamada lê o estado ao vivo do banco. Verificado
com teste dedicado (seção Testes, item 5): rodar o MRP de novo depois de uma produção parcial gera uma
sugestão NOVA refletindo o restante, sem alterar a sugestão da execução anterior.

### 4. Explosão multinível com produção parcial

Confirmado com o exemplo do enunciado (Produto A → Subconjunto B → Material C), com números concretos
para tornar a correção visível: se B tem uma OP própria de 100 unidades com 30 já produzidas, `B.stockQty`
já é 30 (a produção parcial já entra no estoque físico do próprio subconjunto — achado importante: **não
é só "quantidade restante ainda não produzida"**, o que já foi produzido também compõe a disponibilidade,
via `stockQty`) e o restante daquela OP (70) é o `inProduction`. Disponibilidade total de B = 30 + 70 =
100 — exatamente a quantidade original da OP de B, não importa em que ponto da produção parcial ela esteja
(a soma de "já pronto" + "ainda vindo" da MESMA OP é sempre constante). O ponto onde a correção realmente
importa é quando a demanda por B (vinda de A) **excede** essa soma — testado explicitamente (seção Testes,
item 3) com A precisando de 120 unidades de B: sem a correção, `inProduction` contaria os 100 originais
de cheio (em vez do restante, 70), somando incorretamente `30 + 100 = 130` de disponibilidade e escondendo
uma falta real de 20 unidades atrás de um "shortfall = 0" falso.

### 5. Reserva — dois achados

**Achado A (corrigido nesta rodada)**: `produceWithTx()` lia `quantityCompleted` de uma cópia do
registro buscada pelo Service **antes** de abrir a transação — se duas chamadas de `produce()` para a
MESMA OP chegassem quase simultâneas, cada uma poderia calcular `quantityCompleted` a partir do mesmo
valor "desatualizado", fazendo uma sobrescrever o resultado da outra. Corrigido: a transação agora relê
`quantityCompleted`/`status` de dentro de si mesma (`tx.productionOrder.findUniqueOrThrow`), reforçando
também a checagem de saldo restante ali — o SQLite serializa escritores (`BEGIN IMMEDIATE`), então essa
releitura fecha a janela de corrida. Risco de concorrência real considerado baixo (uso interno, sem
evidência de edição simultânea da mesma OP por dois usuários), mas a correção era barata e direta o
suficiente para valer a pena aplicar agora.

**Achado B (crítico, NÃO corrigido — registrado para decisão futura do usuário)**: a Reserva (ADR-006)
explode a `BomRevision` **multinível** — um subconjunto com revisão própria é transparente na explosão
(nunca vira uma linha de `MaterialReservation` para ele mesmo; a explosão desce direto até as matérias-
primas dele). O Consumo (Subetapa 1 deste ADR) opera **um nível só**, de propósito — um subconjunto é
consumido como unidade pronta do próprio estoque dele, nunca reabrindo as matérias-primas dele. **Essas
duas escolhas, cada uma correta isoladamente, não se compõem**: ao produzir Mesa (que consome 1
Estrutura), o código procura uma `MaterialReservation` para "Estrutura" — que nunca existe, porque a
Reserva da OP de Mesa reservou "Tubo" diretamente (passando através de Estrutura). Resultado: a reserva de
Tubo feita na criação da OP de Mesa **nunca é liberada**, porque o consumo daquela OP nunca chega até
Tubo. Isso reabre, de forma mais estreita, o mesmo tipo de problema que a Subetapa 1 corrigiu para o caso
de um nível só.

Este achado **não bloqueia o MRP** — o motor de cálculo do MRP tem sua própria lógica de netting
multinível, independente da Reserva/Consumo, então o ajuste desta Subetapa 2 funciona corretamente mesmo
com esse gap em aberto. Mas é um problema real de correção de dados (`Material.reservedQty` ficando
inflado indefinidamente para materiais usados só dentro de subconjuntos) que merece uma decisão explícita
— possíveis caminhos, nenhum aplicado agora: (a) tornar a Reserva também de um nível só, delegando a
reserva das matérias-primas do subconjunto para a OP própria dele (mudança em ADR-006, já aprovado e em
produção); (b) o Consumo passar a liberar a cadeia inteira de reservas ao longo do caminho até a folha,
mesmo consumindo só um nível fisicamente; (c) aceitar o gap e tratar como débito técnico catalogado,
resolvendo só se/quando afetar um caso de uso real. Recomendo esperar uma indicação sua antes de agir —
está fora do escopo do que foi pedido para a Fase 9 e mexe num ADR já fechado (ADR-006).

### 6. Eventos

Confirmado: nenhum evento novo necessário. `producao.parcial_realizada` (Subetapa 1) já é emitido em toda
chamada de `produce()` que não completa a OP — exatamente o hook que uma futura automação precisaria para
disparar `mrpExecutionService.run()` de novo depois de uma produção parcial. Nenhum consumidor registrado
ainda (mesma disciplina do ADR-003) — a arquitetura já está preparada, sem implementar o reprocessamento
automático.

### 7. Testes

`tests/mrp-partial-production.test.ts` (5 casos, exatamente os pedidos): OP 100→produz 30→MRP calcula só
70; OP 100→produz 100→some completamente da demanda; subconjunto parcialmente produzido (com os números
concretos do ponto 4, provando a correção); múltiplas OPs parcialmente produzidas do mesmo item agregando
pelo restante de cada uma; histórico antigo do MRP permanecendo inalterado após uma nova execução.

## Subetapa 2 — Implementação (2026-07-09)

**Concluída e verificada — Fase 9 completa.**

- `src/app/repositories/production-order.repository.ts`: `findManyOpenForMrp()` passa a selecionar
  `quantityCompleted`; `produceWithTx()` ganhou a releitura transacional (achado A da seção anterior).
- `src/app/services/mrp-calculation.service.ts`: as 3 ocorrências de `op.quantity` usadas como demanda
  passaram a usar `remaining = op.quantity - op.quantityCompleted`, com `continue` explícito quando
  `remaining <= 0`.
- `src/app/services/requisition.service.ts`: `suggestForProductionOrder()` corrigido para a mesma lógica
  (achado adicional do ponto 1).
- Nenhuma migração de schema nesta subetapa — puramente ajuste de cálculo.

**Testes**: 5 novos (`tests/mrp-partial-production.test.ts`), cobrindo exatamente os 5 cenários pedidos.
**105/105 testes passando no total do projeto.** `tsc --noEmit` confirma o mesmo erro de ambiente
pré-existente, não relacionado a este trabalho.

**Fase 9 (Produção Parcial) está completa** — Subetapa 1 (`produce()` único ponto de entrada) e Subetapa
2 (MRP ajustado ao saldo restante), com o achado B da seção de Reserva registrado explicitamente como
pendência arquitetural para decisão futura, não uma lacuna silenciosa.

## Decisões validadas com o usuário (resumo)

| Decisão | Escolha |
|---|---|
| Consumo de material por rodada | Proporcional automático (não manual) |
| Reserva durante produção parcial | Libera proporcionalmente a cada rodada — corrige o bug de `reservedQty` nunca liberado na conclusão |
| Fonte da receita para consumo | Migra de `ProductMaterial` (viva) para `BomLine`/`bomRevisionId` (congelada) — alinha com a Reserva |
| Estoque a cada rodada | Gera `StockMovement` `IN` próprio por rodada, não só na conclusão final |
| Novos estados de OP | Nenhum — `quantityCompleted` resolve, mesmo padrão de `PurchaseOrderItem.quantityReceived` |
| `produce()` único ponto de entrada | Confirmado — `update()→completed` delega internamente para `produce()`, uma única implementação |
| Idempotência | `ProductionOrderExecution` nova (mirror de padrão idempotente), `clientRequestId` opcional com constraint única |
| Consumo multinível | Um nível só (BomLine direta) — subconjunto consumido como unidade pronta, nunca explode nas matérias-primas dele |
| Evento novo | `producao.parcial_realizada`, emitido só quando a rodada NÃO completa a OP; `ordem_producao.finalizada` inalterado |
| Status novo em MaterialReservation | `"consumed"` — distingue de `"released"` (cancelamento) quando o material foi de fato gasto em produção |
