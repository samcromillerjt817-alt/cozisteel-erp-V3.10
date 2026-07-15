# ADR-017 — Dashboard e KPIs (Fase 11): Levantamento Arquitetural

- **Status**: **Fase 11 (Dashboard e KPIs) CONCLUÍDA (2026-07-14) — Subetapa 8 (descontinuação do
  dashboard antigo) implementada, ver ADR-019 para o detalhe completo.** Todo o conteúdo (51/51 widgets)
  e o filtro de período centralizado estão prontos desde a Subetapa 6. As 5 decisões pendentes do
  levantamento original foram resolvidas, 2 princípios arquiteturais permanentes foram incorporados
  (Dashboard modular por widgets; separação completa apresentação/domínio —
  Frontend→API→Service→Repository→Domínio), e os ajustes exigidos em cada aprovação anterior foram
  implementados. Nota: durante a aprovação da Subetapa 3, o usuário também registrou uma futura
  Fase 11.5 (Consolidação UX/UI do ERP) no roadmap — ver ADR-018, sem impacto na Fase 11 em si.
- **Data**: 2026-07-10 (levantamento, aprovação e Subetapa 1, mesma data)

## Subetapa 1 — Implementação (2026-07-10)

Entregue exatamente o escopo da Subetapa 1 (Seção 19): índices recomendados + infraestrutura genérica
de widgets — **zero widget de domínio real**, catálogo vazio, pronto para receber conteúdo nas
Subetapas 2-6.

**Schema (migração aditiva, `prisma db push` em dev e teste)**: 8 índices novos, todos os que a
auditoria do levantamento identificou como faltantes para os widgets já mapeados —
`ProductionOrder.createdAt`, `ProductionOrderExecution.createdAt`, `PurchaseOrder.createdAt`,
`Requisition.tipo`, `MrpSuggestion.status`, `StockMovement.type`, `MaterialBatch.receivedAt`,
`MaterialBatch.expiresAt`, `ProductBatch.producedAt`. Nenhuma alteração de dado, só `@@index` novos.

**Arquivos novos** (nenhum arquivo existente alterado, além do schema):
- `src/app/services/dashboard-types.ts` — tipos internos (`DashboardProfile`, `DashboardWidgetDTO` com
  `id`/`type`/`order`/`data`, `DashboardPayloadDTO`) — array de widgets, não campos fixos por perfil,
  já refletindo o princípio de modularidade.
- `src/lib/dashboard-cache.ts` — `getOrCompute(key, ttlSeconds, compute)` genérico em memória, sem
  dependência nova.
- `src/app/repositories/dashboard.repository.ts` — `buildPeriodFilter(from, to)`, único helper
  genérico desta subetapa; métodos de consulta por domínio entram aqui nas próximas subetapas.
