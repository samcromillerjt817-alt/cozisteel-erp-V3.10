# ADR-012 — Reconciliação de Reserva Multinível na Produção (pós-Fase 9)

- **Status**: **CONCLUÍDO. `consumed` é estado terminal de `MaterialReservation` — `releaseMany()`
  corrigido para nunca mais tocar reservas já consumidas. 124/124 testes passando. Fase 9 declarada
  arquiteturalmente consolidada** (ver fechamento em `ADR-001`). Nenhum schema alterado em nenhuma
  subetapa desta ADR.
- **Data**: 2026-07-10
- **Depende de**: [ADR-006 — Reserva de Material](./ADR-006-reserva-de-material.md) (explosão multinível
  da Reserva, **preservada integralmente** — decisão explícita do usuário nesta rodada: não reabrir);
  [ADR-011 — Produção Parcial](./ADR-011-producao-parcial.md) (Consumo de um nível só, `produce()`,
  `produceWithTx()` — é aqui que a reconciliação entra); [ADR-007 — MRP](./ADR-007-mrp.md) (confirmado
  não afetado — ver seção de Impactos)
- **Origem**: achado registrado no fechamento da Fase 9 (ADR-011, seção "Validação antes da Subetapa 2",
  ponto 5) e formalmente endereçado por decisão do usuário: **não** virar débito técnico, **não** reabrir
  ADR-006, **preservar** a Reserva multinível e corrigir a reconciliação durante a produção.
- **Escopo explicitamente fora desta rodada**: implementação de código; alteração de schema; rastreabilidade
  por lote (Fase 10); qualquer mudança na Reserva (`bom-explosion.service.ts`, `material-reservation.
  service.ts`) ou no Consumo físico de estoque (continuam exatamente como estão).

## Contexto — o problema exato

A Reserva de Material (Fase 5, ADR-006) explode a `BomRevision` de uma OP **multinível**: dado
Mesa → Estrutura (subconjunto com `BomRevision` própria) → Tubo (matéria-prima), `bom-explosion.service.
ts` (`explodeInto`) atravessa Estrutura de forma transparente e cria uma única `MaterialReservation`
para Tubo, na OP de Mesa — nunca uma linha de reserva para a própria Estrutura, porque ela tem revisão
própria e por isso é "vista através dela" pelo algoritmo.

O Consumo físico (Fase 9, ADR-011) opera **um nível só**, de propósito: ao produzir a OP de Mesa,
`resolveConsumptionLines()` olha só as `BomLine` diretas de Mesa — consome 1 Estrutura como unidade
pronta do estoque de Estrutura, nunca reabrindo as matérias-primas dela (essas já foram consumidas
quando a OP própria de Estrutura foi produzida, separadamente).

O resultado: `produceWithTx()` procura, para cada linha de consumo, uma `MaterialReservation` da MESMA
OP com o mesmo `itemType`/`itemId` do item consumido. Para a linha "Estrutura" isso busca uma reserva de
Estrutura — que **nunca existe**, pois a Reserva nunca criou essa linha (ela flattening através dela). A
reserva real, que existe, é a de Tubo — mas `produceWithTx()` nunca a enxerga, porque nunca chega até
Tubo ao consumir Mesa. **A reserva de Tubo feita na criação da OP de Mesa nunca é liberada.**

Cada uma das duas escolhas é correta isoladamente (Reserva multinível é a certa para planejamento de
comprometimento de material; Consumo de um nível é o certo porque cada subconjunto tem sua própria OP e
seu próprio consumo já contabilizado) — a incompatibilidade nasce só na hora de **reconciliar uma com a
outra durante a produção**, não na concepção de nenhuma das duas.

## 1. Decisão do usuário para esta rodada (já fechada, não reaberta aqui)

1. **Não** reabrir o ADR-006 — a Reserva continua multinível, sem nenhuma mudança de algoritmo.
2. **Não** tratar como débito técnico — precisa de correção agora, antes da próxima fase, porque afeta
   diretamente a consistência entre Reserva, Produção e (futuramente) Dashboard/Financeiro.
3. O problema está **só na reconciliação durante a produção** — é aí que a correção entra.

## 2. Análise de reuso de algoritmo (obrigatória antes de propor um serviço novo)

Hoje existem dois algoritmos de explosão de BOM, cada um com um propósito diferente:

| | `bom-explosion.service.ts` (`BomExplosionService`) | `mrp-calculation.service.ts` (netting) |
|---|---|---|
| Propósito | Flatten total: agregar TODA matéria-prima/componente-folha de uma árvore, para reservar contra o saldo físico de UMA OP | Netting por nível: calcular o que FALTA (shortfall) depois de descontar estoque/reserva/em-produção de CADA nível, propagando só o que falta para o próximo nível |
| Ponto de entrada | Um produto raiz + quantidade | Todas as OPs abertas do sistema, simultaneamente |
| Resultado | Dois `Map` agregados (materialId→qtd, productId→qtd) | Lista de sugestões, uma por item, com rastreamento de origem (`sources`) |
| Trata estoque de subconjunto intermediário? | Não — desce até a folha ignorando o quanto já existe em estoque do subconjunto | Sim — é exatamente o ponto central do algoritmo (netting) |
| Usa revisão congelada ou ativa? | Raiz congelada (`bomRevisionId` da OP); níveis abaixo usam a revisão ATIVA de cada subconjunto no momento da chamada | Raiz congelada por OP; níveis abaixo usam a revisão ativa, mas com netting incremental por shortfall |

**Conclusão: o algoritmo do MRP não é reutilizável para reconciliação.** Ele resolve "quanto falta
comprar/produzir no total do sistema agora", uma pergunta global e sem estado por OP — não tem nenhum
conceito de "qual `MaterialReservation` de qual OP precisa ser decrementada". Reaproveitá-lo exigiria
desmontar sua lógica de netting (que é exatamente o oposto do que a reconciliação precisa: aqui queremos
o **bruto** consumido nesta rodada, não o líquido depois de descontar estoque).

**O algoritmo da Reserva (`bomExplosionService.explode()`/`explodeInto()`) é diretamente reutilizável — e
deve ser reutilizado, não reimplementado.** A razão é mais forte do que conveniência: a reconciliação
precisa encontrar **exatamente** os mesmos itens-folha (materialId/productId) que a Reserva já flatten-ou
para dentro de `MaterialReservation` — usar qualquer outra lógica de travessia (mesmo que matematicamente
equivalente) arriscaria divergir da árvore real que gerou as reservas, gerando o mesmo tipo de
inconsistência que estamos corrigindo. Reaproveitar o mesmo algoritmo, entrando por um nó diferente da
árvore (o componente consumido nesta rodada, em vez da raiz da OP), é a única forma de garantir que
"o que a reconciliação libera" e "o que a Reserva reservou" sejam sempre o mesmo conjunto de chaves,
por construção — não por coincidência ou por testes cobrindo os casos que pensamos agora.

Não é necessário nem desejável criar um terceiro algoritmo de travessia de árvore.

## 3. Arquitetura proposta

### 3.1 Novo serviço: `ReservationReconciliationService`

Responsabilidade única, exatamente como o usuário formulou: **dada uma Ordem de Produção e uma
quantidade produzida nesta rodada, identificar exatamente quais reservas (de qualquer profundidade)
precisam ser reconciliadas, e por quanto.**

