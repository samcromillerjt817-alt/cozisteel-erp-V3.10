# ADR-018 — Fase 11.5: Plataforma Frontend (ex-"Consolidação UX/UI do ERP")

- **Status**: **APROVADO conceitualmente (2026-07-13), com as 7 decisões da Seção 3 e o plano de
  execução da Seção 6. Implementação autorizada, subetapa a subetapa, mesma disciplina de toda fase
  anterior — cada subetapa exige validação explícita antes da próxima.**
- **Nome**: o usuário sugeriu renomear de "Consolidação UX/UI" para algo que refletisse melhor o
  objetivo real ("Plataforma Frontend" ou "Modernização da Interface"). Escolhido **"Plataforma
  Frontend"** — nome mantido junto do número **11.5** (não "Fase 12"): "Fase 12" já é o Financeiro
  Integrado (ADR-016, aprovado-arquivado) e "Fase 13" já foi usada e encerrada (Padronização UX/UI,
  ADR-014/015) — renumerar exigiria tocar documentação histórica de fases já fechadas. Decisão do
  usuário, via pergunta direta: manter 11.5, só trocar o rótulo.
- **Datas**: registro original 2026-07-10 (só diretrizes) → levantamento completo 2026-07-13 → decisões
  e plano de execução aprovados 2026-07-13 (mesmo dia).
- **Relação com trabalho anterior — não redigitar**: ver Seção 1 do levantamento original (preservada
  abaixo, Seção 2) — Fase 13 (ADR-014/015) já deixou 9 componentes de formulário + 8 de domínio + tokens
  de status; Fase 11 (Dashboard, ADR-017/019) já validou a arquitetura de referência (severidade
  decoupled, `kind: alert|kpi|detail`, Ação→Resumo→Análise) que esta fase generaliza para o ERP inteiro.

---

## 0.1 Componibilidade (aprovada, permanente, refina a diretriz da Seção 0)

Não basta cada componente da camada `platform` ser reutilizável — eles precisam ser **componíveis**:
qualquer página do ERP se monta encaixando blocos (`PageHeader`, `KpiRow`, `AlertCenter`, `FilterBar`,
`DataTable`, `DetailDrawer`, `FormDialog`, `EmptyState`, `LoadingState`) **sem que um componente
conheça o outro internamente**. `DataTable` não importa `FilterBar`; `PageHeader` não importa
`DataTable`; a composição acontece só na página que os usa, nunca dentro de um componente chamando
outro. Isso já foi seguido por construção na 11.5.2 (`DataTable` expõe um slot `toolbar` genérico,
nunca importa `FilterBar`) — agora é regra explícita para toda a camada.

**Estrutura padrão de página, atualizada e definitiva** (substitui as 6 camadas da Seção 1 — mesmo
espírito, 2 camadas novas opcionais inseridas):

```
PageHeader
   ↓
KPI Row (opcional)
   ↓
Alert Center (opcional)
   ↓
FilterBar
   ↓
DataTable
   ↓
DetailDrawer ou FormDialog
```

Isso vira a identidade visual do ERP inteiro. `KpiRow`/`AlertCenter` aqui são a generalização, para a
camada `platform`, do que já existe hoje só dentro do Dashboard (`DashboardKpiRow`/
`DashboardAlertCenter`, Fase 11) — **promoção ainda não feita**, fica registrada como item pendente do
plano de execução (Seção 6), não incluída no escopo literal da Subetapa 11.5.3 (que o usuário definiu
como `FilterBar`+`PageHeader`+`DetailDrawer`). `FormDialog` já existe (Fase 13) e é reaproveitado sem
alteração. `EmptyState`/`LoadingState` generalizados (fora do contexto de uma tabela) também ficam
pendentes, mesmo tratamento.

**Regra de consistência daqui em diante**: nenhum módulo novo cria componente próprio se já existir um
equivalente em `platform`. A pergunta correta é sempre "existe um componente de plataforma que resolve
isso?" — se existir, reutiliza; se não existir, ele nasce em `platform`, nunca dentro de um módulo
específico.

## 0. Diretriz principal desta fase (aprovada, permanente)

> "Não quero mais desenvolver telas. Quero desenvolver componentes reutilizáveis."

Antes de construir qualquer coisa nesta fase — e, por extensão, em qualquer trabalho de frontend
futuro no Cozisteel ERP — a primeira pergunta é sempre: **"já existe um componente que resolve isso?"**
Se sim, reutiliza. Se não, cria-se um componente reutilizável (nunca uma solução amarrada a uma tela
específica). Nenhuma subetapa do plano da Seção 6 constrói algo "só para o módulo X" — todo componente
nasce testável isoladamente, antes de ser aplicado a qualquer tela real.

Isso muda a unidade de entrega desta fase: não é "migrar a tela de Clientes", é "construir/estender o
componente Y, e então aplicá-lo a Clientes como primeiro consumidor real."

---

## 1. Página padrão (estrutura aprovada, 6 camadas explícitas)

```
┌────────────────────────────────────────────────────────────────┐
│ 1. Header da página (título, contexto)                          │
├────────────────────────────────────────────────────────────────┤
│ 2. KPIs rápidos (quando fizer sentido — nem todo módulo precisa) │
├────────────────────────────────────────────────────────────────┤
│ 3. Ações principais (ex.: "Novo Cliente")                        │
├────────────────────────────────────────────────────────────────┤
│ 4. Filtros                                                        │
├────────────────────────────────────────────────────────────────┤
│ 5. Tabela                                                         │
├────────────────────────────────────────────────────────────────┤
│ 6. Painel lateral ou modal de detalhes                            │
└────────────────────────────────────────────────────────────────┘
```

Cada camada é um componente independente e reutilizável (`PageHeader`, `PageKpiStrip`, ações via slot
do próprio `PageHeader`, `FilterBar`, `DataTable`, `DetailDrawer`) — nenhuma camada é obrigatória (a
camada 2 é explicitamente opcional, "quando fizer sentido"), mas a ORDEM e a IDENTIDADE visual de cada
camada são as mesmas em qualquer módulo, para que o usuário reconheça imediatamente onde está — o
mesmo objetivo que já guiou a Fase 11 (Ação→Resumo→Análise) generalizado para o ERP inteiro.

---

## 2. Achados da auditoria (preservados do levantamento original, 2026-07-13)

*(Conteúdo integral do levantamento de 4 agentes — estrutura de navegação, layout dos 12+ módulos,
inventário do Design System existente, jornada por perfil — preservado sem alteração nas subseções
2.1-2.5 abaixo; é a base factual sobre a qual as decisões da Seção 3 e o plano da Seção 6 se apoiam.)*

### 2.1 Arquitetura de navegação atual
Zero roteamento Next.js real — `activeModule` é estado React puro (`page.tsx:157`), sem sincronização
de URL. Refresh sempre volta ao Dashboard. Breadcrumb estático de profundidade fixa, não clicável.
Busca do cabeçalho decorativa (sem `value`/`onChange`). Notificações sem lógica de severidade. Nenhum
command palette, favoritos ou recentes, apesar de `src/components/ui/command.tsx` já estar instalado e
nunca usado. Dois Dashboards coexistindo. Colisões de ícone no menu (`Users`/`FileText`/
`LayoutDashboard` duplicados entre itens diferentes).

### 2.2 Jornada por perfil
"Administrativo" e "Diretoria" não são Roles de login — sempre `admin`/`manager` com CRUD total. Os 4
perfis departamentais reais (`comercial`/`producao`/`compras`/`estoque`) enxergam módulos sem
correspondência com seu dia a dia (ruído de menu, não bloqueio). MRP exposto no Dashboard sem tela
própria de ação.

### 2.3 Layout dos módulos
0 de 12 módulos com KPI de abertura de tela. Só 2 de 11 modais usam `FormDialog`. Dois padrões
incompatíveis de filtro de status (Tabs vs. Select). Paginação real ausente em 3 módulos. Relatórios
foge de todo o padrão de tabela (HTML cru, sem skeleton/empty/paginação). Configurações é um 4º padrão
estrutural (sem modal, mistura Table/Cards/formulário solto). Drill-down implementado de 3 formas
diferentes e não padronizadas.

### 2.4 Design System existente
9 componentes de formulário + 8 de domínio já construídos (Fase 13) — reaproveitar sem alteração.
Gaps reais: `DataTable` nunca construído (0/16 tabelas); dark mode **não existe de fato** (achado
novo, não é "incompleto" — zero bloco `.dark{}`, `next-themes` instalado e nunca conectado); sem escala
tipográfica formal; 3 sistemas de cor paralelos (tema shadcn, `status-tokens.ts`, paleta de gráficos do
Dashboard) nunca unificados; `openEditClient` ainda zera campos reais ao editar Cliente (bug de perda
de dado, catalogado desde a Fase 13, nunca corrigido).

### 2.5 Benchmark (princípios, não aparência)
SAP Fiori (launchpad curado por papel ≈ o Dashboard por perfil já construído), Odoo (breadcrumb real +
smart-buttons ligando entidades relacionadas ≈ promover KPI/alerta do Dashboard para dentro de cada
módulo), ERPNext (listagem/formulário padronizados por convenção de framework ≈ `DataTable`/
`FilterBar` únicos), Linear (command palette como navegação primária), Notion (sidebar recolhível +
favoritos/recentes + estados vazios que guiam a próxima ação), Jira (painel lateral de detalhe sem
perder contexto da lista ≈ `DetailDrawer`).

---

## 3. Decisões (resolvidas pelo usuário, 2026-07-13 — não reabrir sem novo pedido explícito)

