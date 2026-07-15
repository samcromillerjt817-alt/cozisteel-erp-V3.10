# ADR-003 — Eventos de Domínio (Fase 3)

- **Status**: Maduro — Fase 3 implementada e verificada; Fase 3.1 (maturação/consolidação) concluída:
  nomenclatura padronizada, testes automatizados cobrindo os 3 fluxos, catálogo de referência criado,
  Outbox Pattern avaliado (ADR-004, não implementado)
- **Data**: 2026-07-09 (Fase 3) / 2026-07-09 (Fase 3.1)
- **Depende de**: [ADR-001 — Princípios Arquiteturais](./ADR-001-principios-arquiteturais.md), princípio 2
  ("Módulos se comunicam por Eventos de Domínio"); [ADR-002 — Máquina de Estados](./ADR-002-maquina-de-estados.md)
- **Ver também**: [Catálogo de Eventos de Domínio](../eventos/CATALOGO-EVENTOS.md) (referência viva, um
  por evento); [ADR-004 — Avaliação do Outbox Pattern](./ADR-004-avaliacao-outbox-pattern.md)

## Contexto

Desde a Fase 1, toda integração entre agregados diferentes foi implementada como chamada
Service-a-Service direta (nunca Repository cruzando módulo), deliberadamente isolada num único método por
domínio para poder virar Evento de Domínio nesta fase sem precisar reabrir nenhuma rota. A Fase 3 troca
essas chamadas diretas por um barramento de eventos em processo — sem fila externa, sem mudar
comportamento observável.

## Levantamento 1 — pontos atuais onde um Service chama outro Service diretamente

Varredura de todos os imports `@/app/services/*` dentro de `src/app/services/`. Descontando os serviços
de infraestrutura (chamados de todo lugar, não são acoplamento de domínio — `auditService`,
`numberingService`, `settingService`, `pdfService`), restam exatamente **3 pontos de acoplamento entre
agregados de negócio diferentes** em todo o sistema:

| # | Chamador | Chamado | Gatilho | Linha |
|---|---|---|---|---|
| 1 | `QuoteService.changeStatus` | `productionOrderService.createFromApprovedQuote()` | Orçamento transiciona para `approved` | `quote.service.ts` |
| 2 | `QuoteService.convertToSalesOrder` | `salesOrderService.createFromQuote()` | Conversão manual de Orçamento em Pedido de Venda | `quote.service.ts` |
| 3 | `RequisitionService.changeStatus` | `purchaseOrderService.createFromRequisition()` | Requisição transiciona para `ordered` | `requisition.service.ts` |

Esses 3 já são os candidatos mais maduros — passaram por 2 fases inteiras de testes ao vivo (Fase 1 e
Fase 2), comportamento 100% conhecido, sem surpresas.

## Levantamento 2 — mapeamento das ações de negócio pedidas

| Ação | Produtor hoje | Consumidor cruzado hoje | É acoplamento Service→Service? |
|---|---|---|---|
| Orçamento aprovado | `QuoteService.changeStatus('approved')` | `ProductionOrderService` (gera OP) | **Sim** — ponto #1 acima |
| Pedido de Venda "aprovado" | Não existe como transição própria — o Pedido de Venda só nasce depois que o Orçamento já foi aprovado; o momento equivalente é a conversão | `SalesOrderService` (cria o pedido) | **Sim** — ponto #2 acima (é a criação, não uma transição de status do próprio Pedido de Venda) |
| OP criada | `ProductionOrderService.create()` / `.createFromApprovedQuote()` | Nenhum hoje | Não — nenhum outro Service reage à criação de uma OP |
| OP finalizada | `ProductionOrderService.update()` → `completeAndConsumeStock()` | Nenhum Service — a baixa de estoque é uma transação direta em `ProductionOrderRepository` (Material/Product/StockMovement via `db.$transaction`), não uma chamada a `StockService` | Não — é acoplamento a Repository de outro módulo dentro de uma transação atômica, não a Service |
| Requisição criada | `RequisitionService.create()` | Nenhum hoje | Não |
| Pedido de Compra recebido | `PurchaseOrderService.receive()` → `PurchaseOrderRepository.receiveItems()` | Idem OP finalizada — transação direta a Material/StockMovement, não a `StockService` | Não — mesmo padrão |
| Entrada de estoque | 3 pontos de escrita diferentes: `StockService.adjust()`, `ProductionOrderRepository.completeAndConsumeStock()`, `PurchaseOrderRepository.receiveItems()` | — | Não há hoje um único "produtor" — é o achado mais importante desta seção |

