# ADR-002 — Máquina de Estados (Fase 2)

- **Status**: Implementado e verificado (Orçamento, Pedido de Venda, Ordem de Produção) — Fase 2 concluída
- **Data**: 2026-07-09
- **Depende de**: [ADR-001 — Princípios Arquiteturais](./ADR-001-principios-arquiteturais.md), princípio 7
  ("Toda alteração de status passa pela Máquina de Estados")

## Contexto

A Fase 1 centralizou toda a lógica de negócio em Services, mas as alterações de status ficaram em três
níveis de maturidade diferentes:

1. **Requisição e Pedido de Compra** já usam `checkTransition()` (`src/lib/status-machine.ts`) com um mapa
   `ALLOWED_TRANSITIONS` próprio — construído antes da Fase 1, preservado sem alteração durante ela.
2. **Orçamento e Pedido de Venda** só validam que o valor de destino pertence a uma lista fixa
   (`VALID_STATUSES.includes(status)`) — qualquer status pode ir para qualquer outro.
3. **Ordem de Produção** não valida nada: a rota aceita `body.status` como string livre, sem checar
   sequer contra um enum.

A Fase 2 existe para levar os itens 2 e 3 ao mesmo padrão do item 1, sem inventar um motor novo — o
motor (`checkTransition()`) já existe e já está em produção nos dois módulos mais críticos do fluxo de
Compras. Esta fase é sobre **generalizar um padrão que já funciona**, não sobre desenhar um do zero.

## Levantamento — estados atuais por domínio

| Domínio | Campo `status` (schema) | Valores documentados | Validação hoje | Transições restritas hoje? |
|---|---|---|---|---|
| Orçamento (`Quote`) | `status String @default("draft")` | draft, sent, approved, rejected, cancelled, expired | `VALID_STATUSES.includes()` em `QuoteService.changeStatus` | **Não** — qualquer→qualquer |
| Pedido de Venda (`SalesOrder`) | `status String @default("open")` | open, in_production, completed, cancelled | `VALID_STATUSES.includes()` em `SalesOrderService.changeStatus` | **Não** — qualquer→qualquer |
| Ordem de Produção (`ProductionOrder`) | `status String @default("planned")` | planned, in_progress, paused, completed, cancelled | Nenhuma — `body.status \|\| target.status`, aceita qualquer string | **Não** — sem validação nenhuma |
| Requisição (`Requisition`) | `status String @default("draft")` | draft, sent, approved, ordered, cancelled | `checkTransition()` em `RequisitionService.changeStatus` | **Sim** |
| Pedido de Compra (`PurchaseOrder`) | `status String @default("draft")` | draft, sent, confirmed, partially_received, received, cancelled | `checkTransition()` em `PurchaseOrderService.changeStatus`/`.receive` | **Sim** |
| Estoque | *(nenhum campo de status)* | — | — | Não se aplica |

### Nota sobre Estoque

Estoque não é um documento com ciclo de vida — é saldo (`Material.stockQty`/`Product.stockQty`) mais um
livro-razão de lançamentos (`StockMovement`, com `type` = IN/OUT/ADJUST/RESERVE/RELEASE, sendo os dois
últimos reservados para a Reserva de Estoque de uma fase futura do roadmap, ainda não implementada).
`type` classifica o lançamento, não representa um estado que transiciona — um `StockMovement` nunca "muda
de status" depois de criado. Forçar uma Máquina de Estados aqui inventaria um conceito que não existe no
domínio. **Decisão**: Estoque fica fora do escopo de FSM da Fase 2. Quando a Reserva de Estoque
(fase futura do roadmap) for implementada, ela pode introduzir seu próprio ciclo de vida (reservado →
consumido → liberado) — matéria para uma revisão própria deste ADR quando chegar a hora, não antecipada
aqui.

## Efeitos colaterais já acoplados a transições específicas (preservar exatamente)

Estes já existem hoje e não são alterados nesta fase — só documentados aqui porque a Máquina de Estados
precisa continuar disparando-os exatamente como estão:

- **Orçamento → `approved`** (só na transição, não em re-afirmações): grava `approvedBy`/`approvedAt`;
  dispara `ProductionOrderService.createFromApprovedQuote()` para cada item com produto vinculado.