| # | Tema | Decisão |
|---|---|---|
| 1 | **Dark mode** | **Não implementar nesta fase.** Mas todo token novo do Design System (cor, espaçamento, etc.) nasce como variável de tema (CSS custom property, como o app já faz no `:root` do shadcn), nunca hardcoded — só o valor do tema escuro (`.dark{}`) fica de fora. Nenhum componente novo lê uma cor/valor fixo diretamente; sempre lê o token. Isso é o que torna "preparado para múltiplos temas no futuro" sem gastar esforço implementando o segundo tema agora. |
| 2 | **`DataTable`** | **Aprovado — um dos itens mais importantes da fase.** Componente único, substituindo as 16 implementações de tabela divergentes. API já desenhada para suportar paginação, ordenação, filtros, seleção, ações por linha, estados vazio/loading, responsividade — mesmo que a maioria dos consumidores iniciais só use um subconjunto dessas capacidades. |
| 3 | **Roteamento real** | **Aprovado em princípio, mas fora desta fase — vira uma fase própria** (registrada na Seção 7, mesmo tratamento que esta fase recebeu em 2026-07-10: só registro, sem levantamento ainda). Dentro da Fase 11.5, regra transversal: todo componente de módulo migrado nasce autocontido (props explícitas, sem depender de closures/estado global de `page.tsx`) — preparação passiva para a extração futura, sem construir nenhuma rota agora. |
| 4 | **RBAC (Administrativo/Diretoria)** | **Não criar Roles artificiais.** Administrativo e Diretoria continuam sendo visões do Dashboard, nunca papéis de autenticação. Uma eventual necessidade de permissões específicas fica para uma evolução própria do RBAC, fora desta fase — tratado como limitação conhecida, documentada, não resolvida aqui. |
| 5 | **Tela de MRP** | **Fora do escopo.** Fase 11.5 é consolidação visual — nenhum módulo funcional novo entra no plano. |
| 6 | **Busca global** | **Aprovada, escopo inicial**: Clientes, Produtos, Materiais, Fornecedores, Orçamentos, Pedidos, **Produção** (7 entidades — o usuário incluiu Produção além da proposta original de 6). Cresce depois. |
| 7 | **`openEditClient` (bug de perda de dado)** | **Aprovado — corrigir junto com a migração do módulo onde aparece** (Clientes, primeira migração real do plano). Regra geral adotada: todo bug conhecido encontrado durante a migração de um módulo é corrigido na mesma subetapa, nunca carregado para a nova interface. |

---

## 4. Design System — ajustado pelas decisões acima

Tudo da proposta original (Seção 4 do levantamento) permanece válido, com 2 ajustes:
- **Cores/tokens**: formalizados como CSS custom properties desde o primeiro componente novo — mesmo
  padrão que o tema shadcn já usa em `:root`, só que agora aplicado de forma consistente em `status-
  tokens.ts` (já é assim) e na paleta de gráficos do Dashboard (promovida a paleta oficial do ERP,
  também como tokens). Nenhum valor de cor hardcoded em componente novo.
- **`DataTable`**: vira o item de maior esforço da fase (Decisão 2) — ver desenho de API na Seção 6,
  Subetapa 2.

---

## 5. Navegação — ajustada pelas decisões acima

Tudo da proposta original (Seção 6 do levantamento) permanece válido, com 1 ajuste: breadcrumb por
registro e deep-linking real seguem dependendo de roteamento real (Decisão 3) — permanecem fora desta
fase, e a fase de Roteamento Real (Seção 7) é quem eventualmente os resolve. Sidebar recolhível, busca
global (7 entidades, Decisão 6), command palette e notificações com severidade seguem no escopo desta
fase, viáveis sem roteamento real.

---

## 6. Plano de execução incremental (aprovado — substitui o plano de 6 estágios do levantamento original)

Módulos pequenos, cada um com entrega + checkpoint de validação explícita antes do próximo — mesma
disciplina de toda subetapa já usada nas Fases 10/11. Nenhuma subetapa altera uma rota de backend.

| Subetapa | Entrega | Checkpoint |
|---|---|---|
| **11.5.1** | Fundação de tokens: formalizar cores/tipografia/espaçamento como CSS custom properties (tema claro populado, `.dark{}` reservado mas vazio); unificar a paleta de gráficos do Dashboard como paleta oficial do ERP | tsc/lint/build — zero mudança visual (só a fonte da verdade dos valores muda de lugar) |
| **11.5.2** | `DataTable` v1 — componente isolado, testado com dado fixo (fixture), ainda não usado por nenhuma tela real. API cobre: colunas, paginação, ordenação, filtro (slot), seleção de linha, ações por linha, estado vazio, estado de loading, responsividade | Validação visual do componente isolado (página de demonstração ou Storybook-like), antes de qualquer módulo real usá-lo |
| **11.5.3** | `FilterBar`, `PageHeader` (com slot de KPI e slot de ação principal separados), `DetailDrawer` — componentes isolados, mesmo tratamento da 11.5.2 | Validação visual isolada de cada um |
| **11.5.4** | `CommandPalette` (wrapper sobre `command.tsx` já instalado) — só ações de navegação entre módulos por enquanto (sem busca de dado ainda) | Validação visual + funcional (abrir com Cmd/Ctrl+K, navegar) |
| **11.5.5** | Busca global — endpoint agregando as 7 entidades da Decisão 6 + UI usando o `CommandPalette` da 11.5.4 como superfície | Validação funcional (buscar e navegar até o registro) |
| **11.5.6 — piloto** | Migrar **Clientes** de ponta a ponta para o template de 6 camadas (usando `PageHeader`+`FilterBar`+`DataTable`+`DetailDrawer` reais pela primeira vez) + corrigir `openEditClient` na mesma subetapa (Decisão 7) | Validação visual completa — este é o checkpoint mais importante: prova que o template funciona de ponta a ponta antes de propagar |
| **11.5.7** | Propagar para os módulos CRUD simples: Produtos, Materiais, Fornecedores, Usuários | Validação visual por módulo (ou em lote, a combinar) |
| **11.5.8** | Módulos com drill-down pesado: Requisições+Cotação, Compras+Recebimento, Produção — migrar de dialog aninhado para `DetailDrawer` | Validação visual, atenção especial a não perder nenhuma ação hoje disponível dentro dos dialogs atuais |
| **11.5.9** | Normalização final: Relatórios (sai do HTML cru para `DataTable`) e Configurações (unifica as 5 sub-abas no mesmo padrão) | Validação visual |
| **11.5.10** | Shell de navegação: sidebar recolhível, breadcrumb clicável, notificações com severidade (reaproveitando `DashboardAlertData`) | Validação visual + funcional |
| **11.5.11** | QA de responsividade transversal (mesmo gap que a Fase 11 deixou pendente na sua própria Subetapa 7.6, agora estendido ao ERP inteiro) | Validação em pelo menos 2 tamanhos de tela |
| **11.5.12** | **Registrada em 2026-07-14** (achado de planejamento — Orçamentos/Pedidos/Estoque nunca tinham subetapa própria): migrar Orçamentos, Pedidos de Venda e Estoque para o mesmo padrão dos demais módulos | Validação visual + funcional, mesmo cuidado das subetapas de drill-down (11.5.8) |

Cada subetapa mantém `tsc`/lint/build/test limpos antes e depois, atualização deste ADR + ADR-001 +
Graphify, relatório e aprovação explícita do usuário antes da próxima começar — sem exceção, mesmo
quando a subetapa "parecer pequena".

---

## 7. Fase futura registrada — Roteamento Real (Next.js App Router)

Por decisão do usuário (Decisão 3): roteamento real é necessário e aprovado em princípio, mas "altera a
arquitetura da aplicação e merece uma fase própria" — registrada aqui só como **objetivo futuro**, sem
levantamento nem número de fase definitivo ainda (mesmo tratamento que a própria Fase 11.5 recebeu em
2026-07-10). Não iniciar nenhum levantamento ou implementação desta fase futura sem autorização
explícita, e só depois que a Fase 11.5 estiver concluída (os componentes migrados nesta fase nascem
propositalmente extraíveis para facilitar essa transição depois, ver Decisão 3).

---

## 8. O que fica fora desta fase (confirmado, não esquecido)

- Tela dedicada de MRP (Decisão 5).
- Nova Role de RBAC para Administrativo/Diretoria (Decisão 4).
- Dark mode implementado de fato (Decisão 1 — só a arquitetura de tokens fica pronta).
- Roteamento real (Decisão 3 — vira fase própria, Seção 7).

---

## Próximos passos

Plano aprovado. Início autorizado pela **Subetapa 11.5.1** (fundação de tokens) — mesma disciplina de
relatório + validação explícita antes de cada subetapa seguinte.

## Subetapa 11.5.1 — Fundação de tokens (implementada, 2026-07-13)

Zero mudança visual esperada — só a fonte da verdade dos valores muda de lugar/formalização.

- **Cores**: nenhum token de UI precisou mudar (o tema shadcn em `globals.css:55-88` já era 100% CSS
  custom properties). O que era realmente 3 sistemas paralelos virou 2: os 5 slots `--chart-1..5` do
  scaffold shadcn (nunca consumidos por nenhuma classe `bg-chart-*`/`text-chart-*` em todo o código —
  confirmado por grep) foram **substituídos** pelos 8 tokens `--chart-cat-1..8`, com os mesmos valores
  hex já validados pela skill `dataviz` para o Dashboard — agora documentados como a paleta categórica
  **oficial do ERP**, não mais exclusiva do Dashboard.
