# ADR-024 — Centro de Operações: Tela Única de Início

- **Status**: Fase 1 implementada e testada
- **Data**: 2026-07-28
- **Origem**: o mesmo mockup "Centro de Operações" que já havia sido a origem do ADR-023 (governança/
  fechamento de fluxo) — o usuário pediu explicitamente "um layout com funcionalidades e aparência
  parecida". O ADR-023 construiu a **substância** por trás do mockup (estorno, faturamento, MRP, BOM
  formal, alçadas, expedição, fechamento mensal); ninguém ainda havia construído a **tela** em si.

## PARTE 0 — Como este levantamento foi feito

Pesquisa dirigida (agente Explore) sobre o Dashboard v2 existente (ADR-017/ADR-019): tipos, catálogo
de widgets, componentes de UI, RBAC/perfis, e os 2 itens do ADR-023 que já tinham auditado partes
deste mockup ("Meu trabalho hoje", item 7; "linha do tempo cruzada", item 8) mas ficaram
deliberadamente sem posição fixa no roadmap. Achado central: **o ADR-023 já tinha mapeado o que faltava
para "Meu trabalho hoje" e a travessia entre documentos — este ADR não revisita essas decisões, só as
referencia** (RBAC decide "responsável", nunca um campo de atribuição novo).

## PARTE 1 — O que já existia vs. o que é novo

| Seção do mockup | Existia? | Reaproveitado | Novo |
|---|---|---|---|
| 1. Pipeline Orçamento→Financeiro | Não | `getAllAlerts()`/contagens já calculáveis por módulo | Cálculo do pipeline em si (`centroOperacoesService.getPipelineStages()`) |
| 2. Alertas com causa/sugestão/Resolver/bookmark | Parcial | `DashboardAlertCard`, `DashboardAlertData`, severidade, "Resolver agora" | Causa/sugestão por alerta, bookmark, painel lateral (Fase 2) |
| 3. "Meu trabalho hoje" | Não (auditado no ADR-023 §7) | `getAllAlerts()` (7 categorias) | ~5 categorias novas + composição em tabela (Fase 3) |
| 4. KPI tiles com tendência + "Ver detalhes" | Mostly exists | `DashboardCardData.trend` (infra pronta, nunca preenchida), `DashboardModuleSummaryCard` ("Ver mais →") | Tendência período-a-período real (Fase 1: **não** implementada, ver Parte 5) |
| 5. "Destaques do dia" | Não | Mesmos dados dos widgets já existentes | Componente + síntese de texto (Fase 3/4) |
| 6. Painel "Como resolver" + atalhos relacionados | Não | — | Serviço de travessia entre documentos (já esboçado no ADR-023 §8), painel novo (Fase 4) |

## PARTE 2 — Decisões tomadas (usuário, 2026-07-28)

### Decisão #1 — Escopo da tela

**Decisão tomada**: tela única compartilhada por todo mundo (não uma aba a mais só pra quem já via a
síntese entre módulos).

**Justificativa**: o mockup mostra o pipeline inteiro (Orçamento→Financeiro) e uma central de
alertas — isso só faz sentido como ponto de entrada universal, não como mais um perfil especializado.

**Consequência**: `centro-operacoes` virou um `DashboardProfile` acessível aos 9 papéis do RBAC (não
um Role novo — mesmo princípio já registrado no ADR-017, "nenhuma mudança em `rbac.ts`"), primeiro na
lista `DASHBOARD_PROFILES` — e por isso a aba padrão/ativa ao abrir o Dashboard, para qualquer papel.
As abas por perfil existentes (Diretoria, Comercial, PCP, Compras, Produção, Estoque, Administrativo,
Financeiro) continuam existindo, intocadas, para quem quiser o analítico completo de um domínio.

**Fora de escopo agora**: filtrar o CONTEÚDO do pipeline por permissão (ex.: um perfil `estoque` não
vendo a etapa "Financeiro") — a Fase 1 mostra o pipeline inteiro pra todo mundo, informativo; só os
alertas (que já eram filtrados por módulo antes) continuam levando à ação real.

### Decisão #2 — Ritmo de entrega

**Decisão tomada**: por fases, começando pelo que reaproveita mais.

**Consequência**: roadmap de 4 fases (Parte 6). Esta rodada entrega a Fase 1 inteira.

## PARTE 3 — Arquitetura da Fase 1

Nenhuma migração de schema. Tudo em cima do Dashboard v2 existente (ADR-017/019):

- **Pipeline** (`centro-operacoes.service.ts::getPipelineStages()`): 6 contagens por status/data,
  cálculo novo mas simples — deliberadamente **fora** do catálogo de widgets
  (`dashboard-widget-catalog.ts`), mesmo precedente já usado por `getPendingRequisitionsWidget()`
  (não é um indicador de um domínio, é uma contagem que atravessa todos eles).