- **Orçamento → `sent`**: grava `sentAt`.
- **Requisição → `ordered`** (só na transição): todos os itens precisam ter cotação vencedora selecionada
  (`supplierId` preenchido); dispara `PurchaseOrderService.createFromRequisition()`.
- **Pedido de Compra → `sent`/`confirmed`/`cancelled`**: grava `sentAt`/`confirmedAt`/`cancelledAt`.
- **Pedido de Compra → `partially_received`/`received`**: só alcançável via `/receive` (recebimento por
  item), nunca via PATCH de status direto — `changeStatus` rejeita esses dois valores explicitamente.
- **Ordem de Produção → `completed`** (só na transição): dispara baixa de matéria-prima + entrada de
  produto acabado em `db.$transaction` (`completeAndConsumeStock`).

## Decisões arquiteturais

1. **Um único motor, já existente.** `checkTransition()` (`src/lib/status-machine.ts`) continua sendo a
   única implementação de validação de transição do sistema. A Fase 2 não cria uma segunda forma de
   validar — generaliza o uso da que já existe para os domínios que ainda não a usam.
2. **Enums centralizados por domínio, não um registro global.** Cada domínio já declara (ou vai declarar)
   seu `VALID_STATUSES`/`ALLOWED_TRANSITIONS` como `const` no topo do próprio Service — exatamente como
   `RequisitionService` e `PurchaseOrderService` já fazem. Decisão consciente: **não** criar um módulo
   central tipo `src/lib/domain-status.ts` com os status de todos os domínios juntos. Motivo: os estados
   de cada domínio são vocabulário daquele domínio (Documento Único, Responsabilidade Única — ADR-001
   princípio 4); um registro global viraria um ponto de acoplamento entre módulos que hoje não têm
   nenhuma razão para se conhecer. O motor (`checkTransition`) é compartilhado; o vocabulário não precisa
   ser.
3. **Nenhuma regra comercial nova sem validação explícita.** Orçamento, Pedido de Venda e Ordem de
   Produção não têm hoje nenhuma restrição de transição — isso é comportamento real em produção. Propor
   um `ALLOWED_TRANSITIONS` para eles é uma decisão de negócio (o que pode ir para onde), não uma
   refatoração estrutural. Cada mapa proposto abaixo é isso: uma proposta, aguardando confirmação antes
   de virar código. Nenhum será implementado sem validação explícita, módulo por módulo.
4. **Sem tabela `StatusHistory` nesta fase.** O ADR-001 (princípio 8) já prevê auditoria de toda
   transição — e isso já acontece hoje via `AuditService.log()` em todo `changeStatus`, registrando
   "alterado de X para Y" com usuário e timestamp. Uma tabela `StatusHistory` dedicada (estruturada,
   navegável por transição, não por texto livre de auditoria) é matéria referenciada no roadmap V4 mas
   não é um objetivo declarado desta Fase 2 — fica marcada aqui como candidata a uma fase futura, não
   implementada agora, para não expandir o escopo combinado.
5. **Sem Eventos de Domínio ainda (por instrução explícita da Fase 2).** As transições continuam
   disparando efeitos colaterais via chamada direta de Service (ex: `QuoteService.changeStatus` chama
   `productionOrderService.createFromApprovedQuote`). Isso já está isolado num único método por domínio
   desde a Fase 1 exatamente para essa troca ser possível na Fase 3 sem reabrir rota nenhuma. A Fase 2
   não antecipa essa troca — só garante que continua sendo trivial fazê-la depois.

## Transições — confirmadas (sem mudança, já em produção)

### Requisição
```
draft     → sent, cancelled
sent      → approved, cancelled, draft
approved  → ordered, cancelled
ordered   → cancelled
cancelled → (terminal)
```

### Pedido de Compra
```
draft               → sent, cancelled
sent                → confirmed, cancelled
confirmed           → cancelled                    (+ partially_received/received via /receive)
partially_received  → cancelled                    (+ received via /receive)
received            → (terminal)
cancelled           → (terminal)
```

## Transições — propostas para validação (ainda não implementadas)

### Orçamento — **confirmado** (validado com o usuário em 2026-07-09)

```
draft     → sent, cancelled
sent      → approved, rejected, cancelled, draft
approved  → cancelled                          (bloqueado se já existe Pedido de Venda vinculado)
rejected  → sent, cancelled
expired   → sent, cancelled
cancelled → (terminal)
```