- **Promoção de arquivo**: `src/components/dashboard/dashboard-chart-palette.ts` → `src/lib/erp-chart-
  palette.ts` (`DASHBOARD_CHART_PALETTE` → `ERP_CHART_PALETTE`), único import atualizado
  (`dashboard-chart.tsx`). O array TS continua sendo o valor real consumido pelo Recharts (evita
  depender de leitura de CSS custom property em tempo de execução, frágil e desnecessária já que dark
  mode não está sendo implementado agora) — as variáveis CSS são a documentação/preparação, mantidas em
  sincronia manualmente via comentário cruzado nos dois arquivos.
- **Dark mode (Decisão 1)**: bloco `.dark {}` reservado, vazio, com comentário explicando que os tokens
  já existentes tornam o preenchimento futuro um trabalho isolado (não requer tocar componente algum).
- **Tipografia**: escala formal documentada (comentário em `globals.css`, sem classe nova) — Título de
  página/Subtítulo de seção/Rótulo de destaque/Corpo/Legenda mapeados para classes Tailwind já
  existentes, para acabar com a escolha ad-hoc de tamanho por tela quando os componentes da Subetapa
  11.5.3 (`PageHeader` etc.) forem construídos.

`tsc`/lint(59, sem novo)/build/test (237/237) limpos, `pm2 restart` executado — nenhuma regressão
visual esperada nem observada nos testes. **Subetapa 11.5.1 concluída — próxima é 11.5.2 (`DataTable`
v1, isolado).**

## Subetapa 11.5.2 — `DataTable` v1 (implementada, 2026-07-13)

Tratada como componente de **plataforma**, não "mais uma tabela" — nova pasta `src/components/
platform/` (distinta de `domain/`, específico da Fase 13, e `dashboard/`, específico da Fase 11) para
as peças compartilhadas que esta fase constrói.

**Requisitos obrigatórios do usuário — todos implementados de verdade** (não só preparados):
paginação (reaproveita `PaginationBar`), ordenação (clique no cabeçalho, ciclo asc→desc→nenhum),
seleção de linha + "selecionar todos da página", ações por linha (menu `DropdownMenu`), **ações em
lote reais** (barra aparece quando há seleção, mesmo sem nenhum consumidor real ainda — pedido
explícito do usuário), estado de carregamento (reaproveita `TableSkeleton`), estado vazio (reaproveita
`EmptyTableRow`), mensagem de erro (novo, inline, ícone + texto), colunas configuráveis (`columns` é um
array simples), renderização customizada de célula (`cell: (row) => ReactNode`), badges/indicadores via
célula customizada (demonstrado com `StatusBadge`), responsividade real (`hideBelow` esconde coluna de
apoio abaixo de um breakpoint, além da rolagem horizontal já herdada do primitivo `Table`).

**Decisão de escopo registrada no próprio código**: filtros NÃO são construídos dentro do `DataTable` —
isso é responsabilidade da `FilterBar` (Subetapa 11.5.3); o `DataTable` expõe um slot `toolbar` (acima
da tabela) onde ela vai se encaixar, mantendo a separação de responsabilidades da diretriz "componentes,
não telas".

**Extensibilidade — não implementada, mas não impedida** (conforme pedido): ocultar/exibir colunas
(`columns` já é array, trivial de filtrar por fora depois), redimensionar colunas (`width` é só a
largura inicial, não impede um handle de arrasto depois), persistência de preferência do usuário
(estado de paginação/ordenação/seleção já é controlado pelo chamador — primitivos serializáveis,
prontos para persistir), exportação (o slot `toolbar` já comporta um botão futuro; `rows`/`columns` já
são estruturas de dado simples consumíveis por fora), virtualização (linhas renderizadas por `.map()`
simples, cada uma sua própria função — substituível por uma lista virtualizada sem mudar a API pública).
Nenhum prop morto foi criado para essas capacidades.

**Validação isolada** (`src/app/dev/datatable/page.tsx`, protegida por sessão, dado fixo — os 4
cenários pedidos, cada um numa aba): Simples (3 colunas, ordenação, seleção, ações por linha e em lote,
paginação real); Muitas colunas (9 colunas, 3 com `hideBelow`); Estados (alterna carregando/vazio/erro/
normal via botões); Responsivo (mesma tabela larga, orientação para redimensionar a janela). Nenhum
módulo real foi tocado — zero mudança visual em qualquer tela existente.

`tsc`/lint(59, sem novo — 2 erros novos de `react/no-unescaped-entities` encontrados e corrigidos antes
do commit)/build/test (237/237) limpos, `pm2 restart` executado. **Aguardando validação do usuário na
página `/dev/datatable` antes de prosseguir para a Subetapa 11.5.3 (`FilterBar`/`PageHeader`/
`DetailDrawer`).**

## Subetapa 11.5.3 — `PageHeader`, `FilterBar`, `DetailDrawer` (implementada, 2026-07-13)

3 componentes novos em `src/components/platform/`, cada um com responsabilidade única, nenhum
importando os outros dois nem o `DataTable` (componibilidade, ADR-018 §0.1):

- **`PageHeader`**: título + descrição + slot `actions` (ações principais). Não sabe nada de KPI,
  alerta, filtro ou tabela.
- **`FilterBar`**: só o layout de 1 linha (com quebra em telas pequenas) para controles de filtro
  arbitrários passados como `children` — reaproveita `SearchInput`/`Select`/`Checkbox` já existentes,
  nunca reimplementa um controle de filtro. `onClear` opcional para "Limpar filtros".
- **`DetailDrawer`**: painel lateral (`Sheet` do shadcn) para qualquer drill-down — título, descrição,
  `children` livre, `footer` opcional para ações. Substitui os 3 mecanismos de drill-down incompatíveis
  encontrados na auditoria original (seções dentro do dialog de edição; segundo dialog dedicado;
  navegação para sub-view).

**Página de exemplo completa** (`src/app/dev/exemplo-pagina/page.tsx`, protegida por sessão, dado
fixo) — modelada no módulo Materiais (a combinação de filtro mais rica encontrada na auditoria: busca +
categoria + checkbox "só baixo estoque"), demonstrando a composição real: `PageHeader` (título +
"Novo Material") → `FilterBar` (busca+select+checkbox) → `DataTable` (ordenação, seleção, ação em
lote, ação "Ver detalhes" por linha, paginação) → `DetailDrawer` (abre ao clicar "Ver detalhes",
mostra os campos do material). Serve como referência visual literal para a migração real de Materiais
na Subetapa 11.5.7 — a mesma composição de filtros será reaproveitada, não reinventada.

**Registrado como pendente, não incluído nesta subetapa** (ADR-018 §0.1): promoção de `DashboardKpiRow`/
`DashboardAlertCenter` (hoje específicos da Fase 11) para `KpiRow`/`AlertCenter` genéricos na camada
`platform`; generalização de `EmptyState`/`LoadingState` fora do contexto de uma tabela. `FormDialog`
já existe (Fase 13) e não precisou de nenhuma mudança.

`tsc`/lint(59, sem novo)/build/test(237/237) limpos, `pm2 restart` executado. Nenhum módulo real
tocado. **Aguardando validação do usuário em `/dev/exemplo-pagina` antes de prosseguir para a
Subetapa 11.5.4 (`CommandPalette`).**

## Subetapa 11.5.4 — `CommandPalette` (implementada, 2026-07-13)

`src/components/platform/command-palette.tsx` — wrapper sobre `command.tsx` (primitivo shadcn/cmdk já
instalado e nunca usado, achado da auditoria original). Responsabilidade única: abre com Cmd/Ctrl+K (o
próprio componente escuta o atalho) ou por controle externo (`open`/`onOpenChange`, para um futuro
botão no header), e lista comandos agrupados (`groups`) fornecidos por quem o monta — não sabe de onde
vêm os comandos nem para onde navegam (`onSelect` decidido inteiramente por fora, componibilidade do
ADR-018 §0.1). Escopo confirmado: só ações de navegação nesta subetapa, sem busca de dado (fica para
quando a busca global, Subetapa 11.5.5, existir).

Página de validação `/dev/command-palette` (protegida por sessão) — 8 comandos de navegação fictícios
(Dashboard/Clientes/Produtos/Materiais/Produção/Orçamentos/Compras/Estoque), botão manual "Abrir busca
rápida" além do atalho de teclado, e um indicador textual de qual comando foi executado por último —
nenhum módulo real conectado ainda (a integração real com o menu do ERP é a Subetapa 11.5.10).

`tsc`/lint(59, sem novo)/build/test(237/237) limpos, `pm2 restart` executado. **Aguardando validação
do usuário em `/dev/command-palette` (testar Ctrl+K / Cmd+K e o botão manual) antes de prosseguir para
a Subetapa 11.5.5 (busca global).**

## Subetapa 11.5.5 — Busca global (implementada, 2026-07-13)

**Backend**: `src/app/services/search.service.ts` (seguindo o padrão Route→Service já estabelecido no
resto do ERP — a versão inicial tinha a lógica direto na rota, corrigido antes de fechar a subetapa) +
rota fina `GET /api/search?q=` (`src/app/api/search/route.ts`, só auth+parse+delega ao service).
7 entidades (Decisão 6 do ADR-018, escopo confirmado pelo usuário incluindo Produção além da proposta
original de 6): Clientes, Produtos, Materiais, Fornecedores, Orçamentos, Pedidos de Venda, Produção.
Cada entidade só entra no resultado se `checkPermission(user, module, 'read')` for verdadeiro — a busca
nunca vaza um tipo de dado que o usuário não veria navegando pelo menu (reaproveita o RBAC já existente,
nenhuma regra nova). `pedidos` reaproveita a permissão de `orcamentos`, mesmo remapeamento manual já
usado por `canAccess('pedidos')` no frontend. Consulta mínima de 2 caracteres, até 5 resultados por
tipo, busca por `contains` nos mesmos campos que cada listagem de módulo já usa hoje (sem inventar
critério novo).