```ts
// src/app/services/reservation-reconciliation.service.ts (proposta — não implementado nesta rodada)

interface ConsumptionLine {
  lineType: string              // "material" | "component"
  materialId: string | null
  componentProductId: string | null
  quantity: number               // por 1 unidade do produto pai (igual a hoje)
  scrapPct: number
}

class ReservationReconciliationService {
  /**
   * Recebe as MESMAS linhas de consumo físico que produceWithTx já resolve hoje (resolveConsumptionLines,
   * um nível só) e a quantidade produzida nesta rodada. Para cada linha:
   *  - "material" ou "component" SEM revisão própria → é folha, mesma regra de hoje: entra direto no
   *    resultado com a quantidade consumida desta rodada.
   *  - "component" COM revisão própria (subconjunto fabricável) → não é folha para fins de RESERVA
   *    (a Reserva nunca criou uma linha para ele) — reexplode por baixo dele, reutilizando
   *    bomExplosionService.explode(componentId, consumedQtyDesteComponente), e mescla o resultado.
   * Retorna a MESMA estrutura que bomExplosionService já usa (BomExplosionResult: materialNeeds/
   * productNeeds agregados) — não um formato novo — para reaproveitar tipos e testes existentes.
   */
  async resolveReleaseTargets(
    lines: ConsumptionLine[],
    quantityThisRound: number
  ): Promise<BomExplosionResult> {
    const result: BomExplosionResult = { materialNeeds: new Map(), productNeeds: new Map() }

    for (const line of lines) {
      const consumedQty = line.quantity * quantityThisRound * (1 + line.scrapPct / 100)
      if (consumedQty <= 0) continue

      if (line.lineType === 'material') {
        merge(result.materialNeeds, line.materialId!, consumedQty)
        continue
      }

      const componentId = line.componentProductId!
      const ownRevision = await bomRevisionRepository.findActiveByProduct(componentId)

      if (!ownRevision) {
        // Componente sem revisão própria (comprado/terceirizado) — folha, igual à Reserva.
        merge(result.productNeeds, componentId, consumedQty)
        continue
      }

      // Subconjunto fabricável: a Reserva nunca reservou ELE, reservou o que está ABAIXO dele.
      // Reexplode reaproveitando o MESMO algoritmo da Reserva, a partir deste nó, para a
      // quantidade CONSUMIDA nesta rodada (não a quantidade total da OP).
      const sub = await bomExplosionService.explode(componentId, consumedQty)
      mergeAll(result.materialNeeds, sub.materialNeeds)
      mergeAll(result.productNeeds, sub.productNeeds)
    }

    return result
  }
}

export const reservationReconciliationService = new ReservationReconciliationService()
```

**Puramente computacional — sem leitura/escrita transacional própria**, exatamente no mesmo espírito de
`BomExplosionService` (ADR-006: "não persiste nada — função pura de leitura"). Isso é deliberado: mantém
o novo serviço testável isoladamente (dado um conjunto de linhas + quantidade, que mapa de reservas-alvo
sai), sem precisar de banco/transação para testar a lógica de travessia em si.

**Por que um serviço novo, e não um método a mais em `BomExplosionService` ou em `MaterialReservationService`?**
- Não é `BomExplosionService` porque a pergunta é diferente: aquele serviço responde "quanto uma
  quantidade de um produto raiz precisa, no total, de cada folha" (usado na criação da reserva). Este
  responde "dado o que uma OP acabou de consumir fisicamente (um nível só), quais reservas (de qualquer
  profundidade) isso já cobre." São perguntas com direção oposta na árvore (uma desce da raiz, a outra
  entra por um nó no meio) — merecem assinaturas e nomes diferentes, mesmo reaproveitando o mesmo motor
  de travessia por baixo.
- Não é `MaterialReservationService` porque esse serviço já tem responsabilidade única e coesa: criar
  (`reserveForProductionOrder`) e liberar-por-cancelamento (`releaseForProductionOrder`) reservas
  inteiras de uma OP. Reconciliação-por-consumo-parcial é um terceiro caso de uso, com uma pergunta
  (quais reservas, de qual profundidade, por quanto) que nenhum dos dois métodos existentes resolve nem
  deveria ser forçado a resolver.

### 3.2 Onde a resposta é calculada e onde é aplicada — revisado após validação do usuário (2026-07-10)

**Cálculo (`resolveReleaseTargets`) passa a acontecer na camada de Service, não dentro da transação do
Repository** — revisão em relação ao rascunho original deste ADR, em resposta direta ao ponto 2 da
validação do usuário (ver seção "Validação adicional" abaixo: o serviço deve ser só computacional, sem
transação própria). `ProductionOrderService.produce()` já resolve hoje as linhas de consumo físico
(`resolveConsumptionLines()`) ANTES de chamar `productionOrderRepository.produceWithTx()` — o cálculo de
reconciliação entra exatamente ao lado desse já existente, reaproveitando a MESMA lista `lines`:

```ts
// dentro de ProductionOrderService.produce(), antes de chamar produceWithTx() — nenhuma mudança na
// assinatura pública de produce(), só o corpo do método
const lines = await this.resolveConsumptionLines(order)               // já existe, inalterado
const releaseTargets = await reservationReconciliationService
  .resolveReleaseTargets(lines, quantityThisRound)                    // novo — puramente computacional

const result = await productionOrderRepository.produceWithTx(
  order, lines, releaseTargets, quantityThisRound, userId, options?.clientRequestId, options?.additionalFields
)
```

Isso resolve de vez a preocupação do ponto 2: `ReservationReconciliationService` nunca vê `tx`, nunca
escreve, e sequer roda dentro do escopo da transação — é uma função pura de leitura de estrutura de BOM,
chamada como qualquer outro cálculo de preparação da Service, exatamente no mesmo espírito de
`resolveConsumptionLines()` (que já vive na Service, não no Repository, pelo mesmo motivo).

**Aplicação continua exatamente onde já está** — dentro da transação atômica de `produceWithTx()`
(`production-order.repository.ts`), pelo mesmo motivo de sempre (atomicidade entre baixa de estoque,
liberação de reserva e gravação de `quantityCompleted`). A única mudança é **de onde vem a lista de
reservas a liberar**, agora recebida como parâmetro já calculado (`releaseTargets`), não recalculada
dentro da transação:

- **Hoje**: para cada linha de consumo físico (uma por vez), procura uma `MaterialReservation` com o
  MESMO `itemType`/`itemId` da linha. Funciona só quando o item consumido é ele mesmo o item reservado
  (matéria-prima direta, ou componente sem revisão própria).
- **Proposto**: o laço de liberação de reserva passa a iterar o `releaseTargets` recebido como parâmetro
  (não mais as linhas de consumo diretas) — a lógica de liberação em si (clamp por `quantityReserved`,
  atualização de `quantityNeeded`/`quantityShortfall`/`status`, `StockMovement RELEASE`) **não muda
  nenhuma linha**, só passa a rodar para mais chaves.

O laço de **consumo físico** (baixa de `stockQty` do item consumido, `StockMovement OUT`, entrada
proporcional do produto acabado) **continua idêntico, um nível só** — nada nele muda, e continua
recebendo `lines` exatamente como hoje. A separação fica clara: "o que sai fisicamente do estoque" (um
nível, físico, calculado e aplicado como hoje) e "o que estava reservado e agora pode ser liberado"
(multinível, contábil, calculado fora da transação e só aplicado dentro dela) passam a ser dois cálculos
explicitamente distintos, cada um com sua própria fonte — exatamente o que o usuário pediu.

### 3.3 Fluxograma