Confirmado: `rejected`/`expired` são reversíveis para `sent` (renegociar/reenviar). `approved → cancelled`
é permitido pela máquina de transições, mas bloqueado por uma validação adicional no Service quando o
orçamento já foi convertido em Pedido de Venda (`quote.salesOrder` existente) — evita deixar o Pedido de
Venda órfão de um orçamento cancelado. Essa checagem é lógica de negócio do Service, não faz parte do
mapa de transições em si.

### Pedido de Venda — levantamento detalhado (Subetapa 2)

**Estados hoje**: `open`, `in_production`, `completed`, `cancelled` (schema `SalesOrder.status`, sem
`ALLOWED_TRANSITIONS` — mesmo padrão solto do Orçamento antes da Subetapa 1).

**Como o SalesOrder nasce**: sempre via `QuoteService.convertToSalesOrder()` → `SalesOrderService
.createFromQuote()`, com `status: 'open'` fixo. Não existe hoje um estado "aprovado" distinto do
"criado" — a aprovação já aconteceu no Orçamento (`Quote.status === 'approved'` é pré-condição da própria
conversão); o Pedido de Venda só existe depois que essa aprovação já ocorreu. Por isso `open` já
representa, na prática, "pedido formalizado e aceito" — equivalente ao que seria um estado "aprovado"
separado.

**Vínculo com Ordem de Produção**: `SalesOrder.productionOrders` (relação via `ProductionOrder
.salesOrderId`) é populado **manualmente** — hoje não existe nenhum código que linke automaticamente as
OPs geradas na aprovação do Orçamento ao Pedido de Venda criado depois na conversão. O vínculo só existe
quando alguém cria uma OP em `POST /api/production-orders` e escolhe um `salesOrderId` no formulário (o
frontend tem esse campo, `page.tsx:2782`). Isso significa que `salesOrder.productionOrders` pode estar
vazio mesmo para um Pedido de Venda com produção em andamento (se as OPs nunca foram explicitamente
vinculadas) — uma limitação real do sistema hoje, não introduzida por esta fase.

**"Enviado para produção" não tem gatilho automático hoje**: `in_production` é hoje um valor que só é
alcançado via PATCH manual de status (o mesmo Select genérico usado para todos os 4 valores,
`page.tsx:2169`) — nada no sistema hoje verifica se existe alguma OP vinculada antes de permitir essa
transição.

**Mapa — confirmado (validado com o usuário em 2026-07-09)**:
```
open           → in_production, cancelled
in_production  → completed, cancelled
completed      → (terminal)
cancelled      → (terminal)
```

**Decisões validadas**:
1. **Sem estado novo.** Mantidos os 4 estados atuais — `open` já cumpre o papel de "aceito/aprovado"
   (a aprovação real acontece no Orçamento, antes do Pedido de Venda existir). Nenhuma mudança de schema.
2. **Cancelamento bloqueado se houver OP vinculada ativa.** `* → cancelled` é rejeitado quando existir
   `ProductionOrder` com `salesOrderId` apontando para este pedido e `status` fora de
   `['completed', 'cancelled']` — usuário precisa cancelar ou concluir a(s) OP(s) antes. Mesmo padrão de
   guarda cruzada usado no Orçamento (bloqueio de `approved → cancelled` com Pedido de Venda vinculado).
3. **`in_production` sem OP vinculada continua permitido.** Não vira pré-condição nesta fase — o vínculo
   OP↔Pedido de Venda já é manual e incompleto por design atual (nem toda OP gerada na aprovação do
   Orçamento é vinculada); exigir isso aqui adicionaria uma trava nova sobre uma integração que já é
   frouxa hoje, fora do escopo de "mapear e formalizar o que já existe".

### Ordem de Produção — levantamento detalhado (Subetapa 3)

**Estados hoje**: `planned`, `in_progress`, `paused`, `completed`, `cancelled` (schema `ProductionOrder
.status`). **Nenhuma validação existe hoje** — nem contra o enum, nem contra transição: `PUT
/api/production-orders/[id]` aceita `body.status` como string livre (`newStatus = body.status ||
target.status`), sem checar se é um valor conhecido. Este é o módulo menos protegido dos 6.

**Como a OP nasce** (dois caminhos, ambos preservados sem alteração nesta fase):
1. Automático: `QuoteService.changeStatus('approved')` → `ProductionOrderService
   .createFromApprovedQuote()` — sempre cria com `status: 'planned'`.