**Frontend**: `CommandPalette` (Subetapa 11.5.4) ganhou um prop aditivo `onQueryChange` (não quebra o
consumidor existente) — a página de validação `/dev/command-palette` agora also busca ao vivo em
`/api/search` com debounce (`useDebouncedValue`, já existente), populando um grupo "Resultados da
busca" dinâmico ao lado do grupo "Navegação" fixo. A busca global em si não tem componente próprio —
usa o `CommandPalette` como superfície, exatamente como planejado.

**Testes**: `tests/search-service.test.ts`, 5 casos novos — consulta curta devolve vazio; admin
encontra as 7 entidades por um termo distintivo comum; label/sublabel corretos (Cliente usa
`tradeName` quando existe); `moduleKey` de Pedido de Venda é `pedidos` (não `orcamentos`, apesar de
reaproveitar a permissão); e o caso mais importante — **RBAC real**: perfil Estoque nunca recebe
resultado de Orçamento/Pedido de Venda (sem permissão de leitura nesse módulo), mas continua recebendo
Material (com permissão). 242/242 testes totais.

`tsc`/lint(59, sem novo — 1 warning novo de `react-hooks/set-state-in-effect` encontrado e evitado por
reestruturação, não por supressão)/build/test limpos, `pm2 restart` executado. **Aguardando validação
do usuário em `/dev/command-palette` antes de prosseguir para a Subetapa 11.5.6 (piloto: migração real
de Clientes + correção do bug `openEditClient`).**

## Subetapa 11.5.6 — Piloto: Clientes como template oficial (implementada, 2026-07-13)

**Não é mais "mais uma migração"** — por decisão do usuário, esta subetapa define a arquitetura que
todo módulo futuro deve seguir. Diferença em relação ao resto do plano: esta é a primeira subetapa que
toca a aplicação real (`page.tsx`), não uma página `/dev/*` isolada.

**Estrutura nova** (`src/components/modules/clientes/`):
- `clientes-page.tsx` — orquestrador puro: `PageHeader` (título + "Novo Cliente") → `FilterBar`
  (busca) → `DataTable` (colunas Nome/CNPJ-CPF/Cidade-UF/Telefone, com `hideBelow` real nas duas
  últimas — primeiro uso de responsividade da 11.5.2 num módulo de verdade) → `FormDialog` (já
  existia, Fase 13, reaproveitado sem alteração). KPI Row e Alert Center foram avaliados e
  **deliberadamente omitidos** — não fazem sentido para um cadastro simples (a estrutura em 6 camadas
  já previa essas duas camadas como opcionais, "quando fizer sentido").
- `cliente-form-fields.tsx` — a grade de campos do formulário, específica do domínio (Cliente e
  Fornecedor têm campos parecidos mas não idênticos; não nasce em `platform` — só viraria candidato a
  extração se uma 3ª entidade repetisse exatamente o mesmo conjunto).
- `types.ts` — `ClientRecord`/`ClientFormData`/`clientToFormData`, ver correção do bug abaixo.
- `src/lib/cnpj-cep-lookup.ts` — versões genéricas e reutilizáveis de `handleCnpjLookup`/
  `handleCepLookup` (extraídas das closures que já existiam em `page.tsx`, usadas também por Orçamento
  e Fornecedor — essas duas permanecem intocadas em `page.tsx` até migrarem também, para não tocar
  módulo fora do escopo desta subetapa).

**Correção definitiva do bug `openEditClient`** (Decisão 7 do ADR-018): a causa raiz não era só "6
campos esquecidos" — era estrutural: a função antiga listava os 16 campos do formulário **duas vezes**
(uma em `emptyClient()`, outra dentro de `openEditClient`), e a segunda lista ficou incompleta (`ie`,
`contactName`, `contactPhone`, `zipCode`, `address`, `neighborhood` hardcoded como string vazia) sem
que o compilador pudesse pegar o erro — nada impedia essa divergência. A correção elimina a classe
inteira do problema, não só os 6 campos:
1. `FORM_FIELD_KEYS` (uma única lista, `types.ts`) alimenta tanto `EMPTY_CLIENT_FORM` quanto
   `clientToFormData()` — não existe mais uma segunda lista para divergir.
2. Abrir a edição agora busca o **registro completo por id** (`GET /api/clients/[id]`, endpoint que já
   existia) em vez de reaproveitar a linha da tabela — mesmo que a listagem um dia venha a usar
   `select` e omitir campos (não é o caso hoje, mas seria uma reintrodução silenciosa do mesmo bug se
   dependesse da linha da lista), a edição sempre terá o dado completo.

**Achado paralelo, não corrigido nesta subetapa** (fora do escopo, disclosed): `loadClients()` (o
catálogo completo usado pelo select de cliente do Orçamento, que permanece em `page.tsx` por ser
estado compartilhado fora do módulo Clientes) já era limitado a 20 registros mesmo antes desta
migração — `parsePagination` do backend usa limite padrão 20 quando nenhum `limit` é enviado. Não é
uma regressão introduzida aqui; só removi a dependência morta em `debouncedClientSearch` (variável que
deixou de existir) sem alterar esse comportamento.

**Limpeza do monólito** (ADR-018 Decisão 3 — componente de módulo migrado nasce autocontido): removidos
de `page.tsx` — `emptyClient()`, `loadClientsPage`, os 2 `useEffect` dedicados, a entrada `clientes` no
mapa de carregamento por módulo, e as 4 funções de ação (`openNewClient`/`openEditClient`/`saveClient`/
`deleteClient`). `clients`/`setClients`/`loadClients` permanecem — alimentam o select de cliente do
Orçamento, estado genuinamente compartilhado fora do módulo.

242/242 testes (nenhum teste de backend precisou mudar — só frontend), `tsc`/lint(59, sem novo)/build
limpos, `pm2 restart` executado. **Validação em ambiente compartilhado**: por instrução permanente do
projeto (nunca rodar e2e/smoke test automatizado contra o banco de produção do PM2), a confirmação
funcional real (listar, criar, editar — sobretudo os 6 campos do bug — e excluir) depende da checagem
do usuário no próprio navegador, não de um teste automatizado meu contra dados reais.

## Subetapa 11.5.7 — Propagação do template: Usuários, Fornecedores, Materiais, Produtos (implementada, 2026-07-13)

Após a aprovação de Clientes como template oficial ("esta ok, pode continuar"), os 4 módulos restantes
de CRUD simples do plano de migração original (§6) foram migrados para a mesma estrutura, sem nenhum
novo experimento de interface — cada um é `PageHeader` → `FilterBar` → `DataTable` → `FormDialog`,
autocontido em `src/components/modules/<módulo>/`.

**Usuários** (`src/components/modules/usuarios/`) — a migração mais simples (sem drill-down). Achado
paralelo, mesma classe do bug `openEditClient` (capacidade já existente no backend, nunca ligada no
frontend, sem nenhuma mudança de backend): `/api/users` já suportava `search`/`page`/`limit`, mas a
lista antiga travava sempre nos 20 primeiros registros, sem busca — corrigido ao adotar
`FilterBar`+`DataTable`.

**Fornecedores** (`src/components/modules/fornecedores/`) — estrutura análoga a Clientes, mais
`fornecedor-material-links.tsx` (vínculo com matérias-primas, preço/lead time/preferencial). Dois
ajustes: (1) a busca por Enter sem debounce (achado da auditoria original, não corrigido até aqui) virou
`SearchInput`+debounce, o mesmo padrão do resto do ERP; (2) o fluxo de edição, que antes fazia 2
requisições (linha da lista para os campos + fetch à parte para os vínculos), passou a fazer 1 única
(`GET /api/suppliers/[id]`, endpoint que já retornava tudo via `findByIdDetailed` e não era usado por
inteiro).

**Materiais** (`src/components/modules/materiais/`) — a combinação de filtro mais rica do plano: busca
+ categoria + checkbox de estoque baixo, todos convivendo no mesmo `FilterBar` (nenhum dos três
justificava um componente de filtro próprio). `material-links-readonly.tsx` mostra fornecedores e
produtos vinculados em modo somente-leitura, com orientação para editar o vínculo pela tela do outro
módulo (evita duplicar a mesma edição em dois lugares).

**Produtos** (`src/components/modules/produtos/`) — a migração mais complexa: imagens (upload/definir
capa/excluir, preservando o padrão de `<input type="file">` oculto) e BOM (vínculo com matérias-primas,
consumo editável). `produto-auxiliary-card.tsx` preserva o cartão de categoria rápida + atalho para
Matérias-primas na mesma posição do original. Sem endpoint combinado de "produto completo", a edição
mantém 2 requisições auxiliares (materiais + imagens) além da linha da lista para os campos — não havia
bug aqui (a listagem já retornava os campos completos), então não foi criada uma 3ª chamada
desnecessária só para uniformizar com Fornecedores.

**Limpeza do monólito** (`page.tsx`): removidos os 4 conjuntos de estado/efeitos/ações módulo-local
(`emptyUser`/`emptySupplier`/`emptyMaterialFull`/`emptyProduct`, `loadUsersPage`/`loadSuppliersPage`/
`loadMaterialsPage`/`loadProductsPage`, todos os `useEffect` por `activeModule`, todas as funções
`openNew*`/`openEdit*`/`save*`/`delete*`, `linkSupplierMaterial`/`unlinkSupplierMaterial`/
`linkProductMaterial`/`unlinkProductMaterial`/`uploadProductImage`/`deleteProductImage`/
`setPrimaryProductImage`/`saveCategory`). Preservado: os catálogos completos genuinamente
compartilhados fora dos módulos (`clients`, `suppliers`, `products`, `materialsFull`, `categories`,
`materials`) e seus loaders (`loadClients`/`loadSuppliers`/`loadProducts`/`loadCategoriesAndMaterials`),
cada um com a dependência morta no estado de busca módulo-local removida (mesmo achado de acoplamento
acidental já visto em Clientes, repetido identicamente em Fornecedores e Produtos); `materialForm`/
`saveMaterial` (funcionalidade já confirmada morta antes desta subetapa, não é escopo corrigir); o gate
`canAccess('usuarios')`.