```
┌─────────────────────────┐
│ Criação da OP (Mesa)     │
│ - congela bomRevisionId  │
└────────────┬─────────────┘
             │
             ▼
┌─────────────────────────────────────┐
│ Reserva (MaterialReservationService) │
│ bomExplosionService.explodeRevision  │   ← multinível, raiz = Mesa
│ Mesa → Estrutura (transparente) → Tubo│
│ Cria MaterialReservation(Mesa, Tubo) │   ← nunca cria linha p/ Estrutura
└────────────┬──────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────┐
│ produce(Mesa, quantityThisRound) — Service, SEM tx     │
│                                                        │
│  resolveConsumptionLines(Mesa)                         │   ← já existe, um nível: [Estrutura]
│                                                        │
│  NOVO, puramente computacional, sem tx, sem escrita:   │
│  reservationReconciliationService                      │
│    .resolveReleaseTargets([Estrutura], qty)            │
│    → Estrutura TEM revisão própria                     │
│    → reexplode: bomExplosionService.explode(           │
│        Estrutura, consumedQty)  ← MESMO motor da Reserva│
│    → resultado: releaseTargets = { materialNeeds: {Tubo: X} }│
└────────────┬────────────────────────────────────────────┘
             │  (lines, releaseTargets, quantityThisRound) →
             ▼
┌───────────────────────────────────────────────────┐
│ produceWithTx() — transação atômica (Repository)     │
│ só aplica o que já foi calculado acima, não recalcula│
│                                                      │
│  (A) Consumo físico (INALTERADO, um nível, usa `lines`):│
│      Estrutura.stockQty -= consumedQty               │
│      StockMovement OUT (Estrutura)                   │
│                                                      │
│  (B) Laço de liberação de reserva itera `releaseTargets`│
│      (não mais as linhas de consumo diretas):         │
│      MaterialReservation(Mesa, Tubo) encontrada       │
│      releaseQty = min(X, reservation.quantityReserved)│
│      Tubo.reservedQty -= releaseQty                   │
│      StockMovement RELEASE (Tubo)                     │
│      reservation.quantityNeeded -= X                  │
│      status = 'consumed' se needed chegou a 0          │
│                                                      │
│  (C) Produto acabado: Mesa.stockQty += quantityThisRound│
│      StockMovement IN (Mesa) — INALTERADO             │
│                                                      │
│  (D) ProductionOrder.quantityCompleted += quantityThisRound│
│      status = 'completed' se atingiu quantity — INALTERADO│
└────────────┬──────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────┐
│ OP completa ou parcial    │
│ eventos de domínio         │   ← INALTERADO (Subetapa 1/2, ADR-011)
│ (nenhum evento novo)       │
└─────────────────────────┘
```

A nova responsabilidade entra **na Service, antes da transação**, computando o alvo correto de
liberação; o passo (B) dentro de `produceWithTx()` é o laço de liberação já existente, só trocando sua
fonte (recebe o resultado pronto, não recalcula nada). Nenhum outro ponto do fluxo (criação, reserva,
consumo físico, entrada de produto acabado, conclusão da OP, eventos) muda.

## 4. Garantias exigidas — como cada uma é atendida

- **Nunca liberar uma reserva duas vezes**: a proteção já existente continua sendo a única necessária —
  `ProductionOrderExecution`/`clientRequestId` (ADR-011, Subetapa 1) barra reprocessar a MESMA rodada;
  o mapa agregado (`releaseTargets`, calculado uma vez na Service antes da transação) é aplicado uma
  única vez dentro da transação, e cada chave (materialId/productId) é liberada uma vez só nesta rodada
  — nunca duas rodadas diferentes
  liberam a mesma unidade física, porque cada rodada só agrega o `consumedQty` DAQUELA rodada (nunca o
  acumulado histórico).
- **Nunca deixar `reservedQty` inconsistente**: o clamp `Math.min(consumedQty, reservation.
  quantityReserved)` (já existente, inalterado) garante que nunca se libera mais do que estava
  reservado, mesmo que a árvore agregue o mesmo material-folha por dois caminhos diferentes na MESMA
  rodada (ver "múltiplas ocorrências do mesmo componente" abaixo) — porque a agregação acontece ANTES de
  tocar o banco (dentro do `Map` de `resolveReleaseTargets`), então cada `MaterialReservation` é lida e
  atualizada uma única vez por rodada, com o total já somado.
- **Funcionar para produção parcial e total**: `resolveReleaseTargets` recebe `quantityThisRound`
  exatamente como já acontece hoje no consumo físico — nenhuma distinção entre parcial/total, mesma
  lógica dos dois casos (mirror do próprio ADR-011).
- **Compatibilidade com MRP/Produção Parcial/fases já implementadas**: nenhuma delas lê
  `MaterialReservation` diretamente (MRP usa `reservedQty` agregado; Produção Parcial já está com sua
  lógica de `quantityCompleted` inalterada) — só o "quanto é liberado" muda, nunca "quando" ou "como" as
  demais fases operam.

**Múltiplas ocorrências do mesmo componente na mesma rodada** (ex.: Mesa consome Estrutura diretamente E
também consome Parafuso, que por acaso também está dentro da árvore interna de Estrutura, ou duas linhas
de consumo apontando indiretamente para o mesmo material-folha): como `resolveReleaseTargets` usa o
mesmo padrão de agregação em `Map` que `bomExplosionService` já usa (soma no mesmo `Map`, nunca
sobrescreve), o resultado final já vem consolidado por chave antes de qualquer escrita no banco — o
laço de liberação em `produceWithTx` processa cada chave (materialId/productId) uma única vez por
rodada, com a soma correta.

## Validação adicional (2026-07-10) — direção geral aprovada, 7 pontos antes de codar

### 1. Fonte única de verdade

Confirmado: `resolveReleaseTargets()` nunca reimplementa nem copia a lógica de explosão — ele **chama
diretamente** `bomExplosionService.explode(componentId, consumedQty)`, o mesmo método (mesmo singleton
exportado) que a Reserva já usa hoje para os níveis abaixo da raiz. Não existe formatação/tradução
intermediária da árvore entre os dois usos — é literalmente a mesma função sendo invocada a partir de um
nó diferente (o componente consumido nesta rodada, em vez da raiz da OP).

Consequência direta e desejada: **se a lógica de explosão mudar amanhã** (nova regra de scrap, novo tipo
de linha, mudança na detecção de ciclo, etc.), Reserva e Reconciliação mudam juntas automaticamente,
porque as duas chamam o mesmo código — não há dois lugares para lembrar de atualizar.

Uma nuance herdada, não introduzida por esta proposta: `explodeInto` já resolve os níveis ABAIXO da raiz
pela revisão **ativa agora** de cada subconjunto (só a raiz é congelada via `bomRevisionId`/
`pinnedRevisionId`) — isso é assim desde a Fase 5/ADR-006, para a Reserva, e a Reconciliação herda
exatamente o mesmo comportamento por reutilizar o mesmo método. Isto é, se a engenharia de Estrutura
mudar entre o momento em que a Reserva de Mesa foi calculada e o momento em que Mesa é produzida, os dois
cálculos poderiam teoricamente ver estruturas diferentes de Estrutura — mas esse risco já existe hoje
(inclusive já existe entre duas chamadas de `reserveForProductionOrder()` para a mesma OP, que é
idempotente e pode ser re-executada). Reconciliação não piora nem cria esse risco — apenas o herda, pela
mesma razão que garante a consistência pedida: usar exatamente o mesmo motor.

### 2. Responsabilidade — revisado (ver seção 3.2 acima)

Confirmado e a arquitetura foi ajustada: `ReservationReconciliationService` não abre transação, não
escreve no banco, não altera estoque nem reserva. O ponto de chamada foi movido da transação do
Repository para a Service (ao lado de `resolveConsumptionLines()`, que já vive lá pelo mesmo motivo) —
ver seção 3.2 revisada. Toda persistência (leitura fresca de `MaterialReservation`, decremento de
`reservedQty`, `StockMovement RELEASE`, atualização de `quantityNeeded`/`status`) continua exclusivamente
dentro de `produceWithTx()`, que agora recebe o resultado já calculado (`releaseTargets`) como parâmetro
em vez de calculá-lo internamente.

### 3. Escalabilidade — complexidade e necessidade futura de cache

**Custo por chamada de `produce()`**: seja `D` o número de linhas diretas da OP (tipicamente pequeno,
raramente mais que algumas dezenas) e, para cada linha "component" com revisão própria, seja `S` o
tamanho da subárvore daquele subconjunto (nós/linhas na estrutura interna dele). O custo adicional da
reconciliação por chamada é `O(D + Σ S_i)` — proporcional ao tamanho total das subestruturas
diretamente abaixo da OP, não ao tamanho da árvore inteira da Reserva original (que já paga esse custo
uma vez, na criação da OP). Cada `bomExplosionService.explode()` chamado por linha tem o MESMO custo
assintótico que a Reserva já paga para aquele mesmo trecho da árvore — nenhuma complexidade nova, só
uma segunda cobrança do mesmo custo.

**Impacto para estruturas profundas (4+ níveis)**: o custo escala com o número de nós visitados na
subárvore, exatamente como a explosão da Reserva já escala hoje (recursão simples, sem explosão
combinatória adicional introduzida por esta proposta) — profundidade em si não é o fator dominante,
número de linhas de BOM percorridas é.