2. Manual: `POST /api/production-orders` — `body.status || 'planned'`. Hoje é possível criar uma OP já
   com `status: 'completed'` diretamente no `POST`, o que **pula toda a lógica de baixa de estoque**
   (`isCompletingNow` só existe em `update()`, nunca em `create()`) — uma característica pré-existente,
   não introduzida por esta fase, e que a Máquina de Estados não cobre porque `create()` não é uma
   transição (não existe estado anterior). Fica catalogado como comportamento pré-existente, não como
   bug desta fase.

**Único ponto de mudança de status hoje**: `PUT /api/production-orders/[id]` — a MESMA rota que edita
todos os outros campos (produto, quantidade, prioridade, datas, notas). Não existe uma rota `/status`
dedicada como nos outros 4 domínios. Isso importa muito para o desenho da máquina: o formulário de edição
sempre envia o `status` atual junto (mesmo quando a intenção é só editar outro campo) — se
`checkTransition` for aplicado incondicionalmente, **toda edição de campo sem trocar o status vira uma
"auto-transição" e é rejeitada**, quebrando a edição normal de uma OP em qualquer estado (inclusive
`in_progress`, o mais comum de precisar editar notas/quantidade em andamento).

**Impacto em estoque e materiais (o ponto mais sensível)**: a transição para `completed` (dentro de
`update()`, guardada por `isCompletingNow = newStatus === 'completed' && target.status !== 'completed'`)
dispara `ProductionOrderRepository.completeAndConsumeStock()` — já rodando em `db.$transaction` desde a
Fase 1 — que: (1) baixa cada matéria-prima da receita (`ProductMaterial`) proporcional à quantidade da OP
+ perda (`scrapPct`), criando `StockMovement` tipo `OUT`; (2) dá entrada do produto acabado, criando
`StockMovement` tipo `IN`. Isso só é dependente de `target.status !== 'completed'` — a transição de
ORIGEM (de `planned` ou de `in_progress`) não importa hoje, ambas disparam a mesma baixa. Nenhuma reserva
de estoque existe ainda (`RESERVE`/`RELEASE` no schema são só placeholders de uma fase futura do
roadmap) — então cancelar uma OP antes de `completed` não tem nenhum efeito de estoque a desfazer hoje.

**Vínculo com Requisição**: `Requisition.productionOrderId` é só uma referência de origem (rastreabilidade
— de onde a necessidade de compra veio), sem nenhuma trava hoje. Cancelar/completar uma OP não bloqueia
nem é bloqueado por Requisições vinculadas. Diferente de Orçamento/Pedido de Venda, **não há necessidade
de uma guarda cruzada aqui** — não existe hoje nenhum documento que "dependa" do status da OP a ponto de
ficar órfão se ela mudar de estado.

**Mapa — confirmado (validado com o usuário em 2026-07-09)**:
```
planned      → in_progress, completed, cancelled
in_progress  → paused, completed, cancelled
paused       → in_progress, cancelled
completed    → (terminal)
cancelled    → (terminal)
```
`planned → completed` direto confirmado como permitido (preserva o fluxo atual — nada força passar por
`in_progress`). `completed`/`cancelled` seguem terminais, sem reversão de estoque (estornar a baixa de
uma OP já concluída seria uma regra nova, fora do escopo desta fase).

**Decisão estrutural (não é regra comercial, é sobre como o `PUT` único convive com a FSM)**:
`ProductionOrderService.update()` só chama `checkTransition()` quando o `status` de destino é
**diferente** do status atual (`body.status !== undefined && body.status !== target.status`). Quando o
status não muda (edição normal de campo, ou `PUT` sem `status` no body), a atualização segue exatamente
como hoje, sem passar pela máquina — porque não é uma transição. Isso preserva 100% do fluxo de edição
atual e evita que a Fase 2 quebre a única rota de update que existe para este domínio.


## Plano de implementação (subetapas verificadas) — concluído

1. ✅ **Orçamento** — `ALLOWED_TRANSITIONS` + `checkTransition()` em `QuoteService.changeStatus`.
2. ✅ **Pedido de Venda** — idem em `SalesOrderService.changeStatus`, com guarda cruzada de OP vinculada.
3. ✅ **Ordem de Produção** — idem em `ProductionOrderService.update()`, com o ajuste estrutural de só
   validar transição quando o status realmente muda (rota única PUT/status).