**Achado de lint durante a limpeza, corrigido**: a contagem de warnings do lint subiu de 59 para 61
(10 novos `react-hooks/set-state-in-effect` — um `load()`-em-efeito e um `setPage(1)`-em-efeito por
módulo — parcialmente compensados pela remoção de 8 equivalentes do `page.tsx` antigo). Decisão: o
padrão `load()`-em-efeito é o mesmo débito já aceito em todo o projeto (fetch-on-mount padrão, Fase 13/
Dashboard) e foi deixado como está; já o padrão `setPage(1)`-em-efeito **foi corrigido** nos 5 módulos
(Clientes incluído), movendo o reset de página para dentro do próprio handler de mudança do filtro
(busca/categoria/estoque baixo) em vez de observá-lo via `useEffect` — ao mesmo tempo uma melhoria real
de UX (reset imediato, sem esperar o debounce) e a eliminação limpa do warning. Resultado final: **56
warnings** (menor que a baseline de 59), `tsc --noEmit` limpo, 242/242 testes, `build`/`pm2 restart`
executados sem erro.

**Validação em ambiente compartilhado**: como em 11.5.6, por instrução permanente do projeto a
confirmação funcional real dos 4 módulos (Usuários, Fornecedores, Materiais, Produtos) depende da
checagem do usuário no próprio navegador antes de avançar para a Subetapa 11.5.8 (módulos de
drill-down pesado: Requisições+Cotação, Compras+Recebimento, Produção → `DetailDrawer`).

**Achado do usuário durante essa validação, corrigido no mesmo dia**: foi possível cadastrar um
Cliente com um CNPJ/CPF já existente, sem nenhum erro. Causa raiz e correção completa registradas no
log de decisões do ADR-001 (entrada de 2026-07-13, "Bug de duplicidade de CNPJ/CPF corrigido") — em
resumo, `cpfCnpj` nunca teve constraint `@unique` no schema (só um índice comum), a unicidade era só
checagem de aplicação sem transação; corrigido com `cpfCnpj` nullable + `@unique` real em `Client` e
`Supplier`, mais tradução da violação de constraint (`P2002`) para a mesma mensagem amigável. Não é
parte do escopo original desta subetapa (é um bug de backend pré-existente, não introduzido pela
migração de frontend), mas foi corrigido de imediato por ter sido encontrado durante a validação dela.

**Subetapa 11.5.7 validada pelo usuário em 2026-07-13** ("tudo ok") — os 4 módulos (Usuários,
Fornecedores, Materiais, Produtos) e a correção do bug de CNPJ/CPF duplicado confirmados no navegador.
**Avançando para a Subetapa 11.5.8** (drill-down pesado: Requisições+Cotação, Compras+Recebimento,
Produção → `DetailDrawer`).

**Checkpoint de expectativa, esclarecido antes de iniciar 11.5.8**: o usuário perguntou por que o
sistema continua visualmente idêntico depois de 5 módulos migrados. Resposta registrada: por desenho
(ver tabela de subetapas §5/linha 190 em diante), 11.5.1–11.5.8 são deliberadamente estruturais — "zero
mudança visual esperada" — os componentes novos reaproveitam os mesmos primitivos visuais do shadcn já
usados antes. A reestilização real (Design System de cores/tipografia/espaçamento aplicado de fato)
ainda não aconteceu; só os tokens foram formalizados (11.5.1). Perguntado se queria priorizar a
reestilização agora ou terminar a consolidação estrutural primeiro — **decisão: terminar a estrutura de
todos os módulos antes de qualquer reestilização visual**, para não gastar esforço de estilo em cima de
estrutura ainda mudando.

## Subetapa 11.5.8 — Drill-down pesado: Compras, Requisições, Produção (implementada, 2026-07-14)

A subetapa mais complexa do plano: os 3 módulos onde o app hoje usa `Dialog`s aninhados/múltiplos
(cotação como um segundo dialog, formulário de OP com um sub-seletor embutido) migram para o padrão
`PageHeader`→`FilterBar`(quando aplicável)→`DataTable`→`FormDialog`+`DetailDrawer`, na ordem
simples→complexo: Compras → Requisições → Produção.

**Decisão de unificação de UX, deliberada e disclosed nos 3 módulos**: a mudança de status, que antes
vivia num `Select` inline na própria linha da tabela (Compras/Requisições) ou dentro do próprio dialog
de edição (Produção), passa a viver exclusivamente dentro do `DetailDrawer`. Não é perda de
funcionalidade — é a mesma ação, um clique a mais ("Ver detalhes" antes de mudar o status), em troca de
um único padrão de interação consistente entre os 3 módulos de drill-down (e futuros). PDF, exclusão e
o atalho "Receber mercadoria" continuam como ações diretas da linha, sem exigir abrir o painel primeiro.

### Compras (`src/components/modules/compras/`)

Nunca tem criação manual (Pedido de Compra só nasce via evento de domínio quando uma Requisição avança
para "ordered") — só listagem, mudança de status e recebimento. `purchase-order-receive-dialog.tsx`
extrai o formulário de recebimento (inalterado); `compras-page.tsx` orquestra `DataTable`+`DetailDrawer`.

**Bug real corrigido, catalogado desde a Fase 8/ADR-015 e nunca fechado**: o `Select` de status antigo
oferecia sempre as 4 opções `['draft', 'sent', 'confirmed', 'cancelled']`, para qualquer status atual —
mas a máquina de estados real (`purchase-order.service.ts`, ADR-010) exige `draft → pending_approval →
approved → sent → confirmed`; `draft → sent` direto é proibido de propósito (aprovação interna e envio
ao fornecedor são atos distintos). Selecionar "Enviado" a partir de "Rascunho" sempre falhava com 400 —
os dois status intermediários eram simplesmente inatingíveis pela UI, e nem tinham label traduzido.
Corrigido com `PURCHASE_ORDER_TRANSITIONS` (`types.ts`), uma única fonte que espelha
`ALLOWED_TRANSITIONS` do Service — o `Select` do `DetailDrawer` só lista o status atual + as transições
de fato permitidas a partir dele.

### Requisições + Cotação (`src/components/modules/requisicoes/`)

A cotação (comparar fornecedores por item, selecionar vencedor) era um segundo `Dialog` aninhado, aberto
a partir da linha da tabela — vira o `DetailDrawer`. `requisicao-form-fields.tsx` (formulário de
criação, com sugestão automática de itens a partir de uma OP) e `requisicao-cotacao.tsx` (conteúdo do
drawer) isolados do orquestrador `requisicoes-page.tsx`.

**Mesmo bug de transição de status inatingível encontrado em Compras**, corrigido do mesmo jeito
(`REQUISITION_TRANSITIONS`, espelhando `ALLOWED_TRANSITIONS` de `requisition.service.ts`).

**Bug real corrigido**: o estado de rascunho de nova cotação (`cotacaoNewQuote`, indexado por
`itemId`) nunca era limpo ao trocar de requisição — um valor digitado (fornecedor/preço/prazo) para o
item de uma requisição podia reaparecer ao abrir a cotação de OUTRA requisição, caso os ids de item
colidissem entre elas. Corrigido: `setQuoteDrafts({})` a cada abertura do `DetailDrawer`.

**Disparo cross-module preservado**: "Gerar requisição de matéria-prima" (ação de uma linha de OP em
Produção) precisa abrir Requisições já com uma sugestão calculada para aquela OP específica — isso
NÃO pode virar uma função interna de `RequisicoesPage` chamada de fora (quebraria a autocontenção do
módulo). Resolvido com um prop reativo: `page.tsx` guarda `requisitionOPSuggestion` (o único estado
"cross-module" que sobrou fora dos módulos), passa como `pendingSuggestionFromOP` para
`RequisicoesPage`, que reage via `useEffect` e avisa quando já consumiu (`onConsumePendingSuggestion`) —
`RequisicoesPage` nunca importa nada do módulo Produção.

### Produção (`src/components/modules/producao/`) — a migração mais complexa

`producao-form-fields.tsx` (campos de negócio + seletor de Pedido de Venda, antes um "dialog dentro do
dialog", agora uma seção só) + `producao-page.tsx`. Status sai do formulário de edição (mesma
unificação de UX das outras duas) e, junto dele, um recurso genuinamente novo entra no `DetailDrawer`.

**Achado de backend fechado nesta subetapa, o mais significativo das três**: `POST
/production-orders/[id]/produce` (`ProductionOrderService.produce()`, produção parcial ou total,
consumo/reserva/entrada proporcional) existe desde a Fase 9 (ADR-011) — **nenhuma tela jamais o
chamava**. A única forma de "concluir" uma OP era o `Select` genérico de status marcando `completed` de
uma vez (que internamente delega para `produce()` com o saldo inteiro). Produção parcial por rodada, um
recurso já pronto e testado no backend, nunca teve UI. O `DetailDrawer` agora mostra o progresso
(`quantityCompleted`/`quantity`, usando o `Progress` do shadcn — instalado desde sempre, nunca usado até
agora, mesma situação do `command.tsx` antes da 11.5.4) e um formulário "Registrar produção desta
rodada" que chama `produce()` de verdade, com um `clientRequestId` gerado no cliente
(`crypto.randomUUID()`) para aproveitar a idempotência que o endpoint já suporta (protege contra duplo
clique/retry de rede registrando produção duas vezes).