**Impacto para produtos reutilizados (mesmo subconjunto usado em vários produtos-pai/OPs diferentes)**:
zero interação de custo entre OPs — cada `produce()` reconcilia só a própria árvore, então reutilização
ACROSS produtos não multiplica custo. DENTRO de uma mesma OP, se o mesmo subconjunto aparecer em mais de
uma linha de BOM (raro, mas não impedido pelo schema), cada ocorrência é explorada separadamente — custo
linear na quantidade de ocorrências, não exponencial (mesma característica, não nova, já presente em
`bomExplosionService` desde a Fase 5).

**Custo acumulado ao longo da vida de uma OP com múltiplas rodadas parciais**: este é o ponto mais
relevante a registrar. Diferente da Reserva (que explode a árvore inteira **uma única vez**, na criação
da OP), a Reconciliação recalcula a subárvore de cada componente-com-revisão-própria **a cada rodada de
produção parcial** — uma OP produzida em `R` rodadas paga `R × Σ S_i` no total, não `Σ S_i` uma vez só.
Para uma OP com poucas rodadas (o caso comum) isso é desprezível; para uma OP hipotética com um número
grande de rodadas MUITO pequenas sobre uma subestrutura grande, o custo cumulativo cresce linearmente
com o número de rodadas.

**Necessidade de cache**: não implementar agora (instrução explícita do usuário), mas o ponto de
extensão natural já fica claro: como a explosão "por unidade" de um subconjunto só depende da estrutura
(revisão ativa daquele subconjunto), não da quantidade nem da rodada, um cache futuro chaveado por
`(componentProductId, revisionId do subconjunto)` → resultado da explosão "por 1 unidade" (multiplicado
depois pela quantidade da rodada) eliminaria o recálculo repetido entre rodadas — e serviria tanto a
Reconciliação quanto, potencialmente, a própria Reserva. Registrado como extensão futura, não como parte
desta implementação.

### 4. Idempotência

Confirmado com o mecanismo já existente (ADR-011, Subetapa 1), sem necessidade de nenhuma proteção nova:

- **Retry com o mesmo `clientRequestId`**: a checagem de `ProductionOrderExecution` já acontece no
  TOPO de `produceWithTx()`, ANTES de qualquer aplicação de `releaseTargets` — uma segunda chamada com o
  mesmo `clientRequestId` retorna cedo (`alreadyProcessed: true`) sem tocar em nenhuma reserva. O cálculo
  de `resolveReleaseTargets()` na Service, por ser puramente funcional e sem efeito colateral, PODE rodar
  de novo numa tentativa duplicada (é feito antes da checagem de idempotência, que só existe dentro da
  transação) — isso é apenas trabalho computacional redundante, nunca um risco de correção, porque a
  APLICAÇÃO do resultado é que é protegida, não o cálculo.
- **Múltiplas produções parciais legítimas (rodadas distintas, sem reenvio)**: cada rodada calcula seu
  próprio `releaseTargets` a partir do seu próprio `quantityThisRound` — a aplicação usa sempre
  `Math.min(consumedQty, reservation.quantityReserved)` (clamp já existente), então o acumulado ao longo
  de N rodadas nunca ultrapassa o que foi de fato reservado, não importa como as rodadas se dividem.
- **Reprocessamento sem `clientRequestId`** (chamar `produce()` de novo manualmente, fora do mecanismo de
  retry): não protegido — exatamente a mesma característica já documentada no ADR-011 para o consumo
  físico ("a proteção só ativa quando um token real é fornecido"). A reconciliação não enfraquece nem
  fortalece essa característica: ela está sujeita exatamente à MESMA proteção que já cobre o consumo
  físico, nunca uma proteção separada ou mais fraca.

### 5. Eventos — mantido interno, sem evento novo

Analisado e concordamos com a tendência do usuário: reconciliação continua **inteiramente interna** ao
fluxo de `produce()`, sem evento de domínio dedicado. Razão concreta, não só preferência: tudo que um
consumidor futuro precisaria saber ("quais reservas foram liberadas, quanto, de qual OP") já fica
**persistido e consultável** nos registros que a aplicação já cria hoje — `StockMovement` tipo `RELEASE`
(com `referenceType: 'production_order'`/`referenceId`) e o próprio `MaterialReservation` atualizado. Um
evento adicional serviria só para notificação em tempo real de algo que já é auditável via consulta —
sem um consumidor concreto que precise IR ATRÁS disso no momento em que acontece (diferente de
`producao.parcial_realizada`, que existe porque uma automação futura de reprocessamento do MRP
precisaria ser DISPARADA, não apenas consultar depois). Não há ganho arquitetural real identificado —
mantemos sem evento novo, e a porta continua aberta (mesmo padrão do `DomainEventBus`, ADR-003) se um
consumidor concreto surgir no futuro.

### 6. Observabilidade — ponto de extensão previsto, sem implementar agora

Ponto ideal para um futuro registro auditável, já identificado sem precisar de mudança de schema:

- **Imediato/barato** (já proposto na seção de Impactos): a `reason` do `StockMovement RELEASE` passa a
  distinguir liberação direta ("Consumo na produção da OP X") de liberação indireta via subconjunto
  ("Consumo indireto via Estrutura na OP X") — isso já torna o histórico de `StockMovement` auditável por
  humano sem nenhuma tabela nova, hoje mesmo.
- **Extensão futura, se um relatório estruturado for necessário**: `ProductionOrderExecution` (já o
  registro append-only, por rodada, de ADR-011) é o ponto natural para pendurar um detalhamento futuro
  de "quais reservas esta execução reconciliou e por quanto" — uma tabela filha opcional (não proposta
  nem necessária agora) relacionada a essa execução seria a extensão natural, em vez de inventar um
  mecanismo de auditoria paralelo. `AuditLog` (usado para CRUD de entidades por usuários) não é o lugar
  certo — o precedente já estabelecido no projeto é que mudanças de estoque/reserva são auditadas via
  `StockMovement`, nunca via `AuditLog` (ADR-006/010/011 já seguem essa convenção).

## 5. Impactos

- **Reserva de Material (ADR-006)**: nenhuma mudança de código ou de comportamento na criação/
  cancelamento de reserva — só a leitura, na reconciliação, do MESMO algoritmo de explosão.
- **Produção Parcial (ADR-011)**: `ProductionOrderService.produce()` ganha uma chamada a mais (o novo
  serviço, ao lado de `resolveConsumptionLines()`) antes de invocar `produceWithTx()`; a assinatura
  pública de `produce()` (o que os chamadores externos veem) não muda; `produceWithTx()` ganha um novo
  parâmetro (`releaseTargets`, já calculado) em vez de recalcular a partir das linhas de consumo; nenhum
  teste existente de estrutura de UM nível é afetado (quando não há subconjunto com revisão própria envolvido,
  `resolveReleaseTargets` devolve exatamente o mesmo resultado que o código atual já produz hoje —
  comportamento idêntico nesse caso, por construção).
- **MRP (ADR-007)**: não lê `MaterialReservation`, então nenhuma mudança de código. **Efeito indireto
  relevante, a avaliar com o usuário**: hoje, por causa do bug, `reservedQty` de matérias-primas usadas
  só dentro de subconjuntos fica inflado indefinidamente — isso faz o MRP **subestimar** `freeStock`
  (calculado como `stockQty - reservedQty`), ou seja, o MRP hoje tende a **superestimar** a necessidade
  de compra desses itens. Corrigir a reconciliação vai liberar esse `reservedQty` corretamente, o que
  pode **reduzir** sugestões de compra existentes para materiais usados via subconjuntos — mudança de
  comportamento observável, não um efeito colateral silencioso, e deve ser comunicada como parte do
  resultado desta correção.