### Achado importante: "Entrada de estoque" não tem produtor único hoje

`StockService`/`StockRepository` só cobre o ajuste manual de inventário. As outras duas entradas de
estoque (conclusão de OP, recebimento de Pedido de Compra) escrevem `StockMovement` **diretamente dentro
da própria transação do Repository do módulo de origem** (decisão da Fase 1, para manter a atomicidade:
ADR-001 princípio 3). Transformar isso num evento "estoque.entrada" consumido por um handler central
exigiria mover essa escrita pra fora da transação atômica — quebrando a garantia de "tudo ou nada" que já
existe (se o handler rodasse depois, um saldo poderia ficar inconsistente se o handler falhasse; se
rodasse dentro da mesma transação, não seria mais "evento" no sentido de baixo acoplamento, seria só uma
chamada de função com nome diferente). **Por isso esta fase não cria um evento genérico de "entrada de
estoque"** — ver proposta abaixo.

## Proposta

### Infraestrutura (nova, mínima)

Barramento de eventos em processo, síncrono, sem fila externa:

```ts
// src/lib/domain-events.ts
type EventHandler<T> = (payload: T) => Promise<void> | void

class DomainEventBus {
  private handlers = new Map<string, EventHandler<any>[]>()

  on<T>(eventName: string, handler: EventHandler<T>): void { ... }

  // publish AGUARDA cada handler em sequência — mesma semântica de erro e
  // ordem que uma chamada direta tem hoje; se um handler lançar, publish()
  // propaga o erro pro chamador, exatamente como aconteceria hoje.
  async publish<T>(eventName: string, payload: T): Promise<void> { ... }
}

export const domainEvents = new DomainEventBus()
```

Nomes de evento centralizados (`src/lib/domain-events.ts` ou um arquivo `events.ts` próprio) como
constantes tipadas, uma por ação de negócio real (não um enum genérico).

**Registro dos handlers**: Next.js 16 já suporta `instrumentation.ts` de forma estável (sem flag
experimental) — roda uma vez quando o processo do servidor sobe, antes de atender qualquer requisição.
É o lugar certo para chamar uma função `registerDomainEventHandlers()` que faz todos os `domainEvents.on(...)`
de uma vez, evitando qualquer dependência de ordem de import entre módulos.

### Escopo desta primeira rodada (Fase 3, parte 1)

Migrar **apenas os 3 acoplamentos já existentes e estáveis** do Levantamento 1, trocando a chamada direta
por publish/subscribe — mesmo efeito, mesma ordem, mesma propagação de erro, só desacoplado:

| Evento | Publicado por | Assinado por | Substitui |
|---|---|---|---|
| `orcamento.aprovado` | `QuoteService.changeStatus` | `ProductionOrderService` (handler que chama `createFromApprovedQuote`) | Chamada direta #1 |
| `orcamento.convertido_em_pedido` | `QuoteService.convertToSalesOrder` | `SalesOrderService` (handler que chama `createFromQuote`) | Chamada direta #2 |
| `requisicao.pedido_feito` | `RequisitionService.changeStatus` | `PurchaseOrderService` (handler que chama `createFromRequisition`) | Chamada direta #3 |

**Nenhuma mudança de comportamento observável** — o `publish()` aguarda o handler exatamente como o
`await productionOrderService.createFromApprovedQuote(...)` já fazia; se o handler lançar uma exceção
(ex: `NotFoundException`), ela propaga do mesmo jeito pro `changeStatus()` que publicou, que já teria seu
próprio `try/catch` na rota via `handleRouteError()`. O resultado de `publish()` (o array de OPs/Pedido de
Compra gerado) precisa continuar disponível pro chamador incluir na resposta (`generatedProductionOrders`,
`generatedPurchaseOrders`) — o handler grava isso de volta via um valor de retorno do `publish()` ou (mais
simples e explícito) o próprio handler chama de volta um método do Service produtor pra anexar o
resultado. Esse detalhe de "como o produtor recupera o resultado de um evento" é o ponto técnico mais
delicado desta migração e será resolvido durante a subetapa de implementação — o design aqui só precisa
confirmar que o dado continua chegando na resposta da API exatamente como hoje.