**Mesmo bug de transições inatingíveis, também corrigido** (`PRODUCTION_ORDER_TRANSITIONS`, espelhando
`ALLOWED_TRANSITIONS` de `production-order.service.ts`, ADR-002) — `paused → completed` direto, por
exemplo, sempre falhava (precisa voltar para `in_progress` antes).

**Achado de leitura adicional, não uma correção, só um dado antes nunca exposto**: `GET
/production-orders/[id]` já retorna as Requisições vinculadas àquela OP (`requisitions: {id, number,
status}[]`) — nenhuma tela mostrava isso antes. Agora aparece no `DetailDrawer`.

**Limpeza do monólito**: removidos de `page.tsx` os 3 conjuntos de estado/efeitos/ações módulo-local.
`productionOrders`/`loadProductionOrders` sobrevivem, mas mudam de papel — deixam de alimentar a própria
tela de Produção (agora paginada internamente) e passam a ser só o catálogo compartilhado do seletor
"gerar a partir de uma OP" em Requisições (mesmo padrão de `suppliers`/`materialsFull`); a paginação
morta (`productionOrderPage`/`Total`/`TotalPages`) foi removida junto.

**Achado de lint aceito, mesma categoria já catalogada**: o `useEffect` reativo ao prop
`pendingSuggestionFromOP` (Requisições) soma 1 novo `react-hooks/set-state-in-effect` — não há como
evitá-lo sem um refactor maior (o disparo vem de outro componente via prop, não de um evento local desta
tela), e é exatamente o padrão que o próprio React recomenda para sincronizar estado interno a partir de
uma mudança externa. Somado aos 3 `load()`-em-efeito (1 por módulo, mesmo débito já aceito desde a Fase
13) e à remoção de 2 efeitos mortos do `page.tsx` antigo (status filter reset de Requisições/Compras,
que agora vivem dentro dos próprios módulos como `setPage(1)` no handler do filtro, já sem warning): **56
warnings, igual à contagem anterior** — nenhum aumento líquido na baseline.

`tsc --noEmit` limpo, 242/242 testes (nenhum teste de backend precisou mudar), `build`/`pm2 restart`
executados sem erro. **Validação em ambiente compartilhado**: como nas subetapas anteriores, a
confirmação funcional real dos 3 módulos (especialmente a transição de status corrigida em cada um e o
registro de produção parcial, nunca testável antes) depende da checagem do usuário no navegador —
regra permanente do projeto proíbe e2e automatizado contra o banco de produção do PM2. Com isso, a
Fase 11.5 completa sua consolidação estrutural de todos os módulos com dados tabulares (11.5.9 em diante
é Relatórios/Configurações/shell de navegação/QA responsivo).

**Subetapa 11.5.8 validada pelo usuário em 2026-07-14** ("tudo ok") — Compras, Requisições e Produção
(incluindo as 3 correções de transição de status e o novo registro de produção parcial) confirmados no
navegador. **Avançando para a Subetapa 11.5.9** (normalização final: Relatórios sai do HTML cru para
`DataTable`; Configurações unifica as 5 sub-abas no mesmo padrão).

## Subetapa 11.5.9 — Relatórios e Configurações (implementada, 2026-07-14)

### Relatórios (`src/components/modules/relatorios/`)

Sai da tabela HTML crua (`<table>` nativo com colunas calculadas dinamicamente por `Object.keys(rows[0])`)
para o `DataTable` — mesmas colunas dinâmicas (o relatório continua genérico por natureza: 4 tipos com
formatos de linha completamente diferentes), agora com loading/empty state padronizados. Cartões de
resumo e os 2 botões de exportação (CSV/PDF, ambos `window.open` simples) preservados sem alteração.

**Achado revisado, não corrigido de propósito**: o tipo "Compras (Requisições)" consulta `Requisition`,
não `PurchaseOrder` (o módulo Compras, já migrado na 11.5.8) — mas o próprio rótulo já deixa isso
explícito no parêntese; não é um bug de UI, é uma decisão de produto anterior a esta subetapa (que tipo
de relatório de compras faz sentido é decisão do usuário, não correção de migração).

### Configurações (`src/components/modules/configuracoes/`) — as 5 sub-abas no mesmo padrão

A navegação entre sub-abas (os links) permanece na barra lateral em `page.tsx` — é shell de navegação
(Subetapa 11.5.10), não dado deste módulo; `ConfiguracoesPage` só recebe `configSub` como prop e
despacha para o componente certo. Cada sub-aba é autocontida, sem estado compartilhado entre si:

- **Empresa** e **PDF**: formulários simples (sem tabela), ambos lendo/gravando o mesmo
  `SystemSetting` (chave-valor livre) via `use-settings.ts` (hook compartilhado) — **cada aba busca sua
  própria cópia, de forma independente**. **Bug corrigido**: a aba PDF antes só "funcionava" porque
  `configSub` sempre iniciava em "empresa" — nenhum "loads map" tinha uma entrada para "pdf", então a
  tela dependia silenciosamente de Empresa já ter carregado `settings` primeiro. Agora cada aba busca
  sozinha ao montar, independente da ordem de entrada.
- **Numeração**: lista de cartões (uma sequência de documento por cartão, salva individualmente) — não
  virou `DataTable` de propósito: são poucos registros fixos, cada um um mini-formulário, não uma
  listagem paginável.
- **Sistema**: cartão de leitura (versão/instalação) + Logs de Auditoria, que já usava `Table` do
  shadcn (não HTML cru) mas nunca teve nenhum filtro, apesar de `auditService.list()` já suportar
  `module`/`action`/`from`/`to` no backend — fechado com um `FilterBar` (módulo + ação). **Bug real
  corrigido**: o estado `systemLoading` desta tela nunca era setado para `true` em lugar nenhum do
  código antigo — o esqueleto de carregamento nunca aparecia, mesmo com a busca em andamento (dead
  state). Agora é o `loading` real do próprio módulo.
- **Atualizações**: cartão de versão + upload de patch (widget próprio, gated a admin) + Histórico de
  Atualizações — já usava `Table` do shadcn, vira `DataTable` sem paginação de servidor (o endpoint
  devolve os 50 mais recentes, sem `page`/`limit` — mantido tal como está, sem inventar paginação de
  backend que não existia).

**Limpeza do monólito**: removidos de `page.tsx` os 2 conjuntos completos de estado/efeitos/ações
(Relatórios inteiro; Configurações inteiro — settings/sequences/systemInfo/auditLogs/patchHistory e
todas as suas ações), a entrada `configSubRef`/fallback no mapa de carregamento por módulo (morta desde
que as 4 sub-abas passaram a se autocarregar), e os tipos `Sequence`/`AuditEntry`/`productionStatusLabels`
top-level (todos órfãos após a migração — cada um sobrevive agora só dentro do módulo que o usa).

**Achado de lint aceito, mesma categoria já catalogada**: 5 novos `load()`-em-efeito (1 por sub-aba
autocontida de Configurações + `use-settings.ts`), parcialmente compensados pela remoção do efeito de
auditoria antigo — 60 warnings no total (acima de 56, mas dentro da mesma categoria de débito aceito
desde a Fase 13, nenhum warning novo de tipo diferente).

`tsc --noEmit` limpo, 242/242 testes, `build`/`pm2 restart` executados sem erro. **Validação em ambiente
compartilhado**: como nas subetapas anteriores, depende da checagem do usuário no navegador — atenção
especial à aba PDF (bug de ordem de carregamento corrigido) e ao filtro novo de Logs de Auditoria.

### Achado de planejamento encontrado ao revisar o lint global desta subetapa

Ao investigar por que a contagem total de warnings incluía itens fora de Compras/Requisições/Produção/
Relatórios/Configurações, ficou confirmado que **Orçamentos, Pedidos de Venda e Estoque nunca foram
incluídos em nenhuma das 11 subetapas do plano aprovado** (tabela da Seção 5) — não é um esquecimento
desta rodada, é uma lacuna do próprio plano original, desde sua aprovação. Depois da Subetapa 11.5.11
(QA responsivo), esses 3 módulos continuariam no padrão antigo (Card/Table cru, sem FilterBar/DataTable/
DetailDrawer), quebrando a consistência que motivou toda a Fase 11.5. Levado ao usuário para decisão
antes de avançar para a Subetapa 11.5.10.

**Decisão do usuário (2026-07-14)**: registrar uma nova **Subetapa 11.5.12 — Orçamentos, Pedidos de
Venda e Estoque**, executada depois de 11.5.10 (shell de navegação) e 11.5.11 (QA responsivo) — mesmo
padrão `PageHeader`→`FilterBar`→`DataTable`→`FormDialog`/`DetailDrawer` dos demais módulos, fechando a
lacuna antes de a Fase 11.5 ser considerada encerrada. Plano de 12 subetapas agora, não mais 11.

**Subetapa 11.5.9 (Relatórios/Configurações) + os 3 bugs encontrados durante a validação (Settings não
salvava, resumo de Relatórios em inglês/sem pontuação, frete fora do total do Orçamento) + as 2
correções de dado histórico (ORC-000003/PED-000003) — todos validados pelo usuário em 2026-07-14**
("esta correto"). **Avançando para a Subetapa 11.5.10** (shell de navegação: sidebar recolhível,
breadcrumb clicável, notificações com severidade).

## Subetapa 11.5.10 — Shell de navegação (implementada, 2026-07-14)