4. ✅ Revisão de fim de fase — ver seção abaixo.

## Revisão de Fim de Fase — Fase 2 (2026-07-09)

- **Requisição e Pedido de Compra**: já usavam `checkTransition()` antes da Fase 2 — confirmados como
  referência, nenhuma mudança necessária.
- **Orçamento, Pedido de Venda, Ordem de Produção**: migrados de validação solta (`VALID_STATUSES
  .includes()` ou nenhuma validação) para `ALLOWED_TRANSITIONS` + `checkTransition()` — mesmo motor,
  zero motores novos criados.
- **Estoque**: confirmado fora do escopo (não é documento com ciclo de vida) — decisão registrada, não
  revisitada.
- **Nenhuma regra de negócio nova foi implementada sem validação explícita** — todo mapa de transição e
  toda guarda cruzada (Orçamento↔Pedido de Venda, Pedido de Venda↔Ordem de Produção) passou por
  `AskUserQuestion` antes de virar código.
- **Nenhuma regra de MRP, reserva de estoque ou planejamento foi criada** — a baixa de estoque na
  conclusão de OP continua exatamente como estava desde a Fase 1 (mesma transação, mesmo cálculo).
- **Nenhum acoplamento novo entre módulos** — todas as guardas cruzadas leem dados do próprio agregado
  (Quote lê seu `salesOrder`; SalesOrder lê suas `productionOrders`) via um método de Repository dedicado
  do próprio domínio, nunca client Repository de outro módulo.
- **Estrutura pronta para Eventos de Domínio (Fase 3)**: nenhum evento foi implementado, mas cada
  transição continua isolada num único método de Service (`changeStatus`/`update`), pronto para publicar
  um evento no lugar do efeito colateral direto sem precisar reabrir rota nenhuma.
- **Débito/observações catalogadas** (não corrigidas nesta fase, por decisão consciente):
  - `QuoteService.update()` (PUT geral) ainda permite setar `status` livremente via
    `ALLOWED_UPDATE_FIELDS`, sem passar por `checkTransition()` — um caminho paralelo ao `changeStatus()`
    dedicado que escapa da FSM. Pré-existente à Fase 2, não introduzido por ela; candidato a correção
    numa fase de hardening futura (fechar esse campo do `PUT` geral ou redirecioná-lo para
    `changeStatus()` internamente).
  - `ProductionOrderService.create()` (e o `POST` manual) continua aceitando qualquer string de `status`
    sem validar contra o enum — criar uma OP já com `status: 'completed'` pula a baixa de estoque (que só
    dispara em `update()`). Comportamento pré-existente, fora do escopo de "transições" (não há estado
    anterior numa criação); catalogado, não corrigido.
  - Vínculo `ProductionOrder.salesOrderId` continua manual e incompleto por design atual (não populado
    automaticamente quando a OP nasce da aprovação do Orçamento) — já catalogado na Subetapa 2.

**Conclusão**: Fase 2 atende aos 5 objetivos combinados (mapear, centralizar por domínio, definir
transições válidas, preparar terreno para eventos sem implementá-los, não alterar regra comercial sem
validação). Pronta para a Fase 3 (Eventos de Domínio) quando o usuário decidir avançar.

## Log de Decisões