### Eventos propostos como "emitir sem consumidor ainda" (preparação, sem comportamento novo)

`ordem_producao.criada` e `requisicao.criada` são ações de negócio reais sem nenhum consumidor cruzado
hoje. Proposta: publicá-los mesmo assim (emissão pura, zero handlers registrados) — não muda nenhum
comportamento (publicar um evento sem assinantes é o equivalente a não fazer nada), mas deixa o gancho
pronto para uma fase futura de MRP/notificação sem precisar tocar `QuoteService`/`RequisitionService`/
`ProductionOrderService` de novo.

### Eventos de notificação pós-transação (sem mover a lógica de estoque)

`ordem_producao.finalizada` e `pedido_compra.recebido` continuam dependendo da transação atômica
existente em `ProductionOrderRepository`/`PurchaseOrderRepository` — **isso não muda**. Proposta: depois
que a transação já foi commitada com sucesso, o Service publica o evento como notificação de um fato que
já aconteceu (não como gatilho de nada). Sem consumidor ainda (mesma lógica do item anterior) — prepara o
terreno para uma futura integração com Financeiro (custo de produção, valor recebido) sem acoplar nada
agora.

### O que fica de fora desta fase (por decisão, não por esquecimento)

- **`estoque.entrada` genérico** — não criado nesta fase (ver "achado importante" acima). Char um evento
  assim exigiria primeiro unificar os 3 pontos de escrita de `StockMovement` num único produtor, o que é
  uma refatoração maior, fora do pedido de "não substituir tudo imediatamente".
- **Fila externa** (Redis, RabbitMQ, etc.) — não introduzida, por instrução explícita.
- **Execução assíncrona/desacoplada de verdade** — o barramento é síncrono (in-process, mesma request),
  não "dispara e esquece". Preparar pra isso é trabalho de uma fase futura (quando/se filas externas
  entrarem no roadmap).

## Impacto esperado

- Nenhuma mudança de comportamento observável nos 3 fluxos migrados (verificado ao vivo, como nas fases
  anteriores).
- `QuoteService` e `RequisitionService` deixam de importar `productionOrderService`/`salesOrderService`/
  `purchaseOrderService` diretamente — o acoplamento em código (import) desaparece, mesmo o
  comportamento em runtime permanecendo idêntico.
- Infraestrutura pronta para os próximos consumidores (MRP, Financeiro, notificações) se conectarem sem
  tocar nos Services produtores de novo.

## Validação (2026-07-09)

Escopo, infraestrutura (`DomainEventBus` + `instrumentation.ts`) e mecanismo de retorno de resultado
(`publish()` retorna array com o valor de cada handler) confirmados com o usuário via `AskUserQuestion`
antes de qualquer código ser escrito.

## Implementação

- `src/lib/domain-events.ts` — `DomainEventBus`, `DOMAIN_EVENTS`, contratos de payload por evento.
- `src/lib/register-domain-event-handlers.ts` — composition root: único arquivo que conhece os 3
  produtores e os 3 consumidores ao mesmo tempo.
- `src/instrumentation.ts` — chama `registerDomainEventHandlers()` uma vez no startup do servidor
  (Next.js 16, estável, sem flag experimental).
- `QuoteService` e `RequisitionService` não importam mais `productionOrderService`/`salesOrderService`/
  `purchaseOrderService` — publicam `orcamento.aprovado`, `orcamento.convertido_em_pedido` e
  `requisicao.pedido_feito` e usam o retorno de `publish()` para montar a resposta da API
  (`generatedProductionOrders`/`generatedPurchaseOrders`/o próprio Pedido de Venda), exatamente como
  antes.
- `ProductionOrderService` publica `ordem_producao.criada` (nos dois pontos de criação) e
  `ordem_producao.finalizada` (depois que `completeAndConsumeStock` já commitou) — sem consumidor.
- `RequisitionService.create()` publica `requisicao.criada` — sem consumidor.
- `PurchaseOrderService.receive()` publica `pedido_compra.recebido` — sem consumidor, depois da transação
  de recebimento já commitada.