- **Estoque**: novos `StockMovement` do tipo `RELEASE` passam a ocorrer para materiais que hoje nunca
  recebiam esse movimento em produções envolvendo subconjuntos — a `reason` deve deixar claro que é uma
  liberação indireta (proposta: `"Consumo indireto via <Subconjunto> na OP <número>"`, distinta da
  `reason` já usada para liberação direta), preservando rastreabilidade/auditoria sem confundir os dois
  casos num relatório futuro.
- **Eventos de domínio**: nenhum evento novo necessário — a reconciliação é um detalhe de implementação
  de `produce()`, já coberto pelos eventos existentes (`producao.parcial_realizada`/`ordem_producao.
  finalizada`, ADR-011). Nenhum consumidor externo precisa saber "quantos níveis" foram reconciliados.
- **Fases futuras**:
  - **Lotes (Fase 10)**: este é exatamente o ponto onde rastreabilidade por lote vai precisar se
    encaixar — `resolveReleaseTargets` já computa a lista completa de materiais-folha efetivamente
    consumidos por uma rodada de produção, em qualquer profundidade; quando a Fase 10 chegar, decidir
    lotes específicos por item dessa mesma lista é uma extensão natural, não uma nova travessia de árvore.
  - **KPIs/Dashboard**: `reservedQty` deixa de ficar cronicamente inflado para materiais usados via
    subconjunto — qualquer KPI futuro de "material comprometido" passa a refletir a realidade, não um
    valor que só cresce.
  - **Financeiro**: nenhum impacto direto nesta correção (reserva/liberação não move valor financeiro,
    só quantidade física) — mencionado por completude, sem ação necessária.

## 6. Casos de teste (lista completa proposta)

1. Produção parcial em estrutura de 2 níveis (Mesa→Estrutura→Tubo): produzir parte de Mesa libera a
   fração correspondente da reserva de Tubo, nunca a reserva de Estrutura (que nunca existiu).
2. Produção TOTAL da mesma estrutura de 2 níveis: reserva de Tubo chega a `quantityNeeded = 0`,
   `status = 'consumed'`.
3. Múltiplas produções parciais sucessivas da mesma OP (ex. 3 rodadas de 30+30+40): a soma das
   liberações de Tubo bate exatamente com o total teórico, sem sobra nem falta, mesmo dividida em N
   chamadas de `produce()`.
4. Duas OPs diferentes compartilhando o mesmo componente-folha (ex. Mesa e Cadeira, ambas usando Tubo
   diretamente ou via subconjuntos diferentes): produzir uma OP nunca libera/mexe na reserva da outra
   (escopo sempre por `productionOrderId`).
5. Consumo proporcional: rodada de X% da quantidade da OP libera exatamente X% (proporcional, com
   `scrapPct` aplicado) da reserva de cada material-folha envolvido, em qualquer profundidade.
6. Prevenção de dupla liberação: duas chamadas de `produce()` com o MESMO `clientRequestId` (retry)
   reconciliam só uma vez — a segunda chamada é idempotente (mesmo mecanismo já existente,
   `ProductionOrderExecution`).
7. Subconjunto reutilizado em vários produtos-pai (ex. Estrutura usada tanto em Mesa quanto em
   Cadeira, cada uma com sua própria OP e sua própria reserva de Tubo): reconciliar a OP de Mesa nunca
   afeta a reserva de Tubo pertencente à OP de Cadeira.
8. Estrutura profunda (4+ níveis: Produto→Subconjunto A→Subconjunto B→Subconjunto C→Matéria-prima):
   produzir o produto raiz reconcilia corretamente a reserva da matéria-prima no nível mais profundo,
   reaproveitando a recursão já existente em `bomExplosionService.explode()`.
9. Ciclo inválido na estrutura (produto referenciando a si mesmo, direta ou indiretamente, como
   componente): `resolveReleaseTargets` propaga o mesmo erro de ciclo que `bomExplosionService` já
   lança hoje (`BadRequestException`), sem mascarar nem duplicar a detecção.
10. Componente consumido sem revisão própria (comportamento de hoje, já coberto): continua tratado como
    folha direta, sem reexplosão — teste de regressão explícito para garantir que o caso já testado na
    Fase 9 continua idêntico.
11. Item consumido que aparece tanto como linha direta da OP quanto dentro da árvore interna de um
    subconjunto consumido na mesma rodada: a liberação agregada soma os dois caminhos e libera uma única
    vez, respeitando o clamp por `quantityReserved`.
12. **Compatibilidade total com a suíte existente**: os 105 testes já passando (Fases 1-9) continuam
    passando sem alteração — em particular toda a suíte de `production-order-partial.test.ts` e
    `mrp-partial-production.test.ts`, que cobrem estruturas de um nível só (onde o comportamento não deve
    mudar em nada).
13. **Mesma matéria-prima usada em dois subconjuntos diferentes, dentro da MESMA OP** (ex.: Mesa usa
    Estrutura E Pé como componentes diretos, e ambos internamente consomem Tubo): reconciliar Mesa deve
    somar corretamente a liberação de Tubo vinda dos dois caminhos, aplicada uma única vez sobre a MESMA
    linha de `MaterialReservation(Mesa, Tubo)` — não duas liberações separadas competindo pelo mesmo
    clamp.
14. **Múltiplas revisões de BOM congeladas coexistindo**: duas OPs abertas do mesmo produto (Mesa),
    cada uma congelada numa `BomRevision` diferente (OP-1 na revisão A, OP-2 numa revisão B liberada
    depois) — reconciliar cada uma deve respeitar sua PRÓPRIA raiz congelada (via `resolveConsumptionLines`,
    inalterado) e nunca misturar as reservas ou os consumos de uma OP com a estrutura da outra.
15. **Produção parcial em duas OPs simultaneamente**: duas chamadas de `produce()` para OPs DIFERENTES
    (não a mesma OP), ocorrendo em paralelo/intercaladas — cada uma reconcilia só suas próprias reservas,
    sem interferência cruzada e sem deadlock (SQLite serializa escritores, mas as duas transações não
    disputam a mesma linha).
16. **Reconciliação após alteração da BOM ativa do produto raiz**: liberar uma nova `BomRevision` para
    Mesa (tornando-a a revisão ATIVA do produto) depois que uma OP de Mesa já foi criada e congelada numa
    revisão anterior — produzir essa OP deve continuar reconciliando pela revisão CONGELADA
    (`order.bomRevisionId`, via `resolveConsumptionLines`), nunca pela nova revisão ativa — mesmo
    princípio de congelamento na raiz que o Consumo físico já garante hoje, agora verificado também para
    o caminho de reconciliação de reserva.

## 7. Alternativas consideradas

**A. Reabrir a Reserva para também ser de um nível só** (rejeitada pelo próprio usuário nesta rodada) —
delegaria a reserva de matérias-primas de um subconjunto para a OP própria dele. Descartada: exigiria
reabrir um ADR já aprovado e em produção (ADR-006), e a Reserva multinível é reconhecidamente a
abordagem correta para planejamento/comprometimento antecipado de material (ela precisa saber, na
criação da OP de Mesa, que vai precisar de Tubo, mesmo que a OP de Estrutura ainda nem exista).