| Data | Decisão | Subetapa |
|---|---|---|
| 2026-07-09 | Levantamento completo dos 6 domínios; Estoque excluído do escopo de FSM (não é documento com ciclo de vida); `checkTransition()` confirmado como único motor, reaproveitado sem mudanças | Levantamento |
| 2026-07-09 | Decisão de não centralizar enums num módulo único — cada domínio mantém seu próprio `VALID_STATUSES`/`ALLOWED_TRANSITIONS`, mesmo padrão já usado por Requisição/Pedido de Compra | Levantamento |
| 2026-07-09 | Decisão de não criar `StatusHistory` nesta fase — auditoria já coberta por `AuditService.log()`; tabela estruturada fica candidata a fase futura | Levantamento |
| 2026-07-09 | Mapa de transições do Orçamento validado com o usuário (ver `AskUserQuestion`): `approved → cancelled` bloqueado quando já existe Pedido de Venda vinculado; `rejected`/`expired` reversíveis para `sent`. Implementado em `QuoteService.changeStatus` com `ALLOWED_TRANSITIONS` + `checkTransition()`, substituindo o `VALID_STATUSES.includes()` solto que existia. Efeito colateral notado: `approved → approved` (auto-transição), antes silenciosamente permitida pelo `VALID_STATUSES`, agora é rejeitada com 400 — consequência esperada de introduzir transições reais, não um bug (nenhum fluxo do sistema hoje faz PATCH de status pro mesmo valor já vigente) | Orçamento |
| 2026-07-09 | Orçamento verificado ao vivo: transição inválida rejeitada (400), `sent⇄draft` e `rejected→sent` reversíveis, `approved` gera OP normalmente, `approved→cancelled` permitido sem Pedido de Venda e bloqueado com Pedido de Venda vinculado (400 com mensagem explicando o motivo). `tsc --noEmit` limpo (só o débito de `page.tsx` já catalogado no ADR-001). Graphify atualizado | Orçamento |
| 2026-07-09 | Mapa de transições do Pedido de Venda validado com o usuário (`AskUserQuestion`): sem estado novo (mantidos os 4 atuais); `* → cancelled` bloqueado quando existir Ordem de Produção vinculada com status ativo (fora de completed/cancelled); `in_production` continua sem exigir OP vinculada. Implementado em `SalesOrderService.changeStatus` com `ALLOWED_TRANSITIONS` + `checkTransition()`, substituindo o `VALID_STATUSES.includes()` solto. Novo método `SalesOrderRepository.findByIdWithProductionOrders()` criado para dar ao Service os dados necessários pra guarda cruzada, sem tocar em Repository de outro módulo | Pedido de Venda |
| 2026-07-09 | Pedido de Venda verificado ao vivo: `open → completed` (pulando `in_production`) rejeitado, `completed → open` rejeitado (estado terminal), `open → in_production` sem OP vinculada permitido, `open/in_production → cancelled` bloqueado com OP ativa vinculada e liberado depois de cancelar a OP. `tsc --noEmit` limpo. Graphify atualizado | Pedido de Venda |
| 2026-07-09 | Mapa de transições da Ordem de Produção validado com o usuário (`AskUserQuestion`): `planned → completed` direto permitido (preserva fluxo atual); demais transições conforme rascunho. Decisão estrutural (não comercial): `ProductionOrderService.update()` só chama `checkTransition()` quando o status de destino é diferente do atual — resolve o conflito entre a única rota `PUT` (que edita campos e muda status na mesma chamada) e a máquina de estados, sem quebrar a edição normal de campos | Ordem de Produção |
| 2026-07-09 | Ordem de Produção verificada ao vivo: PUT com status igual + edição de campo aceito normalmente (não é transição); `planned → paused` direto rejeitado (só via `in_progress`); `planned → completed` direto aceito; `completed → planned` rejeitado (terminal); `paused → completed` direto rejeitado (precisa voltar por `in_progress`); ciclo completo `planned→in_progress→paused→in_progress→completed` funcionando. `tsc --noEmit` limpo. Graphify atualizado | Ordem de Produção |
| 2026-07-09 | **Fase 2 concluída.** Revisão de fim de fase registrada na seção "Revisão de Fim de Fase — Fase 2" acima: todos os 5 domínios com ciclo de vida usando `checkTransition()`, nenhuma regra nova sem validação, nenhum acoplamento novo entre módulos, nenhuma regra de MRP/reserva/planejamento criada, estrutura pronta para Eventos de Domínio (Fase 3). Débito pré-existente catalogado (não corrigido, por decisão consciente): `QuoteService.update()` ainda permite status fora da FSM; `ProductionOrderService.create()` ainda aceita status livre | Fase 2 |
| 2026-07-09 | **Fase 2.1 — o candidato adiado na linha "Levantamento" acima (`StatusHistory`) foi implementado.** Model `StatusHistory` (append-only, mesmo padrão de `AuditLog`/`StockMovement`) gravado via `statusHistoryService.record()` logo após `checkTransition()` validar a transição, nos 6 domínios (os 5 desta fase + Revisão de BOM, ADR-005). Motivado por uma auditoria de débito estrutural do ADR-001 que encontrou o Princípio 7 afirmando algo que não existia — ver ADR-001 para a análise completa e a decisão do usuário. Nenhuma mudança na Máquina de Estados em si, nenhuma regra nova, 43/43 testes existentes passando sem alteração | Fase 2.1 |