- Nenhuma lógica de baixa/entrada de estoque foi movida para dentro de um handler de evento — as duas
  transações atômicas (`completeAndConsumeStock`, `receiveItems`) continuam exatamente onde estavam.

### Achado crítico durante a verificação: duplicação do singleton entre "layers" do bundler

Ao testar ao vivo, os 3 fluxos migrados retornavam listas vazias / erro "nenhum handler registrado",
mesmo com `instrumentation.ts` confirmadamente executando e chamando `registerDomainEventHandlers()`
(log adicionado temporariamente confirmou). Causa raiz: o Next.js (com Turbopack) compila
`instrumentation.ts` e as rotas de API como **bundles/layers separados** dentro do mesmo processo — um
módulo com estado em nível de módulo (`export const domainEvents = new DomainEventBus()`) pode ser
**reavaliado uma vez por layer**, cada avaliação criando sua própria instância isolada. O `.on()` chamado
pela instrumentação registrava handlers numa instância; o `.publish()` chamado pela rota de API consultava
outra instância, vazia.

**Correção**: mesmo padrão já usado pelo singleton do Prisma neste projeto (`src/lib/db.ts`,
`globalForPrisma`) — guardar a instância do `DomainEventBus` em `globalThis`, garantindo que toda
reavaliação do módulo reutilize a mesma instância. Diferença notada: o singleton do Prisma só grava em
`globalThis` fora de produção (`NODE_ENV !== 'production'`, por causa de hot-reload em dev); o do
`DomainEventBus` grava **sempre**, porque a duplicação por layer do bundler não é um artefato exclusivo
de hot-reload em dev — apareceu já na primeira execução limpa do servidor.

**Verificado ao vivo** (depois da correção): os 3 fluxos completos (Orçamento→OP via evento,
Orçamento→Pedido de Venda via evento, Requisição→Pedido de Compra via evento) funcionando de ponta a
ponta, com o mesmo resultado observável de antes da migração. `tsc --noEmit` limpo (só o débito de
`page.tsx` já catalogado no ADR-001).

## Impacto real observado

- `quote.service.ts` e `requisition.service.ts` não importam mais nenhum outro Service de domínio de
  negócio — só `numberingService`/`auditService` (infraestrutura) e `domainEvents`.
- Nenhuma mudança de comportamento observável na API.
- Descoberto e documentado um cuidado arquitetural específico de Next.js/Turbopack relevante para
  qualquer infraestrutura futura baseada em módulo-singleton + `instrumentation.ts`.

## Débito/observações catalogadas (não corrigidas nesta fase)

- `estoque.entrada` genérico continua fora do escopo (ver "achado importante" acima) — precisa antes
  unificar os 3 pontos de escrita de `StockMovement`.
- Fila externa e execução verdadeiramente assíncrona seguem fora do roadmap desta fase, por instrução
  explícita do usuário.
- `ordem_producao.criada`, `ordem_producao.finalizada`, `requisicao.criada` e `pedido_compra.recebido`
  seguem publicados sem nenhum consumidor — infraestrutura pronta, comportamento zero até que um handler
  seja registrado numa fase futura (MRP, Financeiro, notificações).

## Fase 3.1 — Maturação e Consolidação (2026-07-09)

Etapa pedida explicitamente pelo usuário antes de iniciar uma nova fase grande, para garantir que a
infraestrutura de eventos aguenta crescer sem retrabalho. Cobriu 5 pontos:

1. **Documentação por evento** — criado o [Catálogo de Eventos de Domínio](../eventos/CATALOGO-EVENTOS.md),
   documento de referência vivo (separado deste ADR, que registra decisão — não catálogo) com produtor,
   consumidor(es), payload, momento do disparo e regra de negócio associada, para os 7 eventos.
2. **Padronização de nomenclatura** — auditados os 7 nomes contra "fato do passado, não comando".
   Confirmado com o usuário: manter a convenção `dominio.fato_passado` em português (dot-notation), não
   migrar para `PascalCase`+`Event` em inglês (que introduziria uma inconsistência nova no vocabulário do
   domínio). Dois nomes ambíguos corrigidos:
   - `orcamento.convertido_em_pedido` → **`orcamento.convertido_em_pedido_venda`** (o nome antigo não
     deixava claro que "pedido" é Pedido de **Venda**, não Pedido de Compra).
   - `requisicao.pedido_feito` → **`requisicao.aprovada_para_compra`** (o nome antigo misturava
     vocabulário de Requisição com Pedido de Compra). Os outros 5 nomes já eram fatos claros — mantidos.