**B. Consumo físico também multinível** (não cogitada como séria, mas registrada por completude) —
faria o consumo de Mesa reabrir as matérias-primas de Estrutura de novo, duplicando o consumo que já
aconteceu quando a OP de Estrutura foi produzida. Contradiz diretamente a Subetapa 1 do ADR-011 ("nunca
duplicar consumo") e o requisito explícito desta rodada ("manter o Consumo físico em um único nível").

**C. Um terceiro algoritmo de travessia dedicado a reconciliação** (rejeitada, ver seção 2) — arriscaria
divergir da árvore real usada pela Reserva, exatamente o tipo de inconsistência que estamos corrigindo.

**D. Reconciliação como parte do algoritmo do MRP** (rejeitada, ver seção 2) — perguntas e formatos de
resultado incompatíveis (netting global vs. reconciliação por OP); MRP não tem, e não deveria ganhar,
nenhum conceito de "liberar reserva de uma OP específica".

**Solução escolhida**: novo serviço `ReservationReconciliationService`, puramente computacional,
reaproveitando `bomExplosionService.explode()` a partir do componente consumido em cada rodada — a única
alternativa que preserva ambos os requisitos do usuário (Reserva multinível intacta, Consumo físico de
um nível intacto) sem introduzir um segundo algoritmo de travessia de árvore.

## 8. Plano de implementação em subetapas (após validação desta arquitetura)

- **Subetapa 1 — `ReservationReconciliationService`**: implementar `resolveReleaseTargets()` isolado,
  com testes unitários próprios (sem tocar `produceWithTx()` nem `produce()` ainda) — cobre os testes 1,
  5, 7, 8, 9, 10, 13, 14, 16 da seção 6 usando apenas o serviço novo contra estruturas de BOM de teste,
  sem produção real envolvida.
- **Subetapa 2 — Integração em `ProductionOrderService.produce()` e `produceWithTx()`**: `produce()`
  passa a calcular `releaseTargets` (ao lado de `resolveConsumptionLines()`) e repassar para
  `produceWithTx()`, que troca a fonte do laço de liberação de reserva (do mapeamento linha-a-linha atual
  para o parâmetro já calculado), mantendo o laço de consumo físico intocado — cobre os testes 2, 3, 4,
  6, 11, 15 da seção 6, além de rodar a suíte completa (teste 12) para confirmar zero regressão.
- Nenhuma subetapa altera schema — toda a correção vive na camada de Service/lógica de reconciliação.

## Validação final antes da Subetapa 2 (2026-07-10) — Subetapa 1 aprovada, 7 pontos adicionais

### 1. Ordem das operações — confirmada, com uma correção em relação à sequência proposta

A sequência realmente implementada:

1. **Service, fora da transação** — validar a produção: status permitido (`planned`/`in_progress`/
   `paused`), `quantityThisRound > 0`, `quantityThisRound <= outstanding` (saldo restante).
2. **Service, fora da transação** — calcular consumo físico: `resolveConsumptionLines()` (inalterado
   desde a Subetapa 1 do ADR-011) → `lines`.
3. **Service, fora da transação** — calcular `releaseTargets`: `reservationReconciliationService.
   resolveReleaseTargets(lines, quantityThisRound)` (novo, ADR-012).
4. **Repository — abre `produceWithTx()`** (transação atômica).
5. **Dentro da tx** — checar idempotência (`clientRequestId`/`ProductionOrderExecution`): se já
   processado, retorna cedo, nada mais executa (passo que a sequência original não listava, mas que
   já existe desde a Subetapa 1 do ADR-011 e precisa vir ANTES de qualquer escrita).
6. **Dentro da tx** — reler `quantityCompleted`/`status` frescos e revalidar o saldo restante (guarda
   contra corrida, ADR-011 Subetapa 2 — também não listado na sequência original, mas necessário).
7. **Dentro da tx** — consumir estoque físico (um nível, por `lines`): decrementar `stockQty` do item
   consumido + `StockMovement OUT`, por linha.
8. **Dentro da tx** — reconciliar reservas (por `releaseTargets`, multinível): para cada material/
   produto-folha agregado, decrementar `reservedQty` (com clamp) + `StockMovement RELEASE` + atualizar
   `quantityNeeded`/`quantityReserved`/`quantityShortfall`/`status` da `MaterialReservation`.
9. **Dentro da tx** — registrar entrada do produto acabado (se `order.productId`): incrementar
   `stockQty` + `StockMovement IN`.
10. **Dentro da tx** — atualizar `ProductionOrder`: `quantityCompleted += quantityThisRound`; `status
    = 'completed'` se atingiu `quantity`.
11. **Dentro da tx** — registrar `ProductionOrderExecution` (se `clientRequestId` fornecido).
12. **Commit** (implícito, fim do callback do `$transaction`).
13. **Service, após o commit** — publicar evento de domínio (`producao.parcial_realizada` ou
    `ordem_producao.finalizada`).

**Diferença em relação à sequência proposta**: `StockMovement` não é um passo único e separado — é
criado inline, três vezes, com tipos diferentes (`OUT` no passo 7, `RELEASE` no passo 8, `IN` no passo
9), cada um junto da ação de estoque que ele documenta, nunca como um lote separado no final. Os passos
5 e 6 (idempotência e releitura fresca) não apareciam na sequência proposta mas já existem desde o
ADR-011 e precisam continuar vindo antes de qualquer consumo/reconciliação — incluídos aqui para que a
documentação reflita o fluxo real, não uma versão simplificada dele.

### 2. Atomicidade — confirmada

Consumo físico (passo 7), reconciliação de reserva (passo 8), atualização da `ProductionOrder` (passo
10), todos os `StockMovement` (passos 7/8/9) e o registro de `ProductionOrderExecution` (passo 11)
pertencem à MESMA chamada de `db.$transaction()` em `produceWithTx()` — nenhuma dessas escritas ocorre
fora dela. `resolveConsumptionLines()` e `resolveReleaseTargets()` (passos 2/3) ficam DELIBERADAMENTE
fora da transação porque são puramente computacionais (nenhuma escrita) — não há nada ali que precise
de atomicidade com o resto.

### 3. Falhas — cada ponto analisado

Todos os pontos abaixo estão dentro do callback de `db.$transaction()` — uma exceção lançada em
QUALQUER um deles propaga para fora do callback, e o Prisma emite `ROLLBACK` automaticamente antes de
repassar o erro ao chamador (nenhum `try/catch` interno absorve ou mascara isso em `produceWithTx()`):

- **Consumo** (passo 7): `tx.material.update`/`tx.product.update` decrementando `stockQty` pode
  falhar (registro removido concorrentemente, violação de tipo) — propaga, rollback.
- **Reconciliação** (passo 8): `tx.materialReservation.findFirst`/`update` e os updates de
  `reservedQty` — mesma garantia; se qualquer uma dessas operações falhar no meio do laço de
  `releaseEntries`, os itens JÁ processados nas iterações anteriores DESTA mesma chamada são
  revertidos junto (rollback é da transação inteira, não por item).
- **Atualização da reserva** (dentro do passo 8): a chamada `tx.materialReservation.update` é a
  última escrita de cada iteração do laço — uma falha aqui desfaz também o decremento de
  `reservedQty`/`StockMovement RELEASE` que a precedeu na MESMA iteração (mesma transação).
- **Movimentação** (`StockMovement.create`, passos 7/8/9): qualquer falha de escrita aqui reverte
  tudo que já rodou nesta chamada de `produceWithTx()`, incluindo o consumo físico já aplicado.
- **Gravação da execução** (passo 11, `ProductionOrderExecution.create`): se isso falhar (ex.:
  violação do `@@unique([productionOrderId, clientRequestId])` numa corrida genuína entre duas
  chamadas concorrentes com o MESMO token), TODA a transação é revertida — consumo, reconciliação e
  atualização da OP incluídos. Esse é exatamente o comportamento desejado: ou a rodada inteira é
  aplicada, ou nenhuma parte dela é.

Confirmado: não existe nenhum ponto de escrita fora da transação única, logo não existe nenhum ponto
onde uma falha parcial poderia deixar consumo aplicado sem reconciliação, ou reconciliação aplicada sem
atualização da OP.

### 4. Quantidades negativas — revisão completa

- **`reservedQty`/`quantityReserved` (agregado e por reserva)**: nunca negativo. `releaseQty =
  Math.min(consumedQty, reservation.quantityReserved)` limita o decremento ao que a PRÓPRIA linha de
  reserva ainda tem; `newQuantityReserved = Math.max(0, reservation.quantityReserved - releaseQty)`
  garante o piso em zero na própria linha. O agregado (`Material.reservedQty`/`Product.reservedQty`)
  nunca é decrementado por mais do que uma reserva específica já tinha — e os únicos 3 pontos do
  código que escrevem `reservedQty` (criação da reserva, esta reconciliação, cancelamento) sempre
  andam em par com a atualização da `MaterialReservation` correspondente, preservando o invariante
  "soma de `quantityReserved` de todas as reservas de um item ≤ `reservedQty` agregado do item".
- **`quantityShortfall`**: `Math.max(0, newQuantityNeeded - newQuantityReserved)` — sempre não-negativo,
  inalterado desde a Subetapa 1.
- **`stockQty`**: **achado confirmado, PRÉ-EXISTENTE, não introduzido por esta correção** — o consumo
  físico (`tx.material.update({ data: { stockQty: { decrement: consumedQty } } })`) não tem nenhuma
  validação de saldo suficiente antes de decrementar; se a OP for produzida além do que o estoque
  físico realmente tem, `stockQty` PODE ficar negativo. Esse comportamento já existia desde antes da
  Fase 9 (o antigo `completeAndConsumeStock()` também decrementava sem checar suficiência) e está fora
  do escopo desta ADR, que trata exclusivamente da reconciliação de RESERVA, não de uma nova regra de
  bloqueio por insuficiência de estoque físico — registrado aqui porque foi explicitamente pedido
  verificar, não porque esta rodada o introduziu ou o agravou.
- Testado explicitamente (produções parciais sucessivas somando exatamente a quantidade total, sem
  sobra nem falta) — ver testes 2, 3, 6 da seção 6, todos passando.

### 5. Compatibilidade — confirmada

Toda a suíte pré-existente (105 testes de Fases 1-9, mais os 9 testes isolados da Subetapa 1) continua
passando sem nenhuma alteração de asserção — **120/120 testes no total**. Para uma OP sem subconjuntos
(estrutura de um nível só, o caso de `production-order-partial.test.ts`), `resolveReleaseTargets()`
devolve exatamente o mesmo mapa que o código anterior já produzia diretamente das `lines` — nenhum
`component` com revisão própria para reexplodir, então o resultado é idêntico por construção, não por
coincidência de teste.

### 6. Performance — confirmado, cálculo único por rodada

`resolveReleaseTargets()` é chamado exatamente UMA vez por chamada de `produce()` (Service, antes de
abrir a transação) — `produceWithTx()` nunca recalcula, só aplica o `releaseTargets` recebido como
parâmetro. Uma chamada RETRIED com o mesmo `clientRequestId` é uma invocação SEPARADA de `produce()`
(coberto pela idempotência do ponto 4 da rodada de validação anterior), não uma repetição dentro do
mesmo fluxo.

### 7. Fechamento — revisão completa do domínio Produção + Reserva

Revisão feita cobrindo Engenharia (BOM) → Reserva → Produção → Estoque → MRP. **Uma inconsistência real
foi encontrada — não introduzida por esta correção, mas com superfície de exposição maior por causa
dela.** Reportada abaixo antes de declarar a Fase 9 consolidada, conforme instrução.

**Achado**: `MaterialReservationRepository.releaseMany()` (cancelamento de OP) busca reservas com
`status: { not: 'released' }` — isso INCLUI reservas com `status: 'consumed'`. `releaseItemWithTx()`
correta e seguramente não decrementa nada quando `quantityReserved` já é 0 (guarda `if
(reservation.quantityReserved > 0)`), mas SEMPRE sobrescreve o `status` para `'released'` no final,
incondicionalmente — inclusive para uma reserva que já estava `'consumed'` (ou seja, já tinha sido
integralmente GASTA em produção, não tinha nada a devolver). Consequência: se uma OP é parcialmente
produzida (algumas reservas já chegam a `'consumed'`) e depois é CANCELADA (por outro motivo — outro
material em falta, decisão de negócio, etc.), as reservas que já estavam `'consumed'` são relabeled
para `'released'`, misturando historicamente "material gasto de fato na produção" com "material
liberado por cancelamento, nunca usado" sob o mesmo status.

Antes da Subetapa 2, essa combinação (reserva multinível, indireta, alcançando `'consumed'`) era
literalmente inatingível — a Reserva nunca criava linha para o subconjunto, e o Consumo nunca alcançava
a matéria-prima interna, então essas reservas nunca avançavam além de `'reserved'`/`'partial'`,
permanecendo assim para sempre (esse era exatamente o bug original que este ADR corrige). Com a
reconciliação agora atingindo esses níveis, MUITO mais reservas passam a alcançar `'consumed'` durante
produções parciais — aumentando a probabilidade real de um cancelamento subsequente reescrever esse
status. Não é uma inconsistência de quantidade (`reservedQty`/`stockQty` continuam corretos, o `if
(quantityReserved > 0)` já impede qualquer decremento indevido) — é uma inconsistência de **rótulo
histórico**, relevante para qualquer relatório/KPI futuro (Fase 10/11) que precise distinguir "consumido
em produção" de "liberado sem uso".

**Não corrigido nesta rodada** — aguardando decisão explícita do usuário sobre a linha a seguir:
(a) `releaseMany()` passar a excluir também `status: 'consumed'` do filtro (reservas já consumidas
simplesmente não são tocadas no cancelamento, permanecendo `'consumed'` para sempre, mesmo com a OP
cancelada); (b) manter como está, registrado como característica conhecida; (c) alguma outra
reconciliação de status a definir. Nenhuma alteração de código feita para este achado — é apresentado
aqui exatamente como encontrado, para decisão antes de declarar a Fase 9 definitivamente fechada.

## Subetapa 2 — Implementação (2026-07-10)

**Concluída e verificada, exceto pela decisão pendente do achado do ponto 7 acima.**

- `src/app/services/production-order.service.ts`: `produce()` passa a calcular `releaseTargets` (via
  `reservationReconciliationService.resolveReleaseTargets(lines, quantityThisRound)`) logo após
  `resolveConsumptionLines()`, ambos fora da transação, e repassa os dois para `produceWithTx()`.
- `src/app/repositories/production-order.repository.ts`: `produceWithTx()` ganhou o parâmetro
  `releaseTargets: BomExplosionResult`; o laço único anterior foi separado em dois — consumo físico
  (por `lines`, inalterado) e reconciliação de reserva (por `releaseTargets`, agregado, qualquer
  profundidade).
- Nenhuma alteração de schema.

**Testes**: 6 novos (`tests/production-order-reconciliation.test.ts`), cobrindo os cenários 2, 3, 4, 6,
11, 15 da seção 6 com `ProductionOrder`/`produce()` reais (não isolados como na Subetapa 1). **120/120
testes passando no total do projeto** (114 anteriores + 6 novos). `tsc --noEmit` confirma o mesmo erro
de ambiente pré-existente, não relacionado.

## Decisões validadas com o usuário (resumo)

| Ponto | Decisão |
|---|---|
| Reabrir ADR-006 (Reserva de um nível só)? | **Não** — Reserva multinível preservada integralmente |
| Tratar como débito técnico? | **Não** — corrigir agora, afeta consistência entre Reserva/Produção/Dashboard/Financeiro |
| Onde corrigir | Só na reconciliação durante a produção — nem Reserva, nem Consumo físico mudam |
| Serviço novo | `ReservationReconciliationService`, responsabilidade única: dado o consumo de uma rodada, resolver as reservas-alvo em qualquer profundidade |
| Reuso de algoritmo | `bomExplosionService.explode()` reaproveitado a partir do componente consumido; MRP confirmado não reutilizável (pergunta/formato incompatíveis) |
| Fonte única de verdade | Confirmada — chamada direta ao mesmo `bomExplosionService`, sem cópia/tradução; mudanças futuras na explosão propagam para os dois usos automaticamente |
| Ponto de cálculo | Movido para `ProductionOrderService.produce()` (Service, sem transação), ao lado de `resolveConsumptionLines()` — `ReservationReconciliationService` nunca vê `tx` |
| Ponto de aplicação | Inalterado — dentro de `produceWithTx()`, recebendo `releaseTargets` já calculado como parâmetro |
| Escalabilidade | `O(D + Σ S_i)` por rodada; custo se repete a cada rodada parcial (não cacheado) — cache futuro registrado como extensão, não implementado agora |
| Idempotência | Protegida pelo mecanismo já existente (`ProductionOrderExecution`/`clientRequestId`), aplicado à APLICAÇÃO do resultado, não ao cálculo — nenhuma proteção nova necessária |
| Eventos | Nenhum evento novo — reconciliação mantida interna, sem consumidor concreto identificado |
| Observabilidade | `reason` distinta em `StockMovement RELEASE` (imediato); `ProductionOrderExecution` como ponto de extensão futuro para auditoria estruturada — `AuditLog` não é o lugar certo (convenção já estabelecida) |
| Schema | Nenhuma alteração nesta rodada |
| Estado terminal | `consumed` é TERMINAL em `MaterialReservation` (decisão do usuário, 2026-07-10) — `reserved→consumed` e `reserved→released` permitidos; `consumed→released` e `released→consumed` proibidos |
| Implementação | **Concluída (124/124 testes) — Fase 9 declarada arquiteturalmente consolidada** |

## Subetapa 1 — Implementação (2026-07-10)

**Concluída e verificada.** `src/app/services/reservation-reconciliation.service.ts` criado exatamente
conforme a seção 3.1, sem nenhuma alteração de schema, sem tocar `produceWithTx()`/`produce()` ainda
(essa integração é a Subetapa 2). O serviço não abre transação, não escreve no banco — chama
diretamente `bomRevisionRepository.findActiveByProduct()` (leitura) e `bomExplosionService.explode()`
(o mesmo motor já usado pela Reserva), confirmando na prática a "fonte única de verdade" validada.

**Testes**: `tests/reservation-reconciliation.test.ts` (9 testes, cobrindo os cenários 1, 5, 7, 8, 9, 10,
13, 14, 16 da seção 6, reinterpretados para rodar isoladamente contra o serviço novo, sem
`ProductionOrder` real envolvida — os testes 14 e 16, sobre revisões múltiplas/ativas, simulam
diretamente as linhas de consumo que um chamador real (`resolveConsumptionLines`) já resolveria a partir
da revisão congelada de cada OP, já que este serviço não resolve a raiz sozinho, só processa o que
recebe). **114/114 testes passando no total do projeto** (105 anteriores + 9 novos). `tsc --noEmit`
confirma o mesmo erro de ambiente pré-existente, não relacionado a este trabalho.

Subetapa 2 (integração em `ProductionOrderService.produce()` e `produceWithTx()`) concluída — ver seções
"Validação final antes da Subetapa 2" e "Subetapa 2 — Implementação" acima.

## Correção do achado — `consumed` como estado terminal (2026-07-10)

**Decisão do usuário**: `consumed` passa a ser um estado TERMINAL de `MaterialReservation`. Transições
permitidas: `reserved → consumed`; `reserved → released`. Transições proibidas: `consumed → released`;
`released → consumed`. Uma reserva efetivamente consumida em produção nunca mais é reclassificada como
"liberada", mesmo que a OP seja cancelada depois — o significado histórico de cada estado é preservado.

### Validação antes de implementar

**1. Nenhuma quantidade depende da mudança de status — confirmado.** `releaseItemWithTx()` já não
decrementa nada quando `reservation.quantityReserved` é 0 (guarda `if (quantityReserved > 0)`) — uma
reserva `consumed` sempre tem `quantityReserved = 0` (é exatamente a condição que a levou a esse
status), então pular essas linhas inteiramente na consulta de `releaseMany()` não muda nenhum valor de
`reservedQty`/`quantityReserved`/`quantityShortfall` que já seria alterado — a única mudança de
comportamento é o campo `status` deixar de ser sobrescrito. Alteração puramente semântica/histórica,
confirmado por leitura do código, não apenas por teste.

**2. Varredura do projeto por `status != 'released'` (ou equivalente) — concluída.** Único ponto
encontrado: `MaterialReservationRepository.releaseMany()` (linha da própria correção). Nenhuma rota de
API, nenhum outro Service, nenhum outro Repository consulta `MaterialReservation.status` dessa forma —
confirmado que nenhum outro fluxo passaria a tratar reservas `consumed` como "ativas" por engano.

**Achado adicional, fora do escopo estritamente pedido, registrado por transparência (não corrigido)**:
`MaterialReservationRepository.reserveItemWithTx()` (o método de CRIAÇÃO/complemento de reserva,
chamado apenas por `reserveForProductionOrder()`) não tem nenhuma guarda contra rebaixar uma reserva já
`consumed` de volta para `'reserved'`/`'partial'` caso fosse chamado de novo para a mesma OP depois de
alguma produção já ter ocorrido. Hoje isso é **inatingível na prática** — `reserveForProductionOrder()`
só é invocado em `create()`/`createFromApprovedQuote()`, nunca novamente depois (confirmado por busca:
únicos 2 chamadores no projeto, ambos na criação da OP). Não alterado nesta rodada — corrigir um caminho
que nenhum código hoje exercita seria validação para um cenário que não pode acontecer, contra a
diretriz do projeto. Registrado aqui para o caso de uma fase futura (reprocessamento automático de
reserva ao chegar estoque novo, por exemplo) reabrir esse método para chamadas repetidas — nesse
momento, a mesma guarda de estado terminal precisaria ser adicionada ali também.

### Correção implementada

`src/app/repositories/material-reservation.repository.ts` — `releaseMany()`: filtro alterado de
`status: { not: 'released' }` para `status: { notIn: ['released', 'consumed'] }`. Nenhuma outra
linha alterada; `releaseItemWithTx()` permanece exatamente como estava (a guarda `quantityReserved > 0`
já era suficiente para a segurança de quantidade, só a consulta que alimentava o laço precisava mudar).

### Testes

`tests/material-reservation-cancellation.test.ts` (4 novos testes): cancelamento de OP parcialmente
produzida (reserva ainda `partial` é liberada normalmente — regressão); cancelamento não altera reserva
já `consumed` (produção total do item, incluindo confirmação de que a própria máquina de estados da OP
já bloqueia cancelar uma OP `completed` — dupla proteção, camadas independentes); cancelamento sem
nenhuma produção (reserva `reserved` liberada integralmente); histórico misto (uma reserva `consumed` E
uma `partial` na MESMA OP — o cancelamento preserva a primeira e libera só a segunda).

**124/124 testes passando no total do projeto** (120 anteriores + 4 novos). `tsc --noEmit` confirma o
mesmo erro de ambiente pré-existente, não relacionado a este trabalho.

### Revisão final de consistência — Engenharia → Reserva → Produção → Estoque → MRP

Com a correção acima aplicada, revisão final do domínio completo, camada por camada:

- **Engenharia (BOM)**: revisões imutáveis uma vez liberadas; nenhuma alteração nesta ADR. Sem
  inconsistência conhecida.
- **Reserva**: multinível, preservada integralmente (decisão do usuário, não reaberta). `consumed` agora
  formalmente terminal — nenhum outro Service/Repository escreve ou lê `MaterialReservation.status` de
  forma que dependa do comportamento antigo. Sem inconsistência conhecida.
- **Produção**: consumo físico de um nível (inalterado); reconciliação de reserva multinível (esta ADR),
  puramente computacional, calculada uma vez por rodada, aplicada atomicamente. `quantityCompleted`/
  `status` da OP seguem exatos desde o ADR-011. Sem inconsistência conhecida.
- **Estoque**: `stockQty`/`reservedQty` corretos em todos os cenários testados (parcial, total, múltiplas
  OPs, cancelamento em qualquer ponto). Achado pré-existente registrado (`stockQty` sem checagem de
  suficiência física) permanece FORA do escopo desta ADR — não é uma inconsistência entre os módulos
  cobertos por este documento, é uma característica de todo o sistema desde antes da Fase 9, tratada como
  tal e não como pendência desta ADR.
- **MRP**: independente por design (não lê `MaterialReservation`); beneficiado indiretamente pela
  correção do ADR-012 (base, Subetapa 2) — `reservedQty` deixou de ficar inflado para materiais usados
  via subconjunto, tornando `freeStock` do MRP mais preciso. Sem inconsistência conhecida.

**Nenhuma nova inconsistência encontrada nesta revisão final.** A Fase 9 (Produção Parcial, ADR-011) e
sua correção de reconciliação multinível (ADR-012) são consideradas **arquiteturalmente consolidadas**.