**Decisão prévia, pedida ao usuário antes de implementar**: o plano diz "notificações com severidade
(reaproveitando `DashboardAlertData`)", mas não existia nenhum endpoint único que devolvesse "todos os
alertas de todos os domínios" — só por perfil (ex. Diretoria, que agrega tudo mas é pesado e
gated por permissão de perfil, e mesmo assim não cobre "requisições pendentes", que nunca foi um
widget formal do catálogo). Perguntado ao usuário: **construir um endpoint novo e leve** (opção
escolhida), reaproveitar o endpoint de Diretoria, ou só aplicar o estilo visual às buscas manuais de
hoje. Endpoint novo aprovado.

**Backend**: `dashboard-widgets.service.ts` ganha `getAllAlerts()` — filtra `WIDGET_REGISTRY` pelos
widgets cujo `kind` no catálogo é `'alert'` (qualquer domínio, sem filtrar por perfil), computa todos,
descarta os de contagem zero, e soma um alerta extra calculado ad-hoc (`getPendingRequisitionsWidget()`,
requisições com status "sent") — este último fica **fora** do `WIDGET_REGISTRY` de propósito, porque
`registerWidget()` exige uma entrada prévia no catálogo central (regra permanente, ADR-017) e formalizar
isso como indicador oficial do Dashboard seria um levantamento à parte. Devolve `DashboardWidgetDTO[]`
(não só `DashboardAlertData[]`) para preservar `title`, necessário pra reaproveitar `DashboardAlertCard`
tal como está. Nova rota `GET /api/dashboard/alerts` (`requireAuth` + `checkPermission` por
`linkToModule` de cada alerta — nunca a permissão genérica de "dashboard", que é universal).

**Frontend**: `src/components/layout/notification-center.tsx` — sino de notificações autocontido,
busca `/api/dashboard/alerts`, ordena por severidade (crítico primeiro) e renderiza cada alerta
literalmente com `<DashboardAlertCard>` (o mesmo componente do Alert Center do Dashboard) — substitui
as 2 buscas manuais (`lowStockMaterials`/`pendingRequisitionsCount`) e o popover ad-hoc que existiam em
`page.tsx`.

**Sidebar recolhível**: novo estado `sidebarCollapsed` em `page.tsx`; `renderNav()` ganha um parâmetro
`collapsed` (só afeta a versão desktop — o `Sheet` mobile sempre abre expandido, colapsar não faz
sentido num overlay de tela cheia). Recolhido: só ícones + `title` nativo como tooltip; sub-menu de
Configurações e textos do rodapé de usuário desaparecem (usuário expande para navegar sub-abas).
Botão de alternância no topo da própria sidebar (`PanelLeftClose`/`PanelLeftOpen`).

**Breadcrumb clicável**: "COZISTEEL ERP" sempre navega para o Dashboard; o segmento de módulo só vira
link quando há um terceiro segmento à frente (Configurações, cujas sub-abas ficam abaixo) — o último
segmento (a tela atual) permanece texto simples, convenção padrão de breadcrumb.

**Limpeza**: removidos de `page.tsx` — `notifOpen`/`lowStockMaterials`/`pendingRequisitionsCount`,
`loadNotifications`/`notifCount`/`goToNotification`, o popover inteiro; imports mortos `Bell`/
`Popover`/`PopoverTrigger`/`PopoverContent`.

tsc limpo, lint 60 (1 novo `load()`-em-efeito em `notification-center.tsx`, compensado pela remoção do
antigo — sem aumento líquido), 242/242 testes, `build`/`pm2 restart` executados sem erro. **Validação em
ambiente compartilhado**: como nas subetapas anteriores, depende da checagem do usuário no navegador —
atenção especial ao recolher/expandir a sidebar, aos links do breadcrumb, e às severidades reais do
sino (crítico/atenção/informativo) comparadas ao Alert Center do Dashboard.

**Subetapa 11.5.10 + achados de polish subsequentes (calendário em Relatórios/Orçamento/Requisições,
condições de pagamento por seleção fechada, bug de sobreposição do `SelectTrigger` corrigido em 18
lugares) — validados pelo usuário em 2026-07-14** ("esta tudo ok agora"). Com isso, a consolidação
estrutural (11.5.1–11.5.10) e o polish decorrente estão fechados. Restam no plano: **11.5.11** (QA de
responsividade transversal) e **11.5.12** (Orçamentos/Pedidos/Estoque, registrada nesta mesma data).

## Subetapa 11.5.11 — QA de responsividade transversal (implementada, 2026-07-14)

Sem ferramenta de navegador/captura de tela disponível — auditoria em nível de código (não visual),
cobrindo todos os componentes de `platform/` e todos os módulos já migrados (11.5.1–11.5.10), buscando
padrões que quebram, transbordam ou tornam algo inalcançável numa tela estreita (~375-640px).

**Confirmado OK, sem alteração**: `DataTable` (scroll horizontal herdado + `hideBelow` já real e usado
em 7 módulos), `FilterBar`/`PageHeader` (`flex-wrap`+`truncate`+`min-w-0`), `DetailDrawer` (`w-full
sm:max-w-lg`, ocupa 100vw abaixo de 640px), `FormDialog`/`Dialog` base (`max-w-[calc(100%-2rem)]` no
primitivo shadcn sempre vence abaixo de `sm:`, então nenhum dos 7 `maxWidth` usados nos módulos corta
conteúdo), shell principal (sidebar `hidden md:flex` + `Sheet` mobile já cobre `<md`).

**1 bug real corrigido — bloqueava uso, não só estética**: `produto-images.tsx` — os botões "definir
como principal"/"remover" de cada imagem só apareciam em `opacity-0 group-hover:opacity-100`; toque não
tem estado de hover, então essas 2 ações ficavam inalcançáveis em celular/tablet. Corrigido:
`opacity-100 sm:opacity-0 sm:group-hover:opacity-100` — sempre visível abaixo de `sm:`, hover normal
acima disso.

**2 ajustes cosméticos, sem risco**: `compras-page.tsx`/`producao-page.tsx` — os pares rótulo/valor do
`DetailDrawer` (prioridade/prazo, requisição de origem/prazo esperado) usavam `grid-cols-2` fixo, sem
prefixo responsivo; viram `grid-cols-1 sm:grid-cols-2`, mesma convenção mobile-first do resto do
código.

**Achados revisados, deliberadamente não alterados** (disclosed, não são bugs de fato): os grids de
linha de item (`grid-cols-2 sm:grid-cols-6/5/4` em Requisições/Cotação/Compras-recebimento/Fornecedor-
Materiais/Produto-Materiais) ficam densos em 2 colunas no mobile, mas já são totalmente funcionais
(a correção `w-full` do `SelectTrigger`, achado anterior desta mesma sessão, já garante que nenhum
valor transborda — só trunca); trocar para empilhamento de 1 coluna deixaria cada card de item mais
alto (mais rolagem numa lista de itens), uma troca sem vencedor claro, não uma correção óbvia. O item
de Orçamento (`page.tsx`, `grid-cols-[28px_200px_110px_1fr_100px_130px_120px_36px]`, `min-w-[900px]`
com scroll horizontal dentro de um dialog já largo) fica fora do escopo desta subetapa — pertence a um
módulo ainda não migrado (Orçamentos, Subetapa 11.5.12), e a própria migração para `DataTable` deve
resolver isso naturalmente.

tsc/lint(60, sem novo)/build limpos, 242/242 testes, `pm2 restart` executado. **Validação**: por não
haver ferramenta de captura, depende inteiramente da checagem do usuário em pelo menos 2 tamanhos de
tela (ex. DevTools em modo responsivo, ou o celular de verdade) — atenção especial às ações de imagem
de Produto (o bug corrigido) e aos grids de item densos (achado disclosed, não corrigido).

**Subetapa 11.5.11 validada pelo usuário em 2026-07-14** ("Esta otimo"). Com isso, **todas as 11
subetapas originalmente planejadas da Fase 11.5 estão concluídas e validadas** — resta apenas a
Subetapa 11.5.12 (Orçamentos, Pedidos de Venda e Estoque), registrada à parte após o achado de
planejamento da Subetapa 11.5.9.

## Subetapa 11.5.12 — Orçamentos, Pedidos de Venda e Estoque (implementada, 2026-07-14)

Últimos 3 módulos a migrar para a plataforma — a lacuna de planejamento identificada durante a
Subetapa 11.5.9 (nenhum dos 3 estava em nenhuma das 11 subetapas originais). Ordem executada, do mais
simples ao mais complexo: **Pedidos de Venda → Estoque → Orçamentos**.

**Pedidos de Venda** (`src/components/modules/pedidos/`): módulo somente leitura + transição de status
(nunca tem criação manual — nasce só da conversão de um Orçamento aprovado), mesmo espírito estrutural
de Compras (11.5.8): `PageHeader` → `FilterBar` (com `SearchInput`, novo) → `DataTable` → `DetailDrawer`
com status restrito por `SALES_ORDER_TRANSITIONS` (espelha `sales-order.service.ts`). 2 achados fechados:
(1) busca por número/cliente já existia no backend mas nunca tinha UI; (2) não havia nenhuma visão de
detalhe apesar do backend já devolver itens/cliente completo/OPs vinculadas.

**Estoque** (`src/components/modules/estoque/`): o mais simples dos 3 — sem estado compartilhado com
nenhum outro módulo, sem máquina de estados. Duas visões por abas (`Tabs` no `actions` do `PageHeader`,
primeiro uso desse padrão): Saldo Atual (`DataTable` + `FilterBar` com tipo/busca/só-baixo) e
Movimentações (`DataTable` paginado). 1 achado fechado: os dois efeitos que podiam disparar
`loadMovements()` duas vezes seguidas ao entrar na aba já em "Movimentações" (um pelo efeito de
troca de view, outro pelo gatilho cross-module de módulo) colapsaram em um único efeito por aba.
Achado catalogado, não corrigido (fora do escopo de uma migração estrutural de UI): `stockService.summary()`
não pagina — retorna todo o conjunto filtrado de uma vez, comportamento preexistente idêntico ao de antes
desta migração.