3. **Testes automatizados** — o projeto não tinha nenhum framework de teste antes desta etapa. Introduzido
   Vitest (`vitest.config.ts`, `vitest.setup.ts`) rodando contra um SQLite de teste dedicado
   (`.env.test` → `prisma/test.db`, nunca o banco de dev/produção). Dois arquivos de teste:
   - `tests/domain-event-bus.test.ts` — unitário, mecânica isolada do barramento (registro, ordem
     sequencial, propagação de erro, isolamento entre eventos).
   - `tests/domain-events-flows.test.ts` — integração dos 3 fluxos pedidos, chamando os Services
     diretamente (sem HTTP) contra o barramento real (`domainEvents`, singleton de produção) e o banco de
     teste: Orçamento aprovado → OP criada; Orçamento aprovado → convertido → Pedido de Venda criado;
     Requisição aprovada para compra → Pedido de Compra criado. **9/9 testes passando.**
   - **Achado durante os testes** (catalogado, não corrigido — fora do escopo desta fase):
     `NumberingService.getNextNumber()` cria a linha de `NumberSequence` com `nextNumber: 1` na primeira
     chamada de um `documentType`, mas não incrementa nesse ramo — a 1ª e a 2ª chamada retornam o mesmo
     número. Nunca aparece no banco real (sequências já existem desde antes), só num banco 100% novo.
     Contornado no `vitest.setup.ts` pré-semeando as sequências usadas antes dos testes rodarem.
4. **ADR-004 criado** avaliando o Outbox Pattern — riscos do barramento síncrono atual, condições que
   tornariam persistência necessária, impacto de uma fila futura. **Nada implementado.**
5. **Graphify atualizado** ao final (ver log abaixo).

## Log de Decisões

| Data | Decisão |
|---|---|
| 2026-07-09 | Levantamento: apenas 3 pontos de acoplamento Service-a-Service de negócio existem hoje (Orçamento→OP, Orçamento→Pedido de Venda, Requisição→Pedido de Compra); `estoque.entrada` não tem produtor único (3 pontos de escrita diferentes) |
| 2026-07-09 | Escopo, infraestrutura (`DomainEventBus` síncrono + `instrumentation.ts`) e mecanismo de retorno (`publish()` retorna resultados dos handlers) validados com o usuário antes do código |
| 2026-07-09 | Implementados `domain-events.ts`, `register-domain-event-handlers.ts`, `instrumentation.ts`; `QuoteService`/`RequisitionService` migrados para publicar eventos em vez de chamar Services diretamente; `ProductionOrderService`/`RequisitionService`/`PurchaseOrderService` passam a publicar eventos de notificação sem consumidor (`criada`, `finalizada`, `recebido`) |
| 2026-07-09 | **Achado crítico corrigido**: singleton `DomainEventBus` duplicado entre layers do bundler Next.js/Turbopack (instrumentation vs. rotas de API) fazia handlers registrados nunca serem vistos por quem publica. Corrigido com o mesmo padrão `globalThis` já usado pelo singleton do Prisma (`src/lib/db.ts`), mas gravando sempre (não só fora de produção) — a causa não é hot-reload, é reavaliação de módulo entre layers, presente em qualquer ambiente |
| 2026-07-09 | Verificado ao vivo: os 3 fluxos migrados funcionando de ponta a ponta via evento, mesmo resultado observável de antes. `tsc --noEmit` limpo. Fase 3 (primeira rodada) concluída |
| 2026-07-09 | **Fase 3.1 concluída**: nomenclatura confirmada com o usuário (2 renomeações); `orcamento.convertido_em_pedido`→`orcamento.convertido_em_pedido_venda`, `requisicao.pedido_feito`→`requisicao.aprovada_para_compra`; Vitest introduzido (primeiro framework de teste do projeto) com banco de teste dedicado; 9 testes automatizados cobrindo mecânica do barramento + os 3 fluxos de ponta a ponta; ADR-004 (avaliação de Outbox Pattern) criado, nada implementado; Catálogo de Eventos criado como referência viva |