- `src/app/services/dashboard-access.service.ts` — tabela `PROFILE_ACCESS` (perfil→Roles, decisão #1)
  + `canAccessProfile`/`getAccessibleProfiles`. `rbac.ts` **não foi tocado**.
- `src/app/services/dashboard-widgets.service.ts` — catálogo de widgets (`WIDGET_REGISTRY`, vazio),
  `registerWidget()`, `PROFILE_CONTENT_SOURCES` (composição Diretoria=união de tudo, PCP=Produção+
  Estoque, decisão #1), `getDashboard(profile, period)` — filtra o catálogo pelo perfil, aplica cache
  (TTL 60s, dentro da faixa 30-60s aprovada) só nos widgets marcados `expensive: true`, ordena por
  `order`.
- `src/app/api/dashboard/v2/[profile]/route.ts` — `requireModulePermission('dashboard','read')` +
  `canAccessProfile()` + parâmetros `?from=&to=`. Nome `v2` deliberadamente provisório (Seção 16).
  `/api/dashboard/stats` **não foi tocada** (decisão #3).
- `tests/dashboard-widgets-infra.test.ts` — 14 testes novos: RBAC composto (5), cache genérico (3),
  filtro de período (2), catálogo/composição de widgets incluindo Diretoria/PCP e passagem pelo cache
  (4).

**Ajuste em relação ao proposto no levantamento** (transparência, não é desvio de escopo): os DTOs
internos foram colocados em `dashboard-types.ts` dentro de `src/app/services/`, não em
`src/app/dto/dashboard.ts` como o levantamento original sugeriu — confirmado que `src/app/dto/
index.ts` é convenção exclusiva de schemas Zod de validação de entrada; DTOs internos de Service já
seguem o precedente de `batch-traceability.service.ts` (definidos junto ao domínio, não em `dto/`).
Mesma razão pela qual `dashboard.repository.ts` ficou deliberadamente mínimo nesta subetapa (só o
filtro de período) — sem um Prisma delegate genérico o suficiente para ser reaproveitado sem
duplicar tipagem, cada domínio adiciona seus próprios métodos quando o widget existir.

**Resultado**: `tsc --noEmit` limpo; `npm run lint` 58 warnings (baseline idêntica, nenhum novo);
`npm run build` limpo (rota `v2` confirmada em `.next/server/app/api/dashboard/v2/[profile]`);
`npm test` 165/165 (151 + 14 novos). `graphify update .` executado.

### Ajustes exigidos pelo usuário na aprovação da Subetapa 1 (2026-07-10)

**1. Catálogo central de widgets** — criado `src/app/services/dashboard-widget-catalog.ts`: as 48
entradas de indicador já mapeadas na Seção 3 deste ADR (Comercial 14, Produção 13, Estoque 8, Compras
9, Administrativo 4), cada uma com `id`/`nome`/`categoria`/`perfilPadrao`/`ordemPadrao`/`implementado`
(sempre `false` nesta subetapa)/`dependencias`/`faseRoadmap`. Este catálogo — não o `WIDGET_REGISTRY`
de `dashboard-widgets.service.ts` — é a fonte única de verdade para a evolução do Dashboard: todo
widget planejado existe registrado aqui mesmo antes de ser implementado. `registerWidget()` agora
**rejeita** (lança erro) qualquer `id` que não exista no catálogo — a disciplina é um guardrail de
execução, não só uma convenção documental. 5 testes novos de integridade do catálogo (sem ids
duplicados, campos obrigatórios preenchidos, nenhum marcado `implementado` ainda, `getCatalogEntry`
correto) + os testes de composição da Subetapa 1 foram ajustados para usar ids reais do catálogo em
vez de ids fictícios — **170/170 testes no total**.

**2. Diagnóstico do Graphify com ADRs** — investigação formal, registrada em detalhe no Princípio 12
do ADR-001 (tabela de 5 perguntas) e em `CLAUDE.md`: confirmado que `docs/adr/*.md` nunca é
semanticamente indexado pelo `graphify update .` (só AST de código-fonte; markdown exigiria o pipeline
com LLM, não configurado). O warning `file_hash requires a file` é um sintoma cosmético de
case-sensitivity de path neste ambiente WSL/Windows, não a causa raiz da não-indexação. Prática
mantida: o conteúdo de um ADR sempre é lido diretamente (`Read`), nunca via `graphify query` — o grafo
só localiza qual código cita qual ADR.

**3. Regra operacional registrada** — `README.md` ("Desenvolvimento local") agora documenta
definitivamente que comandos `npx`/`npm` neste ambiente Windows/WSL devem rodar via
`wsl.exe -e bash -lc "cd /home/julio/cozisteel-erp-V3.10 && <comando>"`, não diretamente.

`tsc`/lint (58 warnings)/build/test (170/170) limpos após os 2 ajustes. `graphify update .` executado
novamente. **Subetapa 1 oficialmente encerrada e aprovada — Subetapa 2 (Dashboard Comercial)
autorizada.**

## Subetapa 2 — Dashboard Comercial (2026-07-10)

Os 14 widgets Comerciais do catálogo (Seção 3.1) implementados de verdade e marcados
`implementado: true` em `dashboard-widget-catalog.ts`.

**Correção antes de começar**: a auditoria original (Seção 11) já apontava que `Quote`/`SalesOrder`
não tinham índice em `createdAt`, mas a Subetapa 1 não incluiu essa correção na lista de 8 índices —
lacuna própria, corrigida agora: `@@index([createdAt])` adicionado a `Quote` e `SalesOrder` (migração
aditiva, `prisma db push` em dev e teste), já que os widgets Comerciais dependem diretamente desse
filtro de período.

**Arquivos novos**:
- `src/app/repositories/dashboard.repository.ts` (ampliado) — 13 métodos novos de consulta (contagens/
  agregações por status, valor aprovado, top clientes/produtos com join de nomes sem N+1, timings de
  aprovação/conversão, leitura de `StatusHistory` para o widget de tempo por status).
- `src/app/services/dashboard-widgets-comercial.ts` — os 14 `registerWidget()` do perfil Comercial.
- `src/app/services/dashboard-bootstrap.ts` — import central por efeito colateral (evita import
  circular entre o registro de widgets e os arquivos de domínio); a rota `v2` importa só este arquivo,
  nunca precisa saber quais domínios já existem.
- `tests/dashboard-widgets-comercial.test.ts` — 15 testes, dados sintéticos numa janela de 2020
  (isola o teste de qualquer outro arquivo gravando no mesmo `test.db` com `createdAt` padrão de
  `now()`).

**Decisão técnica registrada**: "Faturamento" do dashboard atual foi implementado aqui como
`comercial.valor-aprovado-por-periodo`, com `hint` explícito deixando claro que é valor negociado
aprovado, não receita reconhecida (ADR-017 §4) — a UX enganosa identificada no levantamento é corrigida
já nesta subetapa, no novo Dashboard (o antigo continua intocado, decisão registrada #3).

**Resultado**: `tsc --noEmit` limpo; `npm run lint` 58 warnings (baseline idêntica); `npm run build`
limpo; `npm test` **185/185** (170 + 15 novos, incluindo o ajuste de 1 teste da Subetapa 1 cuja
premissa — "nenhum widget implementado ainda" — deixou de valer). `graphify update .` executado.
Catálogo: 14/48 widgets agora `implementado: true` (Comercial completo; PCP/Compras/Estoque/
Administrativo ainda pendentes, Subetapas 3-5).

**Subetapa 2 concluída — aguardando validação do usuário antes da Subetapa 3 (Dashboard PCP/Produção/
Estoque).**

## Subetapa 3 — Levantamento (antes da implementação, 2026-07-10)

Por pedido do usuário, antes de qualquer código: indicadores, fontes de dados e impactos de
performance dos 21 widgets de Produção/PCP (13) e Estoque (8), todos já catalogados na Seção 3.2/3.4
e no catálogo central (`dashboard-widget-catalog.ts`).

### Achado corrigido antes de prosseguir

A ressalva registrada no catálogo para `producao.cobertura-reserva` ("confirmar achado do ADR-012
antes de expor distribuição de status de reserva") estava **desatualizada** — o achado do ADR-012
(`releaseMany()` podia sobrescrever `status` de reservas já `consumed` de volta para `released`) **já
foi corrigido no próprio ADR-012**, não só identificado: `consumed` é hoje um estado terminal por
decisão do usuário (`src/app/repositories/material-reservation.repository.ts`, `releaseMany()` filtra
`status: { notIn: ['released', 'consumed'] }`), com 4 testes de regressão (`material-reservation-
cancellation.test.ts`) e uma revisão final de consistência Engenharia→Reserva→Produção→Estoque→MRP sem
nenhuma inconsistência nova encontrada. A auditoria original da Fase 11 só tinha lido o ADR-012 até a
linha 699 de 855 — a correção estava a poucas linhas dali. Ressalva removida do catálogo; o widget de
distribuição de status de reserva pode expor `consumed` com segurança.

### Produção / PCP (13 widgets)

| Widget | Fonte de dados | Cálculo | Performance |
|---|---|---|---|
| `producao.ops-por-status` | `ProductionOrder.status` | `groupBy` + `count` | Leve — `@@index([status])` |
| `producao.ops-atrasadas` | `ProductionOrder.dueDate` (⚠️ `String`, sem parser confiável — mesma limitação do ADR-007) + `status` aberto | Busca OPs abertas (indexado), parse de data em app | Leve na consulta, ressalva de confiabilidade do dado (igual ao MRP) |
| `producao.wip-total` | `ProductionOrder.quantity - quantityCompleted`, status `in_progress` | Soma calculada em app sobre poucas linhas | Leve |
| `producao.backlog-por-produto` | idem, `groupBy productId`, status planned/in_progress/paused | Agregação em app | Leve/médio |
| `producao.ops-por-prioridade` | `ProductionOrder.priority` | `groupBy` + `count` | Leve (sem índice, tabela pequena) |
| `producao.rodadas-parciais-por-op` | `ProductionOrderExecution` `groupBy productionOrderId` | `count` | Leve — `@@index([productionOrderId])` |
| `producao.cobertura-reserva` | `MaterialReservation.quantityReserved/quantityNeeded/quantityShortfall/status` (`consumed` seguro, ver acima) | `aggregate`/`groupBy` | **Sem índice em `status`** — full scan (tabela cresce moderadamente, 1 linha por OP×item) |
| `producao.sugestoes-mrp-por-status` | `MrpSuggestion.status` | `groupBy` + `count` | Leve — índice concluído na Subetapa 1 |
| `producao.mrp-compra-vs-producao` | `MrpSuggestion.suggestionType` | `groupBy` + `count` | Leve — já indexado |
| `producao.resumo-ultima-execucao-mrp` | `MrpRun` (campos já denormalizados: `totalSuggestions`, etc.) | Leitura direta O(1) da execução mais recente (`@@index([executedAt])`) | Muito leve |
| `producao.volume-lotes-por-periodo` | `MaterialBatch.receivedAt` / `ProductBatch.producedAt` | Agregação por período | Leve — índices concluídos na Subetapa 1 |
| `producao.adocao-lote` | `Material.lotControlled` / `Product.lotControlled` | `count` | Muito leve (tabelas mestre pequenas) |
| `producao.bom-revisoes-pendentes` | `BomRevision.status` | `groupBy`/`count` | Leve — já indexado |

### Estoque (8 widgets)

| Widget | Fonte de dados | Cálculo | Performance |
|---|---|---|---|
| `estoque.saldo-atual` | `Material.stockQty` / `Product.stockQty` | Leitura direta | Muito leve |
| `estoque.materiais-baixo-estoque` | `Material.stockQty <= Material.minStockQty` (campo já existe, já usado em `stock.service.ts`) | Filtro em memória sobre tabela pequena | Leve |
| `estoque.reservado-a-caminho-em-producao` | `Material.reservedQty/onOrderQty/inProductionQty` (já denormalizados) | Leitura direta | Muito leve |
| `estoque.movimentacoes-por-tipo` | `StockMovement.type` + `createdAt` | `groupBy` escopado por período | Leve — índice `type` concluído na Subetapa 1, `createdAt` já existia |
| `estoque.materiais-mais-consumidos` | `StockMovement.materialId`, `type='OUT'` | `groupBy` + `_sum`, top N | Médio — `StockMovement` cresce sem purge, mas escopado por período |
| `estoque.lotes-vencendo` | `MaterialBatch.expiresAt` | Filtro direto | Leve — índice concluído na Subetapa 1; **poucos lotes têm essa data preenchida hoje** (FIFO, não FEFO) — widget provavelmente mostrará 0 na prática, não é bug |
| `estoque.saldo-valorizado-quantidade` | `MaterialBatch.quantityAvailable` `groupBy materialId` (só `lotControlled`) | `groupBy` + `_sum` | Leve/médio |
| `estoque.ajustes-inventario` | `StockMovement.type='ADJUST'` | `count`/`groupBy` por período | Leve — já indexado |

### Impactos de performance a destacar

- **Único índice faltante identificado nesta rodada**: `MaterialReservation.status` (usado por
  `cobertura-reserva`) — tabela de crescimento moderado (1 linha por OP × item de BOM, nunca apagada),
  hoje sem índice em `status`. Proposta: adicionar na Subetapa 3, mesmo padrão aditivo das anteriores.
- Nenhum outro widget desta leva exige índice novo — os índices da Subetapa 1 (`MrpSuggestion.status`,
  `StockMovement.type`, `MaterialBatch.receivedAt/expiresAt`, `ProductBatch.producedAt`) já cobrem
  exatamente os widgets que motivaram sua criação.
- `producao.ops-atrasadas` herda a mesma limitação estrutural já documentada no ADR-007 para o MRP —
  `ProductionOrder.dueDate` é `String` livre, sem parser confiável; o widget filtra por status aberto
  (indexado, barato) e só faz o parse de data em memória sobre esse subconjunto pequeno.
- `estoque.materiais-mais-consumidos` e `producao.backlog-por-produto` são os dois candidatos mais
  "pesados" desta leva (agregação sobre tabela que cresce, respectivamente `StockMovement` e
  `ProductionOrder`/`MaterialReservation`) — ambos serão marcados `expensive: true` (cache de 60s),
  mesmo padrão já usado nos widgets Comerciais equivalentes (`top-clientes`/`top-produtos`).
- Nenhum widget desta leva expõe custo/valor monetário — `estoque.saldo-valorizado-quantidade` é
  deliberadamente só em quantidade, consistente com a Seção 4 (bloqueado pelo Financeiro).

### Estrutura de implementação proposta (para a próxima aprovação)

Mesma arquitetura das Subetapas 1-2: métodos novos em `dashboard.repository.ts` (consultas), um novo
arquivo `dashboard-widgets-pcp-producao.ts` e `dashboard-widgets-estoque.ts` (ou um único arquivo
`dashboard-widgets-producao-estoque.ts`, a decidir na implementação) registrando os 21 widgets,
import por efeito colateral adicionado a `dashboard-bootstrap.ts`. Testes com dados sintéticos numa
janela isolada (mesmo padrão de 2020 usado na Subetapa 2), migração aditiva do único índice novo
(`MaterialReservation.status`) em dev e teste.

Nenhum código escrito nesta rodada — aguardando aprovação deste levantamento antes de implementar.

## Subetapa 3 — Implementação (2026-07-10)

Os 21 widgets de Produção/PCP (13) e Estoque (8) implementados de verdade e marcados
`implementado: true` no catálogo. **35/48 widgets do catálogo agora implementados** (Comercial +
Produção/PCP + Estoque completos; só Compras e Administrativo restam, Subetapas 4-5).

**Schema**: `MaterialReservation.status` — 1 índice aditivo (`prisma db push` em dev e teste), único
identificado no levantamento, usado por `producao.cobertura-reserva`.

**Arquivos novos**:
- `src/app/repositories/dashboard.repository.ts` (ampliado) — 19 métodos novos (13 Produção/PCP + 8
  Estoque, um deles compartilhado — `sumBatchVolumeInPeriod` toca `MaterialBatch` e `ProductBatch`),
  todos read-only, sem regra de negócio, seguindo a Repository genérica já estabelecida.
- `src/app/services/dashboard-widgets-producao.ts` — os 13 `registerWidget()` de Produção/PCP.
- `src/app/services/dashboard-widgets-estoque.ts` — os 8 `registerWidget()` de Estoque.
- `dashboard-bootstrap.ts` ampliado com os 2 imports novos (nenhuma outra alteração).
- `tests/dashboard-widgets-producao-estoque.test.ts` — 19 testes. Diferente da Subetapa 2 (dados
  isolados por janela sintética), aqui vários widgets agregam sobre **estado atual global**
  (`ProductionOrder.status`, `MaterialReservation`, `Material.stockQty`) — tabelas compartilhadas com
  toda a suíte. Testados por **delta** (valor antes/depois de criar os dados do teste), não por valor
  absoluto, garantindo isolamento mesmo com outros arquivos de teste escrevendo no mesmo banco.

**Achado do levantamento confirmado na prática**: `consumed` como estado terminal (ADR-012) permitiu
implementar `producao.cobertura-reserva` sem nenhuma ressalva — testado explicitamente com uma reserva
`partial` e uma `consumed` coexistindo, ambas corretamente distinguidas na distribuição por status.

**Resultado**: `tsc --noEmit` limpo; `npm run lint` 58 warnings (baseline idêntica); `npm run build`
limpo; `npm test` **204/204** (185 + 19 novos). `graphify update .` executado.

**Subetapa 3 concluída — aguardando validação do usuário antes da Subetapa 4 (Dashboard Compras).**

## Subetapa 4 — Dashboard Compras (2026-07-10)

Os 9 widgets de Compras implementados de verdade e marcados `implementado: true` — **44/48 widgets do
catálogo agora implementados** (só Administrativo resta, Subetapa 5).

**5 correções incorporadas na aprovação do levantamento**, todas implementadas:
1. `percentual-atendido-estoque` — segmentado por `originModule`, com o comentário da regra ADR-009
   direto no código do repository (`sumRequisitionFulfillmentByOrigin`), para não regredir.
2. `tempo-ciclo-requisicao` — só requisições com `status='ordered'` (ciclo concluído) entram no
   cálculo; `findCompletedRequisitionStatusHistory` filtra a nível de `Requisition` antes de buscar o
   `StatusHistory`, não deixando nenhuma requisição em andamento contaminar a média.
3. `tempo-por-etapa-po` — cada etapa retorna `mediaDias` **e** `sampleSize` (quantidade de POs
   consideradas), para o frontend nunca confundir uma média de amostra pequena com uma tendência real.
4. `performance-fornecedor` — filtra `status='received'` + `receivedAt` preenchido + cotação
   selecionada com `leadTimeDays > 0` **do mesmo fornecedor do PO** (bug real encontrado e corrigido
   durante os testes — a primeira versão pegava a cotação vencedora de QUALQUER fornecedor do item,
   não necessariamente a do fornecedor daquele PO específico); expõe `avgPromised`/`avgActual`/`diff`/
   `sampleSize` por fornecedor, não só uma média.
5. `taxa-vitoria-fornecedor` — `winRate = wins / participations` (cotações em que o fornecedor
   participou), nunca sobre o total de pedidos.

**Achado corrigido durante a implementação (não estava no levantamento)**: a query inicial de
`performance-fornecedor` atribuía o prazo prometido da cotação vencedora do item **sem checar se essa
cotação era do mesmo fornecedor do Pedido de Compra sendo avaliado** — um item com cotações de dois
fornecedores diferentes (um vencedor, um não) fazia o PO do fornecedor perdedor herdar o prazo
prometido do vencedor. Pego pelo teste `performance-fornecedor` (cenário desenhado exatamente para
isso: PO do fornecedor B, cotação vencedora do item é do fornecedor A) antes de qualquer uso real —
corrigido filtrando `quote.supplierId === order.supplierId` em app.

**Arquivos novos**:
- `dashboard.repository.ts` (ampliado) — 12 métodos novos de Compras.
- `dashboard-widgets-compras.ts` — os 9 `registerWidget()`.
- `dashboard-bootstrap.ts` ampliado com 1 import novo.
- `tests/dashboard-widgets-compras.test.ts` — 10 testes, incluindo os 5 cenários das correções
  pedidas e o cenário que capturou o bug de atribuição de fornecedor.

**Nenhum índice novo** — confirmado no levantamento e mantido na implementação.

**Resultado**: `tsc --noEmit` limpo; `npm run lint` 58 warnings (baseline idêntica); `npm run build`
limpo; `npm test` **214/214** (204 + 10 novos, incluindo o ajuste de 1 teste da Subetapa 3 cuja
contagem fixa de widgets implementados ficou stale — trocado por uma checagem por categoria, resiliente
a novas subetapas). `graphify update .` executado.

**Subetapa 4 concluída — aguardando validação do usuário antes da Subetapa 5 (Dashboard Diretoria +
Administrativo).**

## Subetapa 5 — Dashboard Diretoria + Administrativo (2026-07-10)

Os 4 widgets de Administrativo implementados de verdade e marcados `implementado: true` —
**48/48 widgets do catálogo agora implementados. Todos os perfis de conteúdo (Comercial, Produção/PCP,
Estoque, Compras, Administrativo) estão completos.**

**Diretoria**: confirmado que **não precisou de nenhum código novo** — `PROFILE_CONTENT_SOURCES.
diretoria` já incluía `'administrativo'` desde a Subetapa 1 (`dashboard-widgets.service.ts`), então
`getDashboard('diretoria')` passou a devolver os 48 widgets automaticamente assim que o último domínio
(Administrativo) foi registrado. Testado explicitamente: união sem duplicação de nenhum `id`,
ordenação (`order`) preservada, permissões (`admin`/`manager`) inalteradas.

**5 observações da aprovação, todas confirmadas na implementação**:
1. `usuarios-ativos-por-papel` — só conta `active: true` (filtro direto na query, não em memória).
2. `volume-auditoria-por-periodo` — respeita o filtro global de período; testado explicitamente com
   uma janela onde os logs sintéticos NÃO aparecem, confirmando que o filtro corta de verdade.
3. `sequencias-numeracao` — somente leitura, sem nenhuma lógica adicional; teste confirma que
   `NumberSequence` não é alterado por chamar o widget.
4. `ultimas-execucoes-patch` — limite de 20 registros, `orderBy: { createdAt: 'desc' }`.

**Arquivos novos**:
- `dashboard.repository.ts` (ampliado) — 4 métodos novos de Administrativo.
- `dashboard-widgets-administrativo.ts` — os 4 `registerWidget()`.
- `dashboard-bootstrap.ts` ampliado com 1 import novo (último da Fase 11).
- `tests/dashboard-widgets-administrativo.test.ts` — 8 testes, incluindo os 2 testes específicos de
  Diretoria (composição sem duplicação; ordenação preservada).

**Resultado**: `tsc --noEmit` limpo; `npm run lint` 58 warnings (baseline idêntica); `npm run build`
limpo; `npm test` **222/222** (214 + 8 novos, incluindo o ajuste de 1 teste da Subetapa 4 cuja
contagem fixa de widgets implementados ficou stale — mesmo padrão de correção já usado na Subetapa 3).
`graphify update .` executado.

**Subetapa 5 concluída — todo o conteúdo (48/48 widgets, 6 perfis) está implementado. Aguardando
validação do usuário antes da Subetapa 6 (filtro de período global consolidado nas rotas).**

## Subetapa 6 — Filtro de Período Global (2026-07-10)

**Estratégia adotada**: um único resolvedor de período, `resolveDashboardPeriod(searchParams, now?)`
em `src/lib/dashboard-period.ts`, é a **única** função no projeto que transforma parâmetros de request
(`?period=30d|90d|custom&from=&to=`) em `DashboardPeriod` (`{ from?, to? }`). A rota
`/api/dashboard/v2/[profile]/route.ts` — hoje o único ponto de entrada do novo Dashboard — chama só
essa função; nenhum `new Date(param)` ad-hoc restou na rota. Regras da resolução:
- `period=30d` (ou nenhum parâmetro) → padrão, últimos 30 dias.
- `period=90d` → últimos 90 dias.
- `period=custom` com `from`/`to` (ou `from`/`to` presentes sem `period` explícito) → usa exatamente
  as datas informadas.
- **Nunca devolve um período totalmente aberto por acidente**: se `custom` for pedido mas nenhuma data
  válida vier junto (parâmetros ausentes ou não-parseáveis), cai no preset padrão de 30 dias — reforça
  o Princípio de performance já registrado (ADR-017 §12: nunca uma consulta sem corte de período numa
  tabela sem purge).

**Impacto nos widgets existentes**: **nenhum widget foi alterado.** Todos os 48 já recebiam
`period: DashboardPeriod` como parâmetro desde a Subetapa 1 (`getDashboard(profile, period)` já
threadava o mesmo objeto para cada `compute()`) — a duplicação que esta subetapa eliminou estava
inteiramente na camada de **resolução do request** (a rota), não entre widgets. Widgets que
deliberadamente ignoram período (estado atual: `clientes-produtos-ativos`, `aprovacoes-pendentes`,
`sequencias-numeracao`, etc. — decisão já registrada na Seção 13) continuam ignorando-o; isso é
arquitetura, não duplicação.

**Testes**: 8 novos (`tests/dashboard-period.test.ts`) — os 3 presets, custom com `from`/`to`
completos, custom com só `from` (aberto para frente), 2 cenários de robustez (datas inválidas e preset
desconhecido caem no padrão de 30 dias, nunca em "sem filtro").

**Resultado**: `tsc --noEmit` limpo; `npm run lint` 58 warnings (baseline idêntica); `npm run build`
limpo; `npm test` **230/230** (222 + 8 novos). `graphify update .` executado. Nenhuma regressão —
suíte completa de widgets (Subetapas 2-5) continua passando sem nenhuma alteração de asserção, porque
a resolução de período agora centralizada produz exatamente os mesmos valores que cada rota já
calculava manualmente antes.

**Nota operacional**: a rota `/api/dashboard/v2/[profile]` foi alterada (código de servidor) — o
processo PM2 em execução precisa de restart para servir essa mudança (o build/postbuild já sincronizou
os artefatos estáticos, mas o processo Node já em memória continua com o `server.js` antigo até um
`pm2 restart`). Não reiniciado nesta rodada por não haver necessidade de validação visual imediata
(Subetapa 7, frontend, ainda não começou).

**Subetapa 6 concluída — aguardando validação do usuário antes da Subetapa 7 (Frontend).**

## Subetapa 7 — Frontend (2026-07-10)

**Arquitetura dos componentes React** (`src/components/dashboard/`, nenhum dentro de `page.tsx`):

```
dashboard-chart-palette.ts    → paleta categórica validada (skill de dataviz), 8 cores, ordem fixa
dashboard-chart.tsx           → wrapper único do Recharts (bar/donut/line/funcional-como-barra)
dashboard-widget-card.tsx     → renderiza type:'card'
dashboard-widget-table.tsx    → renderiza type:'table' (reaproveita Table/EmptyTableRow da Fase 13)
dashboard-widget-renderer.tsx → dispatcher por widget.type — só decide QUAL componente usar
dashboard-period-filter.tsx   → UI do filtro (30d/90d/custom) — só emite parâmetros
dashboard-profile-view.tsx    → busca /api/dashboard/v2/[profile] + renderiza os widgets
dashboard-tabs.tsx            → abas por perfil, dirigidas por getAccessibleProfiles(role)
```

Integração em `page.tsx`: 1 entrada nova em `ModuleKey`/`navGroups`/`breadcrumbMap`/`canAccess`
(`'dashboard-v2'`, rótulo "Dashboard (Novo)") + 1 bloco de render `{activeModule === 'dashboard-v2' &&
<DashboardTabs role={userRole} />}`. **O bloco `{activeModule === 'dashboard' && (...)}` do dashboard
antigo não foi tocado** — decisão registrada #3 mantida à risca.

**Princípios confirmados na implementação**:
- **Frontend é exclusivamente consumidor da API**: `dashboard-profile-view.tsx` só faz `fetch()` e
  renderiza o payload; nenhum componente calcula média/soma/percentual — todo valor já vem pronto do
  backend. `dashboard-widget-renderer.tsx` só decide qual componente visual usar por `widget.type`.
- **Filtro de período nunca recalcula datas no cliente**: `dashboard-period-filter.tsx` só emite
  `period`/`from`/`to` como parâmetros de querystring; a resolução real (30/90 dias, fallback) é
  inteiramente do `resolveDashboardPeriod()` da Subetapa 6 — confirmado usando `<input type="date">`
  nativo (não o `DateInput` mascarado DD/MM/AAAA já existente no projeto, que geraria ambiguidade de
  parsing com `new Date()` no backend).
- **Abas dirigidas pelo registry, não por lista fixa**: `dashboard-tabs.tsx` chama
  `getAccessibleProfiles(role)` (`dashboard-access.service.ts`, já existente desde a Subetapa 1) — o
  único dado "fixo" no componente é o mapa de rótulos amigáveis por perfil (`PROFILE_LABELS`), que é
  UI pura (nomenclatura), não uma lista de perfis.
- **Gráficos reutilizáveis e desacoplados**: `dashboard-chart.tsx` consome só a forma genérica
  `DashboardChartData` (já definida desde a Subetapa 1), sem nenhuma referência a um widget
  específico — pronto para reuso direto pela Fase 12 (Financeiro) quando ela produzir esse mesmo
  formato de dado.
- **Dashboard antigo intacto**: confirmado por diff — nenhuma linha dentro do bloco `{activeModule ===
  'dashboard' && (...)}` foi alterada.

**Estratégia de reutilização dos gráficos**: um único componente (`DashboardChart`) despacha por
`chartType` (`bar`/`donut` cobrem os 48 widgets de hoje; `line` já suporta múltiplas séries, pensado
para o Financeiro comparar receita×custo ao longo do tempo; `funnel` é aproximado como barra
horizontal). Cor por categoria usa a paleta validada pela skill de dataviz (`node
validate_palette.js` — todos os checks PASS, pior par CVD ΔE 24.2), com legenda + tooltip sempre
presentes (mitigação exigida pela própria skill para os 3 tons abaixo de 3:1 de contraste). Sem dark
mode — confirmado que o projeto não tem nenhum toggle nem CSS de tema escuro implementado hoje (só o
resíduo do template padrão do shadcn), então a paleta usa só os valores de modo claro, sem
complexidade especulativa.

**Validação visual e funcional**: `pm2 restart cozisteel-erp` para servir o novo build; app confirmado
respondendo (200) e a rota `/api/dashboard/v2/comercial` confirmada exigindo autenticação (401 sem
sessão, comportamento esperado). Aberto no navegador do usuário para validação visual da aba
"Dashboard (Novo)" — resultado da validação a ser confirmado pelo usuário.

**Impacto na suíte de testes**: nenhum teste de componente React existe neste projeto (suíte
100% Vitest/backend) — a cobertura desta camada é a validação visual/funcional acima, não testes
automatizados. **230/230 testes de backend inalterados** (nenhuma regressão no domínio).

**Achado de qualidade, disclosure obrigatória**: `npm run lint` foi de 58 para **59 warnings** — 1
novo, em `dashboard-profile-view.tsx` (`react-hooks/set-state-in-effect`, `setLoading(true)`/
`setError(false)` como primeiras linhas do `useEffect`, antes do `fetch` assíncrono). **Mesma
categoria já catalogada como débito aceito desde a Fase 13** — o padrão idêntico já existe em ~10+
funções do próprio `page.tsx` (`loadSalesOrders`, `loadClients`, etc.); refatorar só este componente
novo para fugir do warning o deixaria estruturalmente inconsistente com o resto do arquivo. Usuário
consultado explicitamente e aprovou aceitar como extensão do débito já catalogado, não como uma
regressão nova de categoria.

**Resultado**: `tsc --noEmit` limpo; `npm run lint` **59 warnings** (58 + 1, aceito e documentado
acima); `npm run build` limpo; `npm test` **230/230** (inalterado). `graphify update .` executado.

**Subetapa 7 concluída — aguardando validação visual/funcional do usuário e aprovação antes da
Subetapa 8 (descontinuação do dashboard antigo).**

### Ajuste pós-validação visual (2026-07-10)

Usuário identificou, na primeira validação visual, que alguns status apareciam em inglês/código bruto
(ex.: "approved", "cancelled") — a API devolve exatamente o valor gravado no banco (`Quote.status`,
`ProductionOrder.status`, etc.), correto para consumo programático, mas não para exibição direta.

**Correção**: criado `src/components/dashboard/dashboard-status-labels.ts` —
`DASHBOARD_STATUS_LABELS`/`translateStatusLabel()`, cobrindo todos os vocabulários de enum usados
pelos 48 widgets (`Quote`/`SalesOrder`/`ProductionOrder`/`Requisition`/`PurchaseOrder`/
`MaterialReservation`/`MrpSuggestion`/`BomRevision`.status, `StockMovement.type`,
`ProductionOrder.priority`, `Requisition.tipo`/`originModule`, `User.role`). **Os valores replicam
exatamente os rótulos já usados no dashboard antigo** (`page.tsx#requisitionStatusLabels/
purchaseOrderStatusLabels/productionStatusLabels/salesOrderStatusLabels/roleLabels`,
`src/lib/format.ts#statusLabels`) — cópia deliberada, não import, para não tocar o arquivo do
dashboard antigo (decisão registrada #3). Aplicado em `dashboard-chart.tsx` (nomes de fatia/categoria
em donut/bar/line) e `dashboard-widget-table.tsx` (qualquer célula cujo valor bata com um código
conhecido) — tradução é apresentação, não regra de negócio, por isso vive só no frontend, nunca no
backend (mesmo princípio já confirmado para o restante da Subetapa 7).

`tsc`/build limpos; `npm run lint` seguiu em 59 (sem novo warning); `pm2 restart` executado para servir
o ajuste. Aguardando nova confirmação visual do usuário.

### Ajuste de organização visual (2026-07-10, mesmo dia)

Usuário relatou que o dashboard "virou um monte de informação útil, porém jogada" — a grade única
(todos os 48 widgets misturados, só ordenados por `order`) não dava nenhuma hierarquia visual.

**Correção**: `dashboard-profile-view.tsx` agora agrupa `payload.widgets` por `type` e renderiza em 3
seções com cabeçalho (`Indicadores` → `Gráficos` → `Tabelas analíticas`) — resumo primeiro, detalhe
depois. Cards de KPI (`dashboard-widget-card.tsx`) ganharam o mesmo tratamento visual do dashboard
atual (ícone em círculo `bg-primary/10` + rótulo + valor) — **um ícone por perfil, não por widget**
(evita 48 escolhas arbitrárias de ícone e mantém a paleta de cor "quieta": só a cor de destaque única
do app, `primary`, nunca uma cor nova por card). Gráficos/tabelas continuam com um cabeçalho simples
(título do widget), já que precisam de mais espaço horizontal que um card de KPI.

Nenhuma mudança de dado/API — puramente de apresentação, consistente com o princípio "frontend só
consome, nunca recalcula" já em vigor. `tsc`/build limpos; lint seguiu em 59 (sem novo warning);
`pm2 restart` executado. Aguardando confirmação visual do usuário.
- **Depende de**: todas as Fases 1-10 (fonte de dados), ADR-016 (Financeiro — arquivado como
  levantamento aprovado, define exatamente o que ainda NÃO está disponível), ADR-013 (Rastreabilidade
  de Lote), ADR-009/010 (Requisição/Aprovação de Compras), ADR-007 (MRP), ADR-006/012 (Reserva).
- **Contexto de priorização**: em 2026-07-10 o usuário aprovou o ADR-016 e, na mesma mensagem,
  reordenou o roadmap: **Fase 11 (Dashboard e KPIs) → Consolidação de UX/UI → Correções gerais da
  implantação → só então Fase 12 (Financeiro)**. Este documento é o levantamento da Fase 11, agora a
  prioridade ativa.
- **Escopo desta rodada** (por instrução explícita): sem implementar código; sem alterar schema; sem
  criar migrations; sem expor APIs; sem criar telas; sem alterar Services/Repositories existentes; sem
  atualizar testes; sem `graphify update`. Entregáveis: as 20 seções obrigatórias abaixo.

## Metodologia

3 agentes de auditoria em paralelo, cada um consultando primeiro o graphify (quando disponível) e os
ADRs relevantes antes do código-fonte:

1. **Comercial + Diretoria + RBAC** — Quote/SalesOrder/Client/Product, e leitura completa de
   `src/app/middleware/rbac.ts`.
2. **PCP** — ProductionOrder/BOM/MRP/Reserva/Lotes-Rastreabilidade.
3. **Compras + Estoque + infraestrutura** — Requisition/PurchaseOrder/Supplier/StockMovement/
   MaterialBatch, mais o padrão de agregação já usado em `dashboard.service.ts`/`report.service.ts`,
   cache, e testes (Vitest, confirmado — não Jest).

**Achado fundamental antes de qualquer indicador**: já existe um dashboard em produção —
`src/app/services/dashboard.service.ts` (`getStats()`, 59 linhas, só dados de `Quote`: contagem/
status/receita aprovada/orçamentos recentes), `src/app/api/dashboard/stats/route.ts` (só `requireAuth()`,
sem checagem de módulo/perfil), e uma seção em `src/app/page.tsx` (~linha 2078: 4 cards + tabela). A
Fase 11 **expande e substitui** esse dashboard mínimo — não é greenfield.

---

## 1. Objetivos do Dashboard

- **Geral**: dar visibilidade operacional e gerencial tempestiva sobre os módulos já implementados
  (Comercial, PCP, Compras, Estoque), consolidando indicadores hoje só visíveis navegando entre telas
  de listagem uma a uma.
- **Específicos**:
  - Cada perfil enxerga, ao abrir o sistema, exatamente o que precisa decidir hoje (aprovações
    pendentes, atrasos, rupturas de estoque, backlog) sem precisar caçar em telas de listagem.
  - Substituir o dashboard mínimo atual (só `Quote`) por uma visão real por perfil.
  - Preparar terreno para os indicadores da Fase 12 (Financeiro) sem construir nada que precise ser
    refeito quando ela chegar — todo indicador hoje bloqueado é explicitamente marcado (Seção 4), não
    aproximado com um dado incorreto.
  - Não introduzir nenhuma consulta que degrade a experiência de uso do restante do sistema — ADR-001
    já estabelece "o ERP deve ser extremamente simples de operar, rápido, consistente".
- **Não-objetivos desta fase**: dashboards financeiros reais (Fase 12); substituir o `ReportService`
  (exportação/CSV/PDF sob demanda, caso de uso diferente); qualquer BI externo ou exportação de dados
  do dashboard em si.

## 2. Separação por perfis de usuário

O usuário pediu 7 perfis: **Diretoria, Comercial, PCP, Compras, Produção, Estoque, Administrativo**.
Confirmado por auditoria completa de `src/app/middleware/rbac.ts` (`Role` = `admin | manager | user |
viewer | comercial | producao | compras | estoque | financeiro`): **4 dos 7 perfis já têm um `Role`
correspondente 1:1** — os outros 3 não têm nenhum `Role`/`Module` equivalente hoje.

| Perfil pedido | Role real | Situação |
|---|---|---|
| Comercial | `comercial` | ✅ mapeamento direto |
| Compras | `compras` | ✅ mapeamento direto |
| Produção | `producao` | ✅ mapeamento direto |
| Estoque | `estoque` | ✅ mapeamento direto |
| **Diretoria** | nenhum | ⚠️ candidatos ambíguos: `admin` (tem `manage` em quase tudo) e `manager` (visão ampla, sem `manage` de usuários/sistema) têm hoje permissões de módulo quase idênticas |
| **PCP** | nenhum | ⚠️ é uma visão transversal (Produção + MRP + Requisição/Compras + demanda Comercial) — não existe Role nem Module dedicado; `producao` sozinho não cobre MRP/Compras |
| **Administrativo** | nenhum | ⚠️ o mais ambíguo dos 3 — pode significar back-office genérico ou "quem administra o sistema" (`admin`+`sistema`+`configuracoes`+`usuarios`) |

`User.role` no schema é `String @default("user")` (sem enum de banco) — adicionar um novo valor de Role
seria uma mudança de baixíssimo risco a nível de dado, mas **o usuário decidiu não fazer isso**: os 7
perfis do Dashboard são **compostos apenas na camada de Dashboard**, sem tocar `rbac.ts` nem criar
nenhum Role novo — o modelo de permissões existente permanece 100% preservado.

**Mapeamento aprovado (2026-07-10)** — implementado como tabela de dados em
`src/app/services/dashboard-access.service.ts` (Subetapa 1), nunca como `if`/`switch` espalhado:

| Perfil do Dashboard | Roles com acesso | Composição de conteúdo (quais widgets aparecem) |
|---|---|---|
| **Diretoria** | `admin`, `manager` | União de todos os widgets de todos os outros perfis |
| **Comercial** | `comercial`, `admin`, `manager` | Só widgets de Comercial |
| **Compras** | `compras`, `admin`, `manager` | Só widgets de Compras |
| **Produção** | `producao`, `admin`, `manager` | Só widgets de Produção |
| **Estoque** | `estoque`, `admin`, `manager` | Só widgets de Estoque |
| **PCP** | `producao`, `admin`, `manager` | Produção + Estoque + MRP + Engenharia (união de widgets já existentes desses domínios — nenhuma lógica duplicada) |
| **Administrativo** | `admin` | Usuários/Auditoria/Sistema — nunca inclui indicadores financeiros, mesmo depois que a Fase 12 existir |

`producao` acessar o perfil PCP é consistente com o RBAC já existente (o papel `producao` já tem
`estoque: ['read']` na tabela de permissões, confirmado pela auditoria). `admin`/`manager` têm acesso a
todos os perfis individuais além de "Diretoria" — é assim que a Diretoria efetivamente "acessa todos os
dashboards": abrindo cada aba individualmente ou a aba consolidada.

O `type Role` **duplicado e desatualizado** em `src/app/page.tsx:54` (só 4 valores, não usado no
dropdown real de seleção) continua um achado registrado — não bloqueia a Fase 11, mas deve ser
alinhado quando a Subetapa 8 (frontend) tocar essa área.

## 3. Indicadores já possíveis hoje (dados existentes)

Catálogo completo por módulo — cada indicador cita modelo/campo Prisma exato, tipo de agregação, e se
há índice de apoio (achados completos de performance na Seção 11).

### 3.1 Comercial / Diretoria

| Indicador | Fonte | Agregação |
|---|---|---|
| Orçamentos por status | `Quote.status` | `groupBy` + `count` (indexado) |
| Pedidos de venda por status | `SalesOrder.status` | `groupBy` + `count` (indexado) |
| Faturamento aprovado (mês/semana/ano) — **na verdade valor negociado, não caixa** | `Quote.total`/`SalesOrder.total` filtrado por período | `aggregate _sum` |
| Taxa de conversão Orçamento→Pedido | `count(Quote status=approved)` vs `count(SalesOrder)` via `quoteId` | 2 counts |
| Ticket médio (orçamento/pedido) | `total` | `aggregate _avg` |
| Top N clientes por valor | `SalesOrder.clientId`+`total` | `groupBy` + `_sum`, orderBy, limit |
| Top N produtos mais vendidos/orçados | `SalesOrderItem`/`QuoteItem` `productId`+`quantity`/`total` | `groupBy` + `_sum` |
| Clientes/produtos ativos vs. inativos | `Client.active`/`Product.active` | `count` (indexado) |
| Orçamentos vencidos (aberto + `validUntil` no passado) | `Quote.validUntil` (⚠️ `String`, não `DateTime`) | filtro em memória |
| Tempo médio "criação→aprovação" | `Quote.createdAt`/`approvedAt` (campo direto já existe) | cálculo derivado |
| Tempo médio "aprovação→conversão em Pedido" | `Quote.approvedAt` vs `SalesOrder.createdAt` (join por `quoteId`) | cálculo derivado |
| Tempo médio em cada status (Orçamento/Pedido) | `StatusHistory` (`entityType='quote'`/`'sales_order'`, confirmado gravado) | cálculo em memória, sem agregação SQL nativa |
| Distribuição por vendedor (`userId`) | `Quote.userId`/`SalesOrder.userId` | `groupBy` |
| Clientes novos no período | `Client.createdAt` | `count` |

### 3.2 PCP (Produção + MRP + Reserva + Lotes)

| Indicador | Fonte | Agregação |
|---|---|---|
| OPs por status (planned/in_progress/paused/completed/cancelled) | `ProductionOrder.status` | `groupBy` + `count` (indexado) |
| OPs atrasadas | `ProductionOrder.dueDate` (⚠️ `String`, sem parser confiável — mesma limitação já documentada no ADR-007) | filtro em memória |
| WIP (quantidade em produção) | `quantity - quantityCompleted` das OPs `in_progress` | soma calculada em app |
| Backlog por produto | `sum(quantity - quantityCompleted)` groupBy `productId` | agregação em app |
| OPs por prioridade | `priority` | `groupBy` |
| Rodadas de produção parcial por OP | `ProductionOrderExecution` groupBy `productionOrderId` | `count` (indexado) |
| Cobertura de reserva / % shortfall | `MaterialReservation` — preferir `Material.reservedQty`/`Product.reservedQty` (já denormalizados) a somar a tabela-filha | leitura O(1) por item |
| Sugestões MRP pendentes/aceitas/descartadas | `MrpSuggestion.status` | `groupBy` (⚠️ sem índice em `status` hoje) |
| Proporção compra vs. produção (MRP) | `MrpSuggestion.suggestionType` | `groupBy` (indexado) |
| Resumo da última execução MRP | `MrpRun` (campos já denormalizados: `totalSuggestions`, `totalPurchaseSuggestions`, etc.) | leitura direta O(1) |
| Volume de matéria-prima recebida / produto produzido por período | `MaterialBatch.receivedAt`/`ProductBatch.producedAt` | agregação por período (⚠️ sem índice isolado nessas colunas) |
| Adoção de lote (`lotControlled`) | `Material.lotControlled`/`Product.lotControlled` | `count` |
| Revisões de BOM aguardando liberação | `BomRevision.status` | `groupBy` (indexado) |

### 3.3 Compras

| Indicador | Fonte | Agregação |
|---|---|---|
| Requisições por status/tipo/origem | `Requisition.status`/`tipo`/`originModule` | `groupBy` (`status` indexado; `tipo`/`originModule` não) |
| Tempo de ciclo da requisição (criação→"ordered") | `StatusHistory` (`entityType='requisition'`, confirmado gravado) | cálculo em memória |
| % itens atendidos por estoque vs. comprados | `RequisitionItem.quantityFromStock`/`quantityToPurchase` | `aggregate _sum` (nota: requisições `originModule='mrp'` sempre têm `quantityFromStock=0` por regra de negócio — segmentar por origem para não distorcer) |
| Pedidos de compra por status (8 estados, ADR-010) | `PurchaseOrder.status` | `groupBy` (indexado) |
| **Aprovações pendentes agora** | `PurchaseOrder.status='pending_approval'` | `count` (seek direto, muito leve) |
| Tempo em cada etapa do PO | `PurchaseOrder.createdAt/approvedAt/sentAt/confirmedAt/receivedAt` (todos existem) | cálculo em memória (⚠️ sem índice nas colunas de data) |
| Performance de fornecedor (prazo prometido × real) | `RequisitionItemQuote.leadTimeDays`/`Supplier.leadTimeDays` vs. `createdAt→receivedAt` | cálculo por fornecedor |
| Valor total de PO por status/fornecedor | `PurchaseOrder.total` | `groupBy` + `_sum` (indexado) |
| Taxa de vitória por fornecedor (cotação) | `RequisitionItemQuote.isSelected` | `count`/`groupBy` |

### 3.4 Estoque

| Indicador | Fonte | Agregação |
|---|---|---|
| Saldo atual por material/produto | `Material.stockQty`/`Product.stockQty` | leitura direta O(1) |
| **Materiais com estoque baixo** | `Material.stockQty <= Material.minStockQty` (campo já existe e já é usado em `stock.service.ts`) | filtro em memória |
| Reservado / a caminho / em produção | `Material.reservedQty/onOrderQty/inProductionQty` (já denormalizados) | leitura direta |
| Volume de movimentações por tipo (IN/OUT/ADJUST/RESERVE/RELEASE) por período | `StockMovement.type`+`createdAt` | `groupBy` (⚠️ `type` sem índice próprio, mas `createdAt` indexado ajuda o corte de período) |
| Materiais mais consumidos/movimentados | `StockMovement.materialId`, `type='OUT'` | `groupBy` + `_sum` |
| Lotes próximos do vencimento | `MaterialBatch.expiresAt` | filtro (⚠️ sem índice; e `expiresAt` é raramente preenchido hoje — FIFO por `receivedAt` é a estratégia real, FEFO nunca usado) |
| Saldo valorizado em quantidade (só materiais `lotControlled`) | `MaterialBatch.quantityAvailable` groupBy `materialId` | `groupBy` + `_sum` |
| Ajustes de inventário | `StockMovement.type='ADJUST'` | `count`/`groupBy` |

### 3.5 Administrativo (proposta mínima)

| Indicador | Fonte |
|---|---|
| Usuários ativos por papel | `User.role`/`active` |
| Volume de ações de auditoria por módulo/período | `AuditLog.module`/`createdAt` (indexado) |
| Sequências de numeração (próximo número por tipo de documento) | `NumberSequence` |
| Últimas execuções de patch/sistema | `PatchLog` |

## 4. Indicadores dependentes do Financeiro (Fase 12) — explicitamente bloqueados

Confirmado por leitura direta do schema pelos 3 agentes, de forma independente (mesma conclusão do
ADR-016): **zero campo monetário em `ProductionOrder`, `ProductBatch`, `BatchConsumption`,
`StockMovement`**. Portanto, NÃO são possíveis hoje:

- Margem real de venda (receita − custo real de produção).
- Custo real de produção por OP, custo de mão-de-obra, overhead, eficiência de custo.
- Valor de WIP em R$ (só é possível em quantidade, item 3.2).
- Valorização de estoque em R$ (só é possível em quantidade, item 3.4) — `MaterialBatch.unitCost`
  existe e é confiável, mas usá-lo hoje seria uma decisão de escopo antecipada da Fase 12, não um dado
  ausente; **recomendação: não usar nesta fase**, para não expor um número parcial (só matéria-prima
  direta, nunca mão-de-obra/overhead) como se fosse a valorização completa.
- Saldo a receber/a pagar, inadimplência, fluxo de caixa projetado — nenhuma entidade de título
  financeiro existe (`AccountReceivable`/`AccountPayable` são só propostas no ADR-016).
- Qualquer indicador por Centro de Custo (`CostCenter` nunca foi criado, ADR-008).
- Faturamento reconhecido (nota fiscal) — `SalesOrder.total` é valor do pedido, não valor faturado/
  recebido.

**Atenção de nomenclatura**: o card "Faturamento" do dashboard atual (soma de `Quote.total` aprovados)
é um proxy comercial (valor negociado), não uma métrica financeira de caixa — a Fase 11 deve renomear
para algo como "Valor Aprovado em Orçamentos" para não sugerir que é receita reconhecida, isso já é uma
UX enganosa a ser corrigida.

## 5. Organização por módulos

Estrutura proposta (abas, mesma navegação lateral já existente em `page.tsx`):

```
Dashboard
├── Diretoria      (visão consolidada — resumo de todos os módulos abaixo)
├── Comercial      (Orçamentos/Pedidos de Venda)
├── PCP            (Produção/MRP/Reserva/Lotes)
├── Compras        (Requisições/Pedidos de Compra/Fornecedores)
├── Estoque        (Saldo/Movimentações/Lotes)
└── Administrativo (Usuários/Auditoria/Sistema)
```

Cada aba visível conforme a Seção 2 (perfil do usuário logado). A aba ativa por padrão ao abrir o
sistema é a do próprio perfil do usuário (ex.: um usuário `compras` abre direto na aba Compras), com a
Diretoria como aba adicional só para `admin`/`manager`.

## 6. Cards principais (por aba)

| Aba | Cards |
|---|---|
| Diretoria | Orçamentos abertos, Pedidos de venda em produção, OPs atrasadas, Aprovações de compra pendentes, Materiais com estoque baixo |
| Comercial | Total de orçamentos, Taxa de conversão, Ticket médio, Valor aprovado no mês |
| PCP | OPs em andamento, OPs atrasadas, WIP total, Sugestões MRP pendentes |
| Compras | Aprovações pendentes, Requisições em aberto, Tempo médio de ciclo (requisição), Valor total de PO no mês |
| Estoque | Materiais com estoque baixo, Movimentações no mês, Lotes vencendo (quando preenchido), Saldo reservado total |
| Administrativo | Usuários ativos, Ações de auditoria no mês, Próximos números de sequência |

## 7. Gráficos

| Gráfico | Aba | Tipo | Dado |
|---|---|---|---|
| Distribuição de status (Orçamento/OP/PO/Requisição) | todas | Barra/rosca | `groupBy status` |
| Faturamento/valor aprovado ao longo do tempo | Comercial/Diretoria | Linha | `Quote`/`SalesOrder` por período |
| Funil de conversão Orçamento→Pedido | Comercial | Funil | contagens por etapa |
| Volume de produção por período | PCP | Linha/barra | `ProductBatch`/`StockMovement IN` por período |
| Compra vs. produção (MRP) | PCP | Rosca | `MrpSuggestion.suggestionType` |
| Movimentação de estoque por tipo | Estoque | Barra empilhada | `StockMovement.type` por período |
| Tempo médio por etapa do Pedido de Compra | Compras | Barra horizontal | deltas de `approvedAt/sentAt/confirmedAt/receivedAt` |

## 8. Tabelas analíticas

- **Diretoria**: nenhuma tabela própria — links diretos para as tabelas das outras abas.
- **Comercial**: Orçamentos recentes (já existe); Top clientes; Top produtos.
- **PCP**: OPs atrasadas; Sugestões MRP pendentes com origem (quais OPs contribuíram).
- **Compras**: Aprovações de compra pendentes (com tempo de espera); Requisições em aberto.
- **Estoque**: Materiais com estoque baixo (saldo vs. mínimo); Lotes vencendo.
- **Administrativo**: Últimas ações de auditoria.

## 9. Filtros globais

- **Período** (data inicial/final) — aplica-se a todo indicador baseado em `createdAt`/período; default
  sugerido: mês corrente, para não puxar o histórico inteiro de tabelas com crescimento ilimitado por
  padrão (ver Seção 11/12).
- **Aba/perfil ativo** — já é a navegação por módulo existente, não um filtro adicional de UI.
- Filtros adicionais **por aba**, não globais: vendedor (Comercial), fornecedor (Compras), material
  (Estoque) — fora do escopo de "filtro global" pedido, mas registrados aqui para não perder o desenho.

## 10. Consultas necessárias

Mapeamento 1:1 de cada card/gráfico/tabela das Seções 6-8 para a query Prisma exata já está feito nas
tabelas da Seção 3 (coluna "Fonte"/"Agregação") — não duplicado aqui para evitar divergência entre duas
listas do mesmo dado. Toda consulta deve ser **explicitamente escopada por período quando aplicável**
(Seção 12) e nunca ler uma tabela de crescimento ilimitado sem filtro de data ou status.

## 11. Impacto de performance

Achados consolidados dos 3 agentes:

- **Tabelas com crescimento genuinamente ilimitado, sem purge/arquivamento**: `MrpSuggestion`/
  `MrpSuggestionSource` (nova geração a cada execução MRP, histórico nunca substituído),
  `ProductionOrderExecution`, `MaterialBatch`/`ProductBatch`/`BatchConsumption`, `StatusHistory`,
  `StockMovement`, `AuditLog`. Qualquer indicador que rode sobre a tabela inteira, sem escopo, tende a
  ficar mais lento à medida que o ERP acumula anos de uso — não é um problema hoje (volume atual
  pequeno), mas é estrutural.
- **Campos sem índice de apoio, hoje exigindo varredura completa** (catálogo consolidado): `Requisition.
  tipo`/`originModule`; `PurchaseOrder.approvedAt/sentAt/confirmedAt/receivedAt/cancelledAt` (todas as 5
  colunas de data de transição); `StockMovement.type` (isolado, sem `createdAt` no filtro);
  `MaterialBatch.expiresAt`; `MaterialBatch.receivedAt`/`ProductBatch.producedAt` isolados (só existe
  índice composto `[materialId, receivedAt]`, que não serve para "todos os materiais por período");
  `ProductionOrder.createdAt`; `ProductionOrderExecution.createdAt`; `MrpSuggestion.status`.
- **`StatusHistory` é hoje só escrita** — nenhum código lê a tabela além de `record()`. Todo indicador
  de "tempo médio de ciclo"/"tempo em cada status" é código novo, e o cálculo em si (parear transições
  consecutivas por `entityId`) é feito em memória — não existe uma agregação SQL nativa de "tempo entre
  dois eventos". Isso é uma limitação estrutural do modelo, não um índice faltando.
- **Campos denormalizados já existem e são mais baratos que recalcular**: `Material.reservedQty/
  onOrderQty/inProductionQty` (evita somar `MaterialReservation`), `ProductionOrder.quantityCompleted`
  (evita somar `ProductionOrderExecution`), `MrpRun.totalSuggestions/totalPurchaseSuggestions/
  totalProductionSuggestions/openOrdersConsidered` (evita somar `MrpSuggestion` por execução),
  `Material.minStockQty` (comparação direta, sem agregação).
- Datas de negócio como `Quote.date`/`ProductionOrder.date`/`ProductionOrder.dueDate`/`Requisition.date`
  são **`String`, não `DateTime`** — qualquer filtro/ordenação por essas colunas é feito em memória
  (mesma limitação já documentada no ADR-007 para `MrpSuggestion.neededByDate`). `createdAt`/`updatedAt`
  (sempre `DateTime`) devem ser preferidos para qualquer corte de período no Dashboard.
- Nenhuma biblioteca de cache existe hoje no projeto (confirmado em `package.json` — sem redis/
  node-cache/lru-cache). Todo `report.service.ts` hoje carrega a tabela inteira em memória e filtra em
  JS — padrão **explicitamente desaconselhado** para KPIs de Dashboard (que são recarregados com muito
  mais frequência que um relatório sob demanda).

## 12. Estratégia para evitar consultas pesadas

1. **Sempre escopar por período** (`createdAt >= inícioDoRange`) em qualquer indicador histórico —
   nunca uma varredura sem limite inferior de data. Default de período curto (mês corrente) na
   primeira carga; o usuário amplia via filtro (Seção 9) só quando precisar.
2. **Preferir campos denormalizados já mantidos pelo sistema** (listados na Seção 11) a agregações
   sobre tabelas-filha, sempre que o indicador for "estado atual" em vez de "histórico".
3. **Adicionar os índices identificados como faltantes** (catálogo da Seção 11) antes de implementar
   os indicadores que dependem deles — migração aditiva de baixo risco, não implementada nesta rodada
   (fica registrada como parte da Subetapa 1 do plano, Seção 19).
4. **Nunca calcular "tempo médio de ciclo" via `StatusHistory` a cada carregamento de página** — ver
   estratégia de atualização (Seção 13): esses indicadores são candidatos a cache/pré-cálculo, não a
   consulta ao vivo.
5. **Nenhuma consulta do Dashboard deve fazer join implícito com mais de 2-3 tabelas sem filtro
   seletivo** — os indicadores de "performance de fornecedor" (Seção 3.3) são o caso mais pesado
   identificado; escopar sempre por fornecedor específico ou por período curto, nunca "todos os
   fornecedores, todo o histórico" numa única chamada.

## 13. Estratégia de atualização dos dados

Proposta híbrida, dado que **não existe nenhuma infraestrutura de cache ou agendador (cron) no
projeto hoje** (confirmado: nenhuma dependência de scheduler em `package.json`, `ecosystem.config.cjs`
só roda o processo Next.js, sem job agendado):

- **Cards de "estado atual"** (contagens por status, aprovações pendentes, estoque baixo) — cálculo
  sob demanda a cada carregamento da aba; são consultas indexadas e baratas (Seção 11), não precisam de
  cache.
- **Indicadores históricos/pesados** (tempo médio de ciclo via `StatusHistory`, rankings "Top N",
  séries temporais de vários meses) — cache em memória do processo Node, **TTL de 30-60 segundos
  (aprovado)**, recalculado na primeira requisição após expirar. Sem Redis, sem scheduler, sem
  WebSocket, sem tempo real (todos explicitamente descartados para esta fase) — só um utilitário
  genérico (`src/app/lib/dashboard-cache.ts`, `getOrCompute(key, ttlSeconds, computeFn)`) com uma
  `Map` em memória do processo, keyed pelo `id` do widget.
- **Atualização manual**: botão "Atualizar" em cada aba, que ignora o cache e força recálculo — cobre o
  caso em que o usuário sabe que acabou de mudar algo e quer ver refletido na hora.
- **Sem tempo real** (WebSocket/SSE) — não justificado pela escala atual do ERP (uso interno, poucos
  usuários simultâneos); reavaliar só se o padrão de uso mudar.
- Evolução futura possível (fora do escopo desta fase): materializar os indicadores mais pesados em
  uma tabela de snapshot, recalculada por um job agendado — exigiria introduzir uma dependência de
  scheduler que não existe hoje; não recomendado para o MVP da Fase 11.

## 14. Estrutura de Services e Repositories

Redesenhada para atender o **Princípio Arquitetural Permanente — Dashboard Modular por Widgets** (ver
seção própria abaixo): em vez de um Service monolítico por perfil, cada widget é uma unidade
independente registrada num catálogo, e o "Service de perfil" só filtra e compõe — nunca duplica
lógica entre perfis que compartilham conteúdo (ex.: PCP reaproveita os mesmos widgets de Produção/
Estoque/Engenharia, nunca uma cópia). Mantendo a convenção plana já usada no projeto (sem subpastas):

```
src/app/dto/dashboard.ts               (tipos de Widget/DTO — Seção 15)
src/app/lib/dashboard-cache.ts          (utilitário genérico de cache em memória com TTL)
src/app/repositories/dashboard.repository.ts
                                        (helpers genéricos de consulta — ex.: filtro de período —
                                         sem regra de negócio, mesmo espírito de
                                         batch-traceability.repository.ts)
src/app/services/dashboard-access.service.ts
                                        (tabela perfil→Roles da Seção 2 + getAccessibleProfiles(role))
src/app/services/dashboard-widgets.service.ts
                                        (catálogo/registro de widgets — cada widget é uma função
                                         independente com metadado {id, perfil(s) de origem, "caro"?};
                                         getDashboard(profile, from, to) filtra o catálogo pelos
                                         widgets cujo(s) perfil(is) de origem incluem o perfil pedido,
                                         computa cada um — aplicando cache só nos marcados "caro" — e
                                         devolve DashboardWidgetDTO[])
```

Widgets específicos de cada domínio (Comercial, PCP/Produção/Estoque/MRP/Engenharia, Compras) são
adicionados ao catálogo nas Subetapas 2-6 do plano (Seção 19) — a Subetapa 1 entrega só a
infraestrutura acima, com o catálogo vazio (pronto para receber widgets, zero conteúdo de negócio
ainda). Nenhum Service de domínio existente (`ProductionOrderService`, `RequisitionService`, etc.) é
alterado — o Dashboard só lê, nunca escreve, e nunca decide regra de negócio, mesmo princípio de
`ReportService`/`batch-traceability.service.ts`. **O `dashboard.service.ts`/`/api/dashboard/stats`
atuais não são tocados** — o novo Dashboard é construído em paralelo (decisão registrada #3).

## 15. DTOs internos

Desenhados como **array de widgets**, não campos fixos por perfil — consequência direta do princípio
de modularidade (Seção própria): adicionar/remover/reordenar um widget nunca muda a forma do contrato,
só o conteúdo do array. Mesma disciplina de DTO interno (não acoplado a tela/API futura) já usada em
`batch-traceability.service.ts`:

```ts
type DashboardWidgetType = 'card' | 'chart' | 'table'
type DashboardProfile = 'diretoria' | 'comercial' | 'pcp' | 'compras' | 'producao' | 'estoque' | 'administrativo'

interface DashboardCardData { value: number | string; hint?: string }
interface DashboardChartData {
  chartType: 'bar' | 'line' | 'donut' | 'funnel' // tipos suportados pelo Recharts (decisão #4)
  series: { label: string; data: { x: string; y: number }[] }[]
}
interface DashboardTableData {
  columns: { key: string; label: string }[]
  rows: Record<string, unknown>[]
}

interface DashboardWidgetDTO {
  id: string            // chave estável, ex: "comercial.total-orcamentos" — usada para cache e,
                         // no futuro, para ocultar/reordenar/personalizar por usuário
  type: DashboardWidgetType
  title: string
  order: number          // posição padrão sugerida; reordenável no futuro sem mudar o contrato
  data: DashboardCardData | DashboardChartData | DashboardTableData
}

interface DashboardPayloadDTO {
  profile: DashboardProfile
  widgets: DashboardWidgetDTO[]
}
```

## 16. Preparação para APIs futuras

- Uma única rota parametrizada por perfil, `/api/dashboard/v2/[profile]/route.ts` (nome provisório,
  evita colisão com a rota atual — decisão registrada #3 mantém `/api/dashboard/stats` intocada),
  chamando `requireAuth()` + `requireModulePermission('dashboard', 'read')` **e** validando via
  `dashboard-access.service.ts` que o `Role` do usuário tem acesso ao perfil pedido (Seção 2). A rota
  atual (`/api/dashboard/stats`) não faz nenhuma checagem de módulo hoje — achado de segurança leve,
  registrado na Seção de Achados, corrigido só na rota nova, sem tocar a antiga.
- A rota nova aceita querystring `?from=&to=` para o filtro de período global (Seção 9).
- Quando o novo Dashboard for validado e a rota atual descontinuada (decisão registrada #3), a rota
  `v2` perde a razão de existir com esse nome — renomear para `/api/dashboard/[profile]` fica marcado
  como tarefa de limpeza da subetapa que fizer a descontinuação, não desta.

## 17. Preparação para interface React futura

- DTO já moldado para consumo direto: o frontend itera `widgets: DashboardWidgetDTO[]` e renderiza
  cada item por `type` — um `switch(widget.type)` único decide entre `KpiCard` (reaproveitando
  `Card`/`CardContent` do shadcn/ui já usados no dashboard atual), `ChartWidget` (**Recharts**, decisão
  #4 — biblioteca oficial do projeto a partir de agora, nenhuma solução própria), ou `AnalyticTable`
  (reaproveitando `Table`/`TableSkeleton`/`EmptyTableRow`, já existentes desde a Fase 13). Essa
  renderização por `type`, e não por nome de campo fixo, é o que torna trivial no futuro ocultar,
  reordenar ou adicionar um widget sem tocar no componente de renderização.
- Estrutura de abas reaproveita a navegação lateral por módulo já existente em `page.tsx`
  (`activeModule`), sem novo padrão de navegação.
- Filtro de período global vira um componente único compartilhado entre as abas, não duplicado por
  perfil.
- `widget.order` já viabiliza um `sort()` simples hoje (posição fixa) e uma futura tela de
  personalização (arrastar/ocultar) sem mudar o contrato do DTO.

## Princípio Arquitetural Permanente — Dashboard Modular por Widgets (registrado 2026-07-10)

O usuário formalizou este princípio como parte da aprovação do ADR-017, para valer durante toda a
implementação da Fase 11 e em qualquer evolução futura do Dashboard:

> O Dashboard deve nascer preparado para ser totalmente modular. Cada card, gráfico, indicador ou
> tabela deve ser tratado como um widget independente. Mesmo que nesta fase ainda não exista
> personalização pelo usuário, a arquitetura deve permitir futuramente: ocultar widgets; reorganizar
> posições; adicionar novos widgets; dashboards personalizados por usuário; dashboards personalizados
> por perfil.

Esse princípio já molda as Seções 14/15/17 acima (catálogo de widgets independente, DTO em array com
`id`/`order` estáveis, renderização por `type`) — é arquitetura, não implementação desta fase: nenhuma
tela de personalização, drag-and-drop, ou preferência por usuário é construída na Fase 11. O que é
construído é a garantia de que adicionar essa camada depois não vai exigir redesenhar o contrato de
dados nem o catálogo de widgets.

## Princípio Arquitetural Permanente — Separação Apresentação/Domínio (registrado 2026-07-10, aprovação da Subetapa 3)

> O Dashboard deve manter separação completa entre apresentação e domínio: **Frontend → API →
> Dashboard Service → Repository → Domínio.** Nenhum componente de interface deve consultar banco ou
> conter regra de negócio.

Já era a prática desde a Subetapa 1 (rota só valida RBAC e delega; `dashboard-widgets.service.ts`
compõe; `dashboard.repository.ts` só consulta) — formalizado aqui como princípio permanente para
guiar as Subetapas 3-8: nenhum widget futuro escreve no banco, nenhuma lógica de negócio (cálculo de
custo, validação de transição de status, etc.) é reimplementada dentro do Dashboard — sempre lida do
domínio já existente (Reserva, Produção Parcial, StatusHistory, Lotes, MRP), nunca recalculada.

## 18. Fluxograma completo de funcionamento

```
Usuário abre o Dashboard
    │
    ▼
Frontend determina abas visíveis (RBAC: Role do usuário → perfis permitidos, Seção 2)
    │
    ▼
Aba ativa default = perfil do próprio usuário (ou "Diretoria" se admin/manager)
    │
    ▼
GET /api/dashboard/{perfil}?from=&to=
    │
    ▼
requireAuth() + requireModulePermission('dashboard','read') + checagem de perfil
    │
    ▼
Dashboard{Perfil}Service.getStats(from, to)
    │
    ├── indicadores "estado atual" → DashboardRepository (consulta direta, sempre)
    │
    └── indicadores "históricos/pesados" → cache em memória (TTL) → se expirado,
        recalcula via DashboardRepository e atualiza o cache
    │
    ▼
Monta DTO (cards/charts/tables já no formato de consumo da UI)
    │
    ▼
Frontend renderiza KpiCard[] + ChartWidget[] + AnalyticTable[]
    │
    ▼
Usuário pode: (a) mudar o filtro de período → nova chamada; (b) clicar "Atualizar" →
    força recálculo ignorando cache; (c) trocar de aba → nova chamada para outro perfil
```

## 19. Plano de implementação em subetapas

1. **Infraestrutura** — índices recomendados (migração aditiva, baixo risco); DTOs/tipos de widget
   (Seção 15); utilitário genérico de cache (Seção 13); `dashboard-access.service.ts` (tabela
   perfil→Roles, Seção 2); `dashboard-widgets.service.ts` (catálogo de widgets, vazio nesta subetapa);
   `dashboard.repository.ts` (helpers genéricos); rota `v2` de plumbing (sem widgets reais ainda). O
   Dashboard atual não é tocado.
2. **Dashboard Comercial** — primeiros widgets reais no catálogo (Seção 3.1), consumidos pelo perfil
   `comercial`.
3. **Dashboard PCP/Produção/Estoque** — widgets de Produção/MRP/Reserva/Lotes/Estoque (Seções 3.2/3.4),
   compartilhados entre os perfis `producao`, `estoque` e `pcp` via o catálogo único (nenhuma
   duplicação de lógica entre os três).
4. **Dashboard Compras** — widgets da Seção 3.3.
5. **Dashboard Diretoria** (união de todos os widgets já registrados) + **Administrativo** (widgets da
   Seção 3.5).
6. **Filtro de período global** aplicado uniformemente a todos os widgets já registrados.
7. **Frontend**: substituir a seção atual do `page.tsx` por abas por perfil, usando Recharts para os
   gráficos e reaproveitando componentes já existentes (`Card`, `Table`, `TableSkeleton`,
   `EmptyTableRow`) — renderização por `widget.type` (Seção 17).
8. **Descontinuação do dashboard atual** — só após validação completa do novo (decisão registrada #3),
   incluindo a limpeza de nomenclatura da rota `v2` (Seção 16).

Cada subetapa exige validação explícita do usuário antes de avançar para a próxima (não avançar
automaticamente) — relatório obrigatório ao final de cada uma: resumo técnico, impactos de arquitetura,
cobertura de testes, resultado de `tsc --noEmit`/`npm run lint`/`npm run build`/`npm test`, atualização
de ADR-017, atualização de ADR-001, atualização obrigatória do Graphify (Princípio 12, ADR-001).

Cada subetapa segue a disciplina já estabelecida no projeto: implementação, testes, `graphify update .`,
atualização do ADR-001 — retomada normalmente a partir da aprovação deste levantamento (a restrição de
não rodar `graphify update` é só desta rodada de levantamento).

## 20. Lista de testes necessários

- **Por `Dashboard{Perfil}Service`**: teste de integração contra o banco de teste (Vitest, padrão já
  usado no projeto — `tests/helpers/fixtures.ts`), seedando dados conhecidos e verificando que cada
  card/gráfico/tabela retorna o valor esperado (contagens, somas, médias).
- **Casos de borda**: banco vazio (nenhum dado no período — cards devem retornar 0, não erro); período
  sem nenhum registro; `Quote.validUntil`/`ProductionOrder.dueDate` em formato inesperado (dado o campo
  ser `String`).
- **RBAC por perfil**: teste que um usuário `comercial` não consegue chamar `/api/dashboard/pcp` (ou
  equivalente, conforme a decisão pendente #1 definir o mapeamento exato de perfil→Role).
- **Cache**: teste que o TTL expira e recalcula corretamente; teste que o botão "Atualizar" força
  recálculo mesmo com cache válido.
- **Performance/regressão**: nenhum teste de carga formal previsto nesta fase (fora de escopo), mas
  cada novo índice proposto (Seção 11) deve ter um teste simples confirmando que a query usa o índice
  esperado (via `EXPLAIN QUERY PLAN` do SQLite, se o projeto já tiver esse padrão — confirmar antes de
  introduzir um novo).
- Mesma disciplina de sempre: `tsc --noEmit`/lint/build limpos antes e depois de cada subetapa.

---

## Decisões registradas (aprovadas pelo usuário, 2026-07-10)

1. **Mapeamento de perfil** (Seção 2): composição só na camada de Dashboard, sem Roles novos, sem
   tocar `rbac.ts` — tabela perfil→Roles aprovada e documentada na Seção 2.
2. **TTL do cache**: 30-60 segundos, só em memória (sem Redis/scheduler/WebSocket/tempo-real nesta
   fase) — Seção 13.
3. **Dashboard atual** (`dashboard.service.ts`/`/api/dashboard/stats`/seção do `page.tsx`):
   **preservado sem nenhuma alteração** durante toda a Fase 11, construído em paralelo pelo novo
   Dashboard. Só descontinuado após validação completa do novo — reduz risco e permite comparação
   direta entre os dois durante a transição.
4. **Biblioteca de gráfico**: **Recharts**, aprovada como oficial do projeto — nenhuma solução própria.
5. **Princípio arquitetural permanente**: Dashboard modular por widgets — ver seção própria acima,
   incorporada ao desenho das Seções 14/15/17.

## Achados registrados (débito técnico/observações, não bloqueadores)

- `type Role` duplicado e desatualizado em `src/app/page.tsx:54` (só 4 valores, não usado no dropdown
  real de seleção de papel) — não bloqueia a Fase 11, mas deve ser removido/alinhado quando o mapeamento
  de perfil (decisão pendente #1) for implementado, para não haver dois lugares divergentes definindo
  `Role`.
- `src/app/api/dashboard/stats/route.ts` hoje só chama `requireAuth()`, sem `requireModulePermission`
  nem checagem de perfil — qualquer usuário autenticado recebe o payload inteiro. Corrigir junto da
  Subetapa 2 (não é uma vulnerabilidade crítica hoje, já que o payload atual não expõe dado sensível
  fora do que o próprio usuário já vê em Orçamentos, mas é a base para a segregação por perfil).
  Achado, portanto, já detalhado com contexto suficiente para não precisar reabrir investigação depois.
- `ADR-012-reconciliacao-reserva-multinivel.md` tem um achado em aberto na sua própria seção de
  fechamento sobre `releaseMany()` (cancelamento de OP podendo sobrescrever `status` de reservas já
  `consumed`) que não foi completamente revisitado nesta auditoria (leitura parcial, até a linha 699 de
  855) — recomenda-se conferir esse ponto antes de formalizar o indicador "distribuição de status de
  reserva" (Seção 3.2) na implementação, para garantir que o dado esteja correto.
- Confirmado (não é lacuna): `Material.minStockQty` já existe e já é usado para o alerta de estoque
  baixo — o levantamento inicial suspeitava que esse campo pudesse não existir; a auditoria confirmou
  que existe.