- **Central de Alertas**: reaproveita `getAllAlerts()` sem nenhuma mudança — mesma função que já
  alimenta o sino de notificações e a Diretoria.
- **KPIs operacionais** (`getOperationalKpis()`): reaproveita 4 widgets já existentes do catálogo
  (`producao.ops-atrasadas`, `compras.aprovacoes-pendentes`, `estoque.materiais-baixo-estoque`, e um
  novo `financeiro.contas-vencidas`), reempacotados no formato `DashboardModuleSummaryDTO` (mesmo do
  "Resumo por Módulo" da Diretoria) para ganhar de graça o botão "Ver detalhes"/"Ver mais".
- **`financeiro.contas-vencidas`** (único widget novo): mesma definição de "vencido" já usada em
  `financialReportService.getAccountBalances()` (`dueDate < agora`, título ainda em aberto) — aqui
  como CONTAGEM de títulos (a pagar + a receber), não soma monetária (a soma já existe no KPI
  `financeiro.saldo-liquido-em-aberto`).
- **Rota**: `/api/dashboard/[profile]` (já existente) passa a interceptar `profile === 'centro-operacoes'`
  antes de chamar `getDashboard()`, no mesmo padrão que `'diretoria'` já usa — nenhuma rota nova.
- **UI**: `DashboardCentroOperacoesView` (nova) monta `DashboardPipelineBreadcrumb` (novo) +
  `DashboardAlertCenter` (reaproveitado) + `DashboardModuleSummaryCard` × 4 (reaproveitado). Sem
  filtro de período — pipeline/KPIs são retrato do agora, não uma agregação por intervalo.

## PARTE 4 — Definições de cada etapa do pipeline (decisões de modelagem, não pedidas explicitamente pelo usuário — documentadas para revisão)

| Etapa | Definição | Severidade |
|---|---|---|
| Orçamento | `Quote.status IN (draft, sent)` | sempre `info` |
| Pedido | `SalesOrder.status = open` | `warning` se > 0 |
| Produção | `ProductionOrder.status = in_progress` | sempre `info` |
| Compra | `Requisition.status = sent` + `PurchaseOrder.status IN (draft, pending_approval)` | `warning` se > 0 |
| Entrega | `Shipment.scheduledDate < agora` AND `status NOT IN (delivered, cancelled)` | `critical` se > 0 |
| Financeiro | `AccountReceivable`/`AccountPayable` com `status IN (open, partially_paid)` e `dueDate < agora` | `critical` se > 0 |

## PARTE 5 — Fora de escopo desta fase, deliberado

**Tendência período-a-período (setas "↑3 vs ontem") não implementada.** `DashboardCardData.trend` já
existe desde o ADR-019 (infraestrutura pronta, nunca preenchida por nenhum widget) — populá-la de
verdade exigiria reconstruir "o valor de ontem" por métrica: para `OPs atrasadas`/`Contas vencidas`
isso é razoavelmente reconstruível a partir de datas já gravadas (`dueDate`/`createdAt`); para
`Estoque crítico` **não há nenhum histórico de saldo** (`stockQty` é mutável, sem snapshot) — não dá
pra saber com confiança quantos itens estavam abaixo do mínimo ontem. Como uma abordagem por métrica
arriscava números aproximados/inconsistentes entre os 4 tiles, a Fase 1 mostra o valor atual sem seta
de tendência em nenhum dos 4 — mais honesto que inventar 3 tendências reais e 1 fabricada.

## PARTE 6 — Roadmap (fases seguintes, ainda não implementadas)

- **Fase 2** — Causa/sugestão por alerta: estender `DashboardAlertData` com campos opcionais
  `causa`/`sugestao`, populados por widget (lógica específica de domínio); bookmark/salvar alerta.
- **Fase 3** — "Meu trabalho hoje": ~5 categorias novas de alerta pessoal (compras atrasadas,
  recebimentos esperados, títulos vencendo, cadastros incompletos, documentos devolvidos) + "Destaques
  do dia"; responsável sempre resolvido por RBAC (decisão já registrada no ADR-023 §7), nunca um campo
  de atribuição novo.
- **Fase 4** — Painel lateral "Como resolver": serviço novo de travessia entre documentos
  (Orçamento→Pedido→OP→Requisição→Compra→...→Financeiro, já esboçado no ADR-023 §8) + UI do painel com
  passos numerados, "Abrir documento", "Ver histórico", "Atalhos relacionados".

## Verificação (Fase 1)

tsc limpo, lint 56→57 (+1 real, mesmo padrão de fetch-em-efeito já aceito em toda a iniciativa —
`dashboard-centro-operacoes-view.tsx`), 411/411 testes (6 novos em `centro-operacoes.test.ts`, mais 1
teste pré-existente atualizado em `dashboard-widgets-infra.test.ts` — a lista de perfis acessíveis por
Role mudou de propósito, já que `centro-operacoes` agora aparece para todos), build limpo. **Fase 1 do
ADR-024 completa.**