**Orçamentos** (`src/components/modules/orcamentos/`): a migração mais complexa da subetapa — CRUD
completo com `FormDialog`, grid de itens de largura fixa (`grid-cols-[28px_200px_110px_1fr_100px_130px_120px_36px]`),
duplicar, converter em Pedido de Venda, 2 PDFs (padrão e romaneio de transporte). `clients`/`products`
permanecem como catálogos compartilhados em `page.tsx` (usados também pelos seletores de Produção),
injetados via props (`OrcamentosPageProps`). 3 achados fechados: (1) as abas de status filtravam só
Rascunho/Enviado/Aprovado/Rejeitado — Cancelado e Expirado nunca tinham aba própria, mesmo já existindo
como status reais; (2) o `Select` de status na tabela listava todos os 6 status incondicionalmente —
mesma classe de bug já corrigida em Compras/Requisições/Produção/Pedidos, agora usando
`QUOTE_TRANSITIONS` (espelha `ALLOWED_TRANSITIONS` de `quote.service.ts`; `expired` continua um status
morto/inatingível — nenhuma transição do backend leva a ele, corrigi-lo exigiria um cron/job que não
existe, fora do escopo desta migração estrutural); (3) o resumo de totais do formulário nunca somava o
frete no preview ao vivo (`quoteSubtotal - quoteDiscount`), mesmo o backend já somando `freightValue` no
`total` persistido desde a correção da Subetapa 11.5.9 — o preview do formulário tinha ficado pra trás
dessa correção. Um quarto achado fechado, de integração: `convertQuoteToOrder` nunca recarregava o
catálogo compartilhado `salesOrders` — o Pedido de Venda recém-gerado só aparecia no seletor de Produção
depois que o usuário saísse e voltasse pra aba; agora `onDataChanged` (prop) recarrega `salesOrders` e
`productionOrders` após aprovar ou converter um orçamento.

tsc/lint(58, -1 líquido)/build limpos, 242/242 testes, `pm2 restart` executado após cada um dos 3
módulos. **Validação**: pendente — depende da checagem do usuário no navegador antes de considerar a
Subetapa 11.5.12, e com ela a Fase 11.5 inteira (12/12 subetapas), definitivamente concluída.

**Subetapa 11.5.12 validada pelo usuário em 2026-07-14** ("A análise faz sentido e concordo com a
conclusão... A Fase 11.5 está aprovada conceitualmente"). Com isso as 12 subetapas planejadas da Fase
11.5 estão concluídas — mas o usuário condicionou o encerramento definitivo da fase a uma auditoria de
consolidação prévia à Fase 12 (Financeiro), não a uma aprovação automática.

## Auditoria de consolidação (2026-07-14)

Antes de abrir o levantamento de Financeiro, o usuário pediu uma auditoria completa da interface do ERP
— 3 varreduras paralelas (adoção da camada `platform` módulo a módulo, consistência visual/tokens, RBAC
+ jornadas de usuário por perfil), sintetizadas num relatório de 5 seções (padronizado / dívida técnica /
corrigir antes da próxima fase / pode esperar / avaliação crítica de UX), publicado como artifact para o
usuário.

**Achado de premissa que revisou o entendimento do projeto**: o RBAC já tinha 9 Roles literais
(`admin/manager/user/viewer/comercial/producao/compras/estoque/financeiro`, `rbac.ts`) com matriz de
permissões coerente — não os 4 originais que a memória de sessões anteriores registrava. Os 5 Roles
departamentais novos já espelhavam quase 1:1 os 6 perfis de negócio informais do usuário.

**Principais achados**: 10/13 módulos totalmente migrados para a camada `platform` (Compras/Configurações/
Estoque parcialmente, cada um por um motivo pontual e já catalogado); 3 sistemas de listagem de dashboard
coexistindo sem reconciliação (dashboard antigo em `page.tsx`, o novo `dashboard-v2` baseado em widgets,
e a própria camada `platform`); nenhuma regressão no fix do `SelectTrigger`; um padrão recorrente de
fricção — 3 fluxos centrais (aprovar Orçamento, converter em Pedido, avançar Requisição para compra)
geravam um novo registro em outro módulo e avisavam só por toast, sem link de volta; o Role `financeiro`
já existia com permissões sensatas mas nunca tinha sido estendido ao Dashboard v2 (perfil inexistente);
o RBAC, apesar de sofisticado, era invisível para quem administra usuários.

**Decisão do usuário**: não abrir Financeiro nem uma fase nova — uma rodada curta de **Hardening da
Plataforma**, com escopo explicitamente contido (fora: unificação dos dashboards, roteamento real,
redesign geral, novos módulos, refatorações profundas), 4 prioridades ordenadas, critério de encerramento
explícito ("a plataforma está consolidada e pronta para receber qualquer módulo novo").

## Hardening da Plataforma — pré-Financeiro (implementado, 2026-07-14)

**Prioridade 1 — Fluxos pós-ação.** Novo componente `src/components/domain/action-result-dialog.tsx`
(`ActionResultProvider`/`useActionResult()`, mesma arquitetura Provider+hook de `useConfirm`) substitui o
`toast.success` simples nos 3 pontos identificados (`OrcamentosPage::changeStatus`/`convertToOrder`,
`RequisicoesPage`'s avanço para `ordered`) por um painel "o que fazer agora" com 1-3 ações contextuais.
Deep-link cross-module: `PedidosPage`/`ProducaoPage`/`ComprasPage` ganharam `initialDetailId`/
`onConsumeInitialDetail`, mesmo padrão de `pendingSuggestionFromOP` (Produção→Requisições, 11.5.8) — o
`DetailDrawer` do registro recém-criado abre direto quando exatamente 1 foi gerado; quando são vários, a
ação navega só para a lista (sem adivinhar qual abrir). Tipos ajustados em `quote.service.ts`/
`requisition.service.ts` (`Array<{ number }>` → `Array<{ id; number }>`) — os objetos já carregavam `id`
em runtime, só o tipo declarado escondia o campo.

**Prioridade 2 — Papel Financeiro.** `financeiro` virou um `DashboardProfile` de verdade
(`dashboard-types.ts`, `dashboard-tabs.tsx`, `dashboard-access.service.ts`), compondo os widgets já
existentes de `comercial`+`compras` (`dashboard-widgets.service.ts`) — nenhum widget financeiro novo,
só torna visível o que o Role já podia ver via RBAC. Mesmo bug corrigido para `user`/`viewer`: o item
"Dashboard (Novo)" da sidebar agora só aparece quando `getAccessibleProfiles(role).length > 0`
(`page.tsx::canAccess`), fechando o beco-sem-saída que os 3 Roles sem nenhum perfil caíam.

**Prioridade 3 — Legibilidade do RBAC.** `rbac.ts` ganhou `getRolePermissions()` (consulta somente-
leitura de `PERMISSIONS`, zero mudança na lógica de autorização) e novo componente
`src/components/modules/usuarios/role-permissions-preview.tsx`, integrado no formulário de Usuário logo
abaixo do `Select` de Perfil — mostra módulo por módulo o que o Role selecionado libera, atualizando
antes mesmo de salvar.

**Prioridade 4 — Consolidação visual restante.** `formatCurrency()` (`lib/format.ts`) passa a incluir o
prefixo "R$" — removida a concatenação manual duplicada em 8 call sites (frontend) + 1 no backend
(`report.service.ts`, que passou a reusar `formatCurrency` em vez de reimplementar a mesma formatação).
Badge Ativo/Inativo de Usuários migrado para `StatusBadge` (novo domínio `userStatus` em
`status-tokens.ts`). Os 2 últimos `Dialog` brutos (Estoque "Ajustar Estoque", Compras "Receber Pedido de
Compra") viraram `FormDialog`. Domínio `bom` adicionado a `status-tokens.ts` (`draft`/`released`/
`obsolete`) por completude — nenhuma tela ainda renderiza status de BOM via `StatusBadge`.

**Achado de lint durante a implementação**: as 3 novas `useEffect` de deep-link, na forma inicial
(`setDetailOpen(true)`/`setDetailLoading(true)` diretos no corpo do efeito), geraram +6 warnings
(58→64). Resolvido restruturando para inicialização preguiçosa de estado (`useState(() =>
!!initialDetailId)`) em vez de `setState` síncrono no efeito — o efeito ficou só com a busca assíncrona
(dentro de `.then()`, fora do escopo síncrono que a regra sinaliza) — voltou a 58, líquido zero, mesmo
padrão de disciplina usado em toda a fase ("contagem de warning só diminui").

tsc/lint(58, líquido zero)/build limpos, 242/242 testes (1 teste de `dashboard-widgets-infra.test.ts`
atualizado para refletir `financeiro` como novo `DashboardProfile`, mudança de comportamento esperada,
não regressão), `pm2 restart` executado. `graphify update .` e esta entrada executados no fechamento.
**Validação funcional das 3 prioridades comportamentais depende do usuário conferir no próprio
navegador** — mesma regra permanente do projeto.

**Com isso, a Fase 11.5 (Plataforma Frontend) está oficialmente encerrada** — 12/12 subetapas + auditoria
de consolidação + rodada de hardening, todas concluídas e implementadas. O levantamento e a arquitetura
da Fase 12 (Financeiro) podem começar a partir daqui.
