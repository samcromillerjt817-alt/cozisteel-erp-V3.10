# ADR-022 — Evolução da Experiência Operacional do ERP: Levantamento

**Status**: levantamento aprovado 2026-07-25. Fase UX-1 (Integridade e controle operacional) e
Fase UX-2 (Visibilidade do que já existe) implementadas — ver Partes 6 e 7. Fases UX-3 a UX-7
ainda não iniciadas (UX-3 depende da decisão pendente #5).
**Data**: 2026-07-25
**Escopo**: revisão completa da dinâmica de trabalho de quem opera o ERP no dia a dia — não é um
redesenho visual isolado, é uma auditoria de rotinas operacionais, tratamento de erros, recursos
autoexplicativos, consistência visual e performance/produtividade, em todos os módulos.

---

## PARTE 0 — Como este levantamento foi feito

Sete auditorias independentes (agentes de exploração, só leitura, nenhuma mudança de código), cada uma
lendo os arquivos relevantes por completo (não por amostragem):

1. Trabalho anterior de UX/Design System (ADR-014, ADR-015, ADR-018, ADR-019, ADR-001) — para não
   redescobrir nem contradizer decisões já tomadas.
2. Comercial (Orçamento → Pedido de Venda → Clientes).
3. Produção (Ordens de Produção, Produtos/BOM) + a infraestrutura "sem tela própria" (MRP, Reserva de
   Material, Rastreabilidade por Lote).
4. Estoque + Compras (Matérias-Primas, Fornecedores, Requisições, Pedidos de Compra, Estoque).
5. Financeiro + Relatórios.
6. Cadastros/Configurações/Administração — incluindo confirmar se existe um módulo de Qualidade.
7. Transversais: tratamento de erros, recursos autoexplicativos de UX, performance/produtividade.

Cada achado abaixo cita `arquivo:linha` sempre que possível. Nenhuma solução foi implementada — este
documento é só diagnóstico + proposta de roadmap, para aprovação antes de qualquer mudança.

---

## PARTE 1 — O que já existe e não deve ser redescoberto nem contradito

Isto é o resultado mais importante da auditoria nº1 — evita que o roadmap proponha "criar" algo que já
existe, ou contradiga uma decisão de UX já tomada e aprovada em rodadas anteriores (ADR-014/015/018/019).

### 1.1 Design system real, não maquiado
- Tipografia: `--font-inter` (corpo) + `--font-space-grotesk` (headings), `globals.css:18-19,126,129`.
  **Não é Geist** (correção a uma memória antiga que citava Geist só para PDFs, não para a UI).
- Cor primária `#b21118` (vermelho Cozisteel), tema shadcn 100% em CSS custom properties
  (`globals.css:62-101`). Dark mode: arquitetura de tokens pronta, bloco `.dark {}` deliberadamente vazio
  (decisão consciente do ADR-018, não uma lacuna).
- Paleta de gráfico oficial única (`src/lib/erp-chart-palette.ts`, 8 cores, validada pela skill
  `dataviz`), espelhada em `--chart-cat-1..8`.
- Cor de status: `src/lib/status-tokens.ts` — único ponto de verdade, 8 categorias semânticas +
  mapa por domínio. Deliberadamente um sistema de cor à parte do tema (valores Tailwind fixos, não
  CSS vars) — decisão documentada, não um erro.
- Ícones: `lucide-react` direto, 8 ambiguidades de significado já resolvidas no ADR-015/Lote 2
  (`Trash2` só exclusão real, `Ban` desativação reversível, etc.). Duas duplicações mantidas
  deliberadamente (Clientes/Fornecedores = `Users`; Orçamentos/Relatórios = `FileText`).
- Escala tipográfica formalizada como convenção documentada em `globals.css:109-119` (não imposta por
  componente/classe própria).

### 1.2 Componentes reutilizáveis já maduros (não recriar)
- **`domain/`**: `ConfirmDialog`/`useConfirm` (substituiu `window.confirm()`), `AsyncButton` (loading +
  disable automático), `FormDialog` (casco padrão de modal), `PaginationBar`, `StatusBadge`,
  `SearchInput`, `TableSkeleton`/`EmptyTableRow`, `ActionResultDialog`/`useActionResult` (painel
  "o que fazer agora" pós-ação cross-module, com deep-link).
- **`platform/`** (camada mais recente, ADR-018): `DataTable` (paginação, ordenação, seleção +
  **ações em lote já implementadas de verdade, mesmo sem nenhum consumidor ainda**, estados
  loading/vazio/erro, colunas responsivas via `hideBelow`), `FilterBar` (só layout, nunca componente
  próprio), `PageHeader`, `DetailDrawer` (substituiu 3 mecanismos de drill-down incompatíveis),
  `CommandPalette` (Ctrl/Cmd+K — **hoje já faz busca global real de 7 entidades via `/api/search`**,
  respeitando RBAC por entidade — não é "só navegação", como uma leitura rasa do comentário do
  componente poderia sugerir; confirmar caso a caso).
- **Estrutura de página fixa e permanente** (ADR-018 §0.1): `PageHeader → KPI Row (opcional) → Alert
  Center (opcional) → FilterBar → DataTable → DetailDrawer/FormDialog`. 13/13 módulos já seguem.
- **`form/`**: `CepInput`/`CnpjInput` (autopreenchimento real via BrasilAPI/ViaCEP, com validação de
  dígito verificador), `DatePicker` (calendário visual, mais recente que `DateInput`), `CurrencyInput`,
  `QuantityInput`/`PercentInput`, `UnitSelect` (domínio fechado).
- **Dashboard**: `DashboardAlertCenter` com severidade **sempre calculada no backend**, nunca um
  limiar global — decisão permanente do ADR-019, rejeitando explicitamente a alternativa mais simples.

### 1.3 Decisões permanentes (não contradizer sem motivo forte e aprovação explícita)
- "Não quero mais desenvolver telas, quero desenvolver componentes reutilizáveis" — regra central do
  ADR-018.
- Nenhum componente de `platform` importa outro — composição só na página.
- Severidade de alerta sempre no backend.
- Mudança de status de um registro migrado para `platform` vive dentro do `DetailDrawer`, nunca mais
  via Select inline na linha da tabela — **este levantamento encontrou módulos que ainda usam Select
  inline na tabela** (ex. Orçamentos, `orcamentos-page.tsx:326-334`) — não está claro se é um módulo
  ainda não migrado ao padrão ou uma exceção deliberada; **decisão pendente #1** (ver Parte 5).
- RBAC: não criar Roles artificiais para visões (Diretoria/Administrativo são visões de Dashboard, não
  papéis de autenticação).
- Baseline de qualidade: tsc/lint/build/test limpos antes e depois de cada lote; lint só pode diminuir.

### 1.4 Backlog já conhecido, nunca resolvido (candidatos fortes deste levantamento)
- Sistema de toast **duplicado**: primitivos shadcn (`ui/toast.tsx`, `toaster.tsx`, `use-toast.ts`)
  nunca importados em lugar nenhum — código morto nunca identificado em nenhuma auditoria anterior
  (achado novo desta rodada).
- `purchaseOrderStatusLabels` sem tradução de 2 estados reais (`pending_approval`/`approved` aparecem
  como enum bruto no badge).
- Validação Zod ausente na maioria das rotas `PUT` (catalogado desde a Fase 1).
- Helpers `findByIdOrThrow()`/`paginate()` duplicados em 15 e 12 Services respectivamente.
- ~18-20 warnings de lint pré-existentes (`react-hooks/set-state-in-effect`/`purity`), rebaixados a
  `warn`, nunca corrigidos de fato.

---

## PARTE 2 — Achados por módulo (resumo; detalhe completo nos relatórios de origem desta rodada)

### 2.1 Comercial (Orçamento → Pedido de Venda → Clientes)
- Criar e enviar um orçamento exige transitar por 3 telas/ações desconectadas (formulário → mudar status
  na tabela → menu de PDF) para uma tarefa que o vendedor vê como uma ação só.
- `createQuoteSchema`/`createClientSchema` não exigem cliente, itens, nem nome — é possível salvar
  orçamento e cliente inteiramente vazios (`src/app/dto/index.ts:15-41,72-97`).
- A transição mais arriscada (`sent→approved`, gera Ordens de Produção reais,
  `quote.service.ts:338-361`) **não tem confirmação**; a menos arriscada (converter em pedido, que já é
  auditada e reversível na prática) **tem** (`orcamentos-page.tsx:243` vs. `326-334`).
- Editar um orçamento **já convertido** em Pedido de Venda é permitido sem bloqueio nem aviso — divergência
  silenciosa de preço entre os dois documentos é possível (`quote.service.ts:223-269` não verifica
  `quote.salesOrder`).
- Dropdowns de Cliente/Produto no formulário de Orçamento (e de Produto no formulário de OP) só trazem os
  20 primeiros registros por ordem alfabética, sem busca — catálogos reais ficam parcialmente
  inacessíveis nesses formulários (`src/app/page.tsx:203-233`, `parsePagination` default 20,
  `api-utils.ts:98-101`).
- Navegação Pedido→Orçamento não existe (só Orçamento→Pedido) — assimetria de navegação entre
  documentos relacionados.
- Sem soft-delete/inativação de Cliente (campo `active` existe no schema, nunca exposto na tela).
- Histórico de status (`StatusHistory`, gravado a cada transição) nunca é exibido em nenhuma tela de
  Orçamento/Pedido.

### 2.2 Produção (Ordens de Produção, Produtos/BOM) + infraestrutura sem tela
- O roadmap de status "Planejada→Liberada→Em Produção→Pausada→Finalizada→Encerrada" **não existe no
  código** — o `status` real tem só 5 valores (`planned/in_progress/paused/completed/cancelled`,
  `producao/types.ts:3-5`). Precisa decisão: implementar o roadmap descrito, ou aceitar os 5 estados
  reais como definitivos (**decisão pendente #2**).
- Concluir uma OP e "Produzir" (ambos irreversíveis, disparam baixa de estoque/reserva/lote) não têm
  nenhuma confirmação.
- **Achado de maior impacto de todo o levantamento**: MRP, Reserva de Material, Rastreabilidade por
  Lote e BOM formal (Revisão de Engenharia) são **100% inacionáveis pelo usuário** — não existe nem
  rota de API para nenhum dos quatro (confirmado por varredura completa de `src/app/api/**`). O motor de
  MRP nunca roda em produção (nenhum chamador em todo o código fora de si mesmo e dos testes). A única
  exposição indireta é um punhado de KPIs agregados no Dashboard de Produção, com links que apontam
  para módulos (Produção, Requisições) que não têm nenhuma tela/lista correspondente — um "beco sem
  saída" de UX real, já em produção hoje.
- O PDF impresso da Ordem de Produção usa sempre a receita simples (`ProductMaterial`), nunca a
  `BomRevision` congelada que o motor real de consumo usa quando existe — risco de o papel entregue ao
  chão de fábrica divergir do que será efetivamente baixado do estoque.
- Criar produto com imagem/BOM exige salvar 2 vezes (as seções só aparecem em modo edição, sem aviso).
- Dois campos chamados "Material" na mesma tela de Produto com semânticas diferentes (`materialId` 1:1
  vs. BOM simples N:N) — risco real de confusão.

### 2.3 Estoque + Compras (Matérias-Primas, Fornecedores, Requisições, Compras, Estoque)
- **Duas portas de entrada para o mesmo saldo de estoque**, com controle bem diferente: formulário de
  Material (`material-form-fields.tsx:33`, sem motivo, sem `StockMovement`) vs. tela de Ajuste
  (`estoque-page.tsx:111`, motivo obrigatório + `StockMovement` real). Mesma operação sensível, duas
  trilhas de auditoria diferentes.
- Nenhuma segregação de aprovação em toda a cadeia Requisição→Cotação→Aprovação→PC→Recebimento — os dois
  pontos de aprovação (`sent→approved` de Requisição, `pending_approval→approved` de PC) usam a mesma
  permissão genérica de `update`, sem exigir um segundo aprovador nem alçada por valor.
- Dados de auditoria de aprovação (`approvedBy`/`approvedAt`/`sentAt`/`confirmedAt`) são gravados mas
  nunca exibidos em nenhuma das duas telas.
- Re-entrada do mesmo dado (fornecedor/preço estimado) 2x: uma vez na criação do item da Requisição, de
  novo na tela de Cotação — o primeiro nunca vira cotação registrada de fato.
- **Recebimento de mercadoria não captura o lote/validade real do fornecedor pela UI** — o backend
  suporta (`purchase-order.repository.ts:90,130`), mas o dialog de recebimento não expõe esses campos;
  o número de lote é sempre gerado internamente/sequencial, nunca o do fornecedor. Isso esvazia
  parcialmente a proposta de valor da Rastreabilidade por Lote.
- Recebimento não tem segunda etapa de revisão nem forma de estorno — uma quantidade errada digitada já
  dá baixa de estoque real com 1 clique, sem tela de "desfazer recebimento".
- Estoque (aba Saldo) não pagina no servidor — carrega o catálogo inteiro de uma vez
  (`estoque-page.tsx:31-33`, comportamento pré-existente assumido, não corrigido).
- Nenhum alerta de estoque mínimo integrado nas telas de Requisição/Compras (só existe em
  Materiais/Estoque).

### 2.4 Financeiro + Relatórios
- **Achado crítico**: os relatórios de saldo, fluxo de caixa projetado, margem bruta, valorização de
  estoque e custo por material têm API funcionando e testada, mas **nenhuma tela os consome** — só
  1 widget de dashboard usa 1 dos 5 métodos. Ninguém do financeiro consegue ver fluxo de caixa ou margem
  sem acesso direto à API.
- Nenhum indicador visual de título vencido na lista — o backend já calcula "overdue" para o dashboard,
  mas a lista de Contas a Pagar/Receber não colore/destaca linhas vencidas.
- Sem link/navegação da conta financeira para o Pedido de Compra/Venda ou Fatura de origem — tudo texto
  estático.
- Filtro de data em Relatórios (módulo geral) não reduz a consulta ao banco — filtragem acontece em
  memória depois de já ter carregado tudo (`report.service.ts:60-141`); tabela de resultado tampouco
  pagina — risco real de tela travar em base grande.
- Valor do diálogo de pagamento/recebimento vem pré-preenchido com o saldo **total** em aberto, sem
  nenhum destaque — risco de baixa total acidental quando a intenção era parcial.
- Rótulo "Compras (Requisições)" no módulo de Relatórios na verdade consulta `Requisition`, não
  `PurchaseOrder` — confuso para quem espera ver o Pedido de Compra formal.
- Ações críticas (registrar pagamento, cancelar) escondidas atrás de menu "..." em vez de botão visível.

### 2.5 Cadastros/Configurações/Administração
- **Não existe módulo de Qualidade hoje** — nem parcial. As únicas 3 menções encontradas em todo o
  projeto são: um selo decorativo de marketing no rodapé do PDF ("QUALIDADE"), um enum de tipo de
  Requisição proposto e depois explicitamente removido (ADR-009), e menções em ADRs antigos de que uma
  futura entidade de inspeção/não-conformidade *poderia* existir um dia — nunca implementada. **Decisão
  pendente #3**: este levantamento assumia a existência dessa rotina; precisa esclarecer se o pedido é
  para revisar algo que já existe (não existe) ou para *propor a criação* de um módulo de Qualidade do
  zero (escopo novo, não uma revisão).
- **Risco de maior gravidade encontrado em Configurações**: promover um usuário a `admin` usa o mesmo
  botão "Salvar" genérico de qualquer campo do formulário — nenhuma confirmação extra para a ação mais
  sensível de todo o RBAC.
- A Central de Administração (ADR-021: Diagnóstico/Console SQL/Correções) está **tecnicamente isolada**
  (RBAC mais restrito, único lugar do sistema com padrão preview→confirmação→aplicar consistente) mas
  **visualmente perdida**: aparece na mesma lista plana das 9 sub-abas de Configurações, sem seção,
  rótulo ou hierarquia visual diferenciando-a das abas de configuração de negócio comum.
- Numeração de Documentos: o campo "Próximo Número" é editável livremente, sem confirmação nem aviso de
  que reduzir esse valor pode gerar documentos duplicados (risco fiscal/legal) — o padrão de
  preview+confirmação já existe em Correções e não foi replicado aqui, apesar do risco ser maior.
- Itens de menu de Configurações não são filtrados por RBAC antes de navegar — um `manager` vê e clica
  em "Console SQL"/"Correções" e só descobre "Acesso restrito a administradores" depois de já ter
  entrado na tela.

### 2.6 Transversais — Erros, UX autoexplicativa, Performance
- **Erros**: mensagem de erro depende inteiramente do texto que o Service decidiu lançar — quando existe
  exceção de negócio específica, o texto já é razoavelmente explicativo; quando não existe (erro de
  rede/inesperado), é sempre um "Erro ao X" genérico sem causa nem sugestão. Nenhum botão "copiar
  detalhes"/"reportar". Uma rota (`api/quotes/[id]/route.ts:32-35`) devolve a mensagem técnica crua do
  erro ao usuário final, deliberadamente ("modo debug"), inconsistente com o padrão do resto do sistema.
- **Autoexplicativo**: tooltips praticamente não existem (componente instalado, nunca usado fora da
  sidebar). Estados vazios são só texto, nunca oferecem "criar o primeiro X". `StatusHistory` é
  write-only (gravado, nunca lido/exibido) em todo o sistema, não só nos módulos já citados. Avisos de
  pendência só existem agregados no Dashboard — nenhuma tela de módulo mostra sua própria contagem de
  pendências. Quem fez/quando uma ação quase nunca aparece na própria tela do registro (só no log de
  auditoria escondido em Configurações).
- **Performance/produtividade**: `@tanstack/react-query` está instalado (`package.json`) e **nunca
  usado** em lugar nenhum — todo fetch é `useEffect`+`fetch` direto, sem cache. **O app inteiro é uma SPA
  de estado único que desmonta o componente do módulo a cada troca de aba do menu lateral** — trocar de
  módulo e voltar sempre reseta busca/filtro/página, porque o componente é recriado do zero. Nenhum
  filtro é sincronizado com a URL. Bulk actions já implementadas na `DataTable` mas nenhum módulo as usa.
  Vários catálogos usados para popular selects de outros módulos têm limites silenciosos (20-100 itens)
  sem paginação nem busca.

---

## PARTE 3 — Tabela consolidada de achados (classificados)

Legenda de Prioridade: 🔴 Crítica · 🟠 Alta · 🟡 Média · ⚪ Baixa.
Legenda de Complexidade: P (pequena, 1 subetapa) · M (média, requer novo endpoint/tela) · G (grande,
mudança estrutural/arquitetural).

| # | Problema encontrado | Tela/rotina afetada | Impacto para o usuário | Frequência provável | Risco operacional | Solução recomendada | Complexidade | Prioridade | Dependências | Critério de aceite |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Relatórios financeiros (fluxo de caixa, margem, valorização, custo por material) sem nenhuma tela | Financeiro/Relatórios | Alto — decisão de negócio sem visibilidade | Diária/semanal (financeiro) | Nenhum diretamente, mas decisões tomadas às cegas | Construir telas consumindo as 5 APIs já existentes | M | 🔴 | Nenhuma (backend pronto) | Financeiro consegue ver e filtrar por período os 5 relatórios sem acessar API diretamente |
| 2 | MRP/Reserva/Lote/BOM formal sem nenhuma rota de API nem tela | Produção (infra sem tela) | Alto — motor de reposição automática nunca roda; rastreabilidade de lote inexistente na prática | Diária (PCP) se existisse | Alto — decisões de compra/produção sem apoio do sistema já construído | Expor no mínimo leitura (rotas de API + tela) para Reserva e Lote; decidir gatilho de execução do MRP | G | 🔴 | Nenhuma (services prontos e testados) | PCP consegue ver reserva de material e rastrear um lote pela UI sem acessar o banco |
| 3 | Recebimento não captura lote/validade real do fornecedor | Compras → Recebimento | Alto — rastreabilidade de lote é interna, não física | A cada recebimento de matéria-prima lote-controlada | Alto — não-conformidade não rastreável ao lote físico real | Expor campos de lote/validade do fornecedor no dialog de recebimento | M | 🔴 | # 2 (mesma frente de rastreabilidade) | Lote do fornecedor fica gravado e visível a partir do recebimento |
| 4 | Aprovação sem alçada/segunda pessoa em Requisição, PC e elevação de usuário a Admin | Requisições, Compras, Usuários | Alto — risco de controle interno | A cada aprovação | Alto — fraude/erro sem segunda checagem | Confirmação reforçada + (decisão) segunda pessoa/alçada por valor | M | 🔴 | Decisão de negócio sobre alçada (pendente #4) | Aprovar exige confirmação explícita citando o efeito; elevar a Admin pede confirmação dedicada |
| 5 | Orçamento editável após conversão em Pedido de Venda | Orçamentos | Alto — divergência de preço silenciosa | Sempre que um orçamento convertido é reaberto | Alto — cliente/produção podem seguir dados diferentes | Bloquear edição de campos de preço ou avisar explicitamente | P | 🔴 | Nenhuma | Editar orçamento convertido mostra aviso ou bloqueia campos de valor |
| 6 | Duas portas para editar saldo de estoque com controle desigual | Materiais (form) vs. Estoque (ajuste) | Alto — saldo alterado sem motivo/trilha em um dos dois caminhos | Ocasional, mas alto impacto quando ocorre | Alto — estoque real diverge do sistema sem explicação | Tornar "Estoque atual" somente leitura no form de Material; direcionar sempre para Ajuste | P | 🔴 | Nenhuma | Não é mais possível alterar saldo fora da tela de Ajuste |
| 7 | Transições irreversíveis (concluir OP, aprovar orçamento→gera OP, registrar recebimento) sem confirmação | Produção, Orçamentos, Compras | Alto — efeito colateral real em estoque/produção por engano | Diária | Alto | Adicionar `useConfirm()` explicando a consequência antes da transição | P | 🔴 | Nenhuma | Cada transição irreversível pede confirmação citando o efeito (ex.: "isso vai baixar X do estoque") |
| 8 | Catálogos (Produto/Cliente/Fornecedor/OP) truncados a 20-100 itens sem busca nos selects | Orçamentos, Produção, Requisições, Fornecedores | Médio-alto — itens fora do topo alfabético inacessíveis | Diária, cresce com o cadastro | Médio — leva a recadastro duplicado por não achar o registro | Combobox com busca server-side (reaproveitar padrão do Command Palette) | M | 🟠 | Nenhuma | Selecionar qualquer item do catálogo real, independente da posição alfabética |
| 9 | Ações críticas de linha escondidas em menu "⋮" sem hierarquia | Todos os módulos | Médio — ação mais usada não é a mais visível | Diária | Baixo (usabilidade, não dado) | Promover 1-2 ações mais frequentes para botão visível na linha; manter resto no menu | P | 🟠 | Nenhuma | Ação primária de cada tela acessível em 1 clique direto |
| 10 | App desmonta módulo a cada troca de aba — perde filtro/busca/página sempre | Toda navegação (`page.tsx`) | Médio-alto — retrabalho constante de refiltrar | Múltiplas vezes por sessão | Baixo (usabilidade) | Adotar `react-query` (já instalado) + preservar estado por módulo, ou roteamento real | G | 🟠 | Decisão arquitetural (roteamento real é fase própria já registrada) | Trocar de módulo e voltar preserva filtro/busca/página |
| 11 | Nenhum indicador de título financeiro vencido na lista | Financeiro | Médio-alto | Diária (financeiro) | Médio — atraso não percebido a tempo | Colorir/destacar linha vencida reaproveitando cálculo já existente | P | 🟠 | Nenhuma | Título vencido se destaca visualmente na lista, não só no dashboard |
| 12 | Sem navegação entre documentos relacionados (Financeiro↔PC/PV, PC↔Requisição, Movimentação↔PC, Pedido↔Orçamento) | Financeiro, Compras, Estoque, Comercial | Médio — obriga busca manual cruzada | Diária | Baixo | Adicionar link/deep-link nos textos hoje estáticos | P/M por caso | 🟠 | Nenhuma | Clicar no documento de origem abre o registro correspondente |
| 13 | Filtro de data em Relatórios filtra em memória, sem paginação de resultado | Relatórios | Médio — risco de tela travar | Ocasional, cresce com o tempo/dados | Médio (performance) | Mover filtro de data para a query; paginar resultado | M | 🟠 | Nenhuma | Gerar relatório de um período pequeno não carrega a base inteira |
| 14 | Histórico de status (`StatusHistory`) e dados de aprovação gravados mas nunca exibidos | Requisições, Compras, Orçamentos, Pedidos | Médio — auditoria existe mas é invisível | Sempre que o usuário quer entender "o que aconteceu" | Baixo | Timeline simples no `DetailDrawer` | M | 🟠 | Nenhuma (dado já existe) | Detalhe do registro mostra linha do tempo de status + quem aprovou/quando |
| 15 | Numeração de documentos editável sem aviso de duplicidade | Configurações → Numeração | Médio-alto (risco fiscal) | Rara, mas grave quando ocorre | Alto (documentos fiscais duplicados) | Preview + confirmação explícita, mesmo padrão de Correções | P | 🟠 | Nenhuma | Reduzir/alterar número pede confirmação explicando o risco de duplicidade |
| 16 | Central de Administração sem hierarquia visual dentro de Configurações | Configurações (9 sub-abas) | Médio — usuário não percebe que é uma área de risco técnico distinto | Sempre que navega em Configurações | Baixo | Agrupar visualmente (seção/rótulo) Diagnóstico/Console/Correções, separado de config de negócio | P | 🟡 | Nenhuma | Central de Administração aparece como seção distinta, não misturada |
| 17 | Menu de Configurações não filtra por RBAC antes de navegar | Configurações | Baixo-médio | Ocasional (usuários não-admin) | Baixo | Ocultar itens que o usuário não pode acessar, não só bloquear ao entrar | P | 🟡 | Nenhuma | `manager` não vê Console SQL/Correções no menu |
| 18 | Elevação de privilégio (Admin) sem confirmação dedicada | Usuários | Alto (segurança) mas baixa frequência | Rara | Alto | Confirmação específica ao selecionar perfil Admin | P | 🟠 | Nenhuma | Selecionar "Administrador" pede confirmação explícita |
| 19 | Mensagens de erro genéricas sem causa/sugestão quando não há exceção de negócio específica | Todo o sistema | Médio | Diária (qualquer erro inesperado) | Baixo | Padrão de mensagem com causa provável + próxima ação, mesmo para erros genéricos | M | 🟡 | Nenhuma | Erro genérico sugere ao menos 1 próxima ação |
| 20 | Toast shadcn morto nunca removido | Todo o frontend | Nenhum para o usuário (débito técnico) | N/A | Nenhum | Remover `ui/toast.tsx`/`toaster.tsx`/`use-toast.ts` | P | ⚪ | Nenhuma | Build sem esses 3 arquivos, sem regressão |
| 21 | Tooltips praticamente inexistentes | Todo o sistema | Baixo-médio | Diária (ícones ambíguos) | Baixo | Usar `ui/tooltip.tsx` já instalado em ícones/ações ambíguas | P | 🟡 | Nenhuma | Ícones de ação ambígua têm tooltip ao passar o mouse |
| 22 | Estados vazios sem CTA | Todo o sistema | Baixo-médio (onboarding) | Ocasional (cadastro novo/vazio) | Baixo | `EmptyTableRow` ganha botão opcional "Criar o primeiro X" | P | 🟡 | Nenhuma | Tela vazia de um módulo oferece o botão de criar |
| 23 | Bulk actions prontas na `DataTable` sem nenhum consumidor | Módulos com ações repetitivas (Requisições, Estoque?) | Médio (produtividade) | Depende do módulo | Baixo | Habilitar em 1-2 módulos onde faz sentido real (não forçar em todos) | P/M | 🟡 | Definir quais módulos primeiro | Pelo menos 1 módulo com ação em lote funcional |
| 24 | Sem soft-delete/inativação de Cliente | Clientes | Baixo-médio | Ocasional | Baixo | Expor campo `active` já existente no schema | P | 🟡 | Nenhuma | Cliente pode ser marcado inativo sem excluir |
| 25 | Valor pré-preenchido com saldo total no pagamento/recebimento sem alerta | Financeiro | Médio | Ocasional (pagamento parcial) | Médio (baixa total acidental) | Destacar visualmente quando o valor = saldo total | P | 🟡 | Nenhuma | Campo avisa quando o valor lançado quita o título inteiro |
| 26 | Rótulo "Compras (Requisições)" ambíguo | Relatórios | Baixo | Ocasional | Baixo | Renomear ou separar visualmente de Pedido de Compra | P | ⚪ | Nenhuma | Rótulo deixa claro que é Requisição, não PC |
| 27 | Não existe módulo de Qualidade | N/A (não existe) | Depende da decisão | N/A | N/A | Decisão do usuário: criar do zero (escopo novo) ou remover da expectativa | — | — (decisão pendente) | Decisão de negócio | Resposta explícita do usuário registrada |
| 28 | PDF de OP pode divergir do que é realmente consumido (usa receita simples, não BOM formal) | Produção | Médio-alto (quando BOM formal existir e divergir) | Rara hoje (poucas BomRevision em uso real) | Médio | PDF passa a usar a mesma resolução de linhas do motor de consumo real | M | 🟡 | # 2 (exposição de BOM formal) | PDF impresso sempre reflete o que será baixado do estoque |

*(Esta tabela cobre os achados de maior recorrência/impacto identificados nas 7 auditorias; o detalhe
completo — incluindo achados de prioridade baixa não listados aqui — está preservado nos relatórios de
origem desta rodada, referenciados na Parte 0.)*

---

## PARTE 4 — Roadmap proposto (fases pequenas, verificáveis, com aprovação por fase)

Ordem pensada para: (a) resolver primeiro o que é risco de dado/controle interno com baixa complexidade,
(b) só depois entrar em mudanças estruturais maiores, (c) nunca misturar uma decisão de negócio pendente
com uma implementação já em andamento.

### Fase UX-1 — Integridade e controle operacional (risco alto, complexidade majoritariamente pequena)
Itens #4, #5, #6, #7, #15, #18 da tabela. Nenhum requer schema novo. Cada subetapa é independente e
testável isoladamente:
1. Confirmação em transições irreversíveis (aprovar orçamento, concluir OP, registrar recebimento).
2. Bloqueio/aviso em edição de orçamento já convertido.
3. Tornar "Estoque atual" somente leitura no cadastro de Material.
4. Confirmação reforçada em Numeração de Documentos (preview de impacto).
5. Confirmação dedicada para elevação de usuário a Admin.
6. (Decisão pendente #4 primeiro) Segunda pessoa/alçada de aprovação em Requisição e PC.

### Fase UX-2 — Visibilidade do que já existe (alto impacto, reaproveita backend pronto)
Itens #1, #11, #12, #14 da tabela:
1. Telas de relatórios financeiros (saldo, fluxo de caixa, margem, valorização, custo por material).
2. Indicador visual de título vencido.
3. Links de navegação entre documentos relacionados (bidirecionais).
4. Timeline de status + dados de aprovação nos `DetailDrawer` já existentes.

### Fase UX-3 — MRP/Reserva/Lote/BOM formal (maior, decisão de escopo antes de iniciar)
Itens #2, #3, #28. Esta fase precisa de uma decisão prévia (ver Parte 5, pendente #5): expor como
consulta somente-leitura primeiro (menor risco) ou já incluir ações (aprovar sugestão de MRP, etc.).
Proposta de subetapas, uma vez decidido o escopo:
1. Rota de API + tela de consulta de Reserva de Material (ligada à OP).
2. Rota de API + tela de consulta de Rastreabilidade por Lote (forward/backward).
3. Captura de lote/validade do fornecedor no recebimento.
4. PDF de OP passa a refletir a resolução real de consumo (BOM formal quando existir).
5. (Só depois de decidir o gatilho) Exposição de MRP — sugestões e execução.

### Fase UX-4 — Catálogos e navegação (estrutural, mais arriscada tecnicamente)
Itens #8, #10:
1. Combobox com busca server-side para Produto/Cliente/Fornecedor/OP nos formulários.
2. Avaliação de `react-query` para cache entre módulos (sem trocar roteamento ainda).
3. Preservação de filtro/busca/página ao trocar de módulo (solução mínima antes de considerar
   roteamento real, que já é uma fase própria registrada e fora deste levantamento).

### Fase UX-5 — Padrão de erros e mensagens
Itens #19, #20:
1. Padrão de mensagem de erro com causa provável + próxima ação (mesmo sem código estruturado).
2. Remoção do toast shadcn morto.
3. Uniformizar a rota que hoje devolve erro técnico cru.

### Fase UX-6 — Recursos autoexplicativos
Itens #21, #22, #23, #24, #25:
1. Tooltips em ícones ambíguos.
2. Estados vazios com CTA.
3. Bulk actions habilitadas nos 1-2 módulos onde fizer mais sentido.
4. Soft-delete/inativação de Cliente.
5. Alerta visual de "quitação total" no pagamento/recebimento financeiro.

### Fase UX-7 — Polimento e organização visual
Itens #9, #13, #16, #17, #26:
1. Promover 1-2 ações mais frequentes para fora do menu "⋮" por módulo.
2. Mover filtro de Relatórios para a query + paginar resultado.
3. Hierarquia visual da Central de Administração dentro de Configurações.
4. Ocultar itens de menu que o RBAC do usuário não permite.
5. Ajuste de rótulo "Compras (Requisições)".

**Cada fase acima segue a mesma disciplina já usada no projeto**: levantamento específico (se a fase
tiver decisões de design a resolver), implementação em subetapas pequenas, tsc/lint/build/test limpos
antes e depois, relatório de fechamento, atualização deste ADR e do ADR-001, Graphify atualizado.
Nenhuma fase começa sem aprovação explícita da anterior.

---

## PARTE 5 — Decisões pendentes (precisam da sua resposta antes de qualquer implementação)

1. **Select inline de status na tabela** (Orçamentos) vs. `DetailDrawer` (padrão declarado permanente
   no ADR-018): manter a exceção, migrar para o padrão, ou era uma decisão consciente que eu não
   encontrei registrada?
2. **Roadmap de status de Produção** ("Planejada→Liberada→...→Encerrada") citado no plano original do
   projeto nunca foi implementado — os 5 estados reais (`planned/in_progress/paused/completed/
   cancelled`) ficam como estão, ou o roadmap de 6+ estados deve ser implementado agora?
3. **Módulo de Qualidade**: não existe hoje, nem parcialmente. O pedido original assumia que existia.
   Criar do zero é um escopo novo (não uma "revisão") — quer que eu inclua isso no roadmap como uma fase
   própria, ou fica fora deste levantamento?
4. **Alçada de aprovação** (Requisições, Compras): quer segunda pessoa obrigatória, limite de valor, ou
   só reforçar a confirmação visual sem mudar a regra de quem pode aprovar?
5. **Escopo inicial de MRP/Reserva/Lote (Fase UX-3)**: começar só com telas de consulta (menor risco,
   sem novas regras de negócio) e decidir ações (aprovar sugestão, disparar cálculo) depois de validar a
   consulta, ou já desenhar o fluxo completo de uma vez?

---

## PARTE 6 — Fase UX-1 implementada (2026-07-25)

Usuário aprovou o levantamento e pediu para começar. O item 6 da Fase UX-1 (segunda pessoa/alçada de
aprovação) dependia da decisão pendente #4, ainda não respondida — implementada a versão mínima
(confirmação reforçada, sem nova regra de RBAC), documentada explicitamente abaixo; se a resposta à
decisão #4 pedir mais (segundo aprovador obrigatório, alçada por valor), isso vira uma subetapa nova.

1. **Confirmação em transições irreversíveis** — `useConfirm()` explicando a consequência antes de:
   aprovar orçamento (`orcamentos-page.tsx`, `changeStatus`, status `approved`), concluir OP
   (`producao-page.tsx`, `changeStatus`, status `completed`), registrar produção
   (`producao-page.tsx`, `registerProduction`) e confirmar recebimento de mercadoria
   (`compras-page.tsx`, `confirmReceive`).
2. **Aviso ao editar orçamento já convertido** — `orcamentos-page.tsx` passa a rastrear
   `editingSalesOrder` (vindo de `QuoteListRow.salesOrder`, já existente) e mostra um banner de aviso
   dentro do `FormDialog` quando o orçamento sendo editado já gerou um Pedido de Venda. Decisão
   deliberada: **não bloqueou a edição** (removeria funcionalidade existente sem necessidade
   comprovada) — só torna o risco de divergência visível antes de editar.
3. **"Estoque atual" somente-leitura na edição de Material** — dois lados:
   - Frontend: `material-form-fields.tsx` recebe `isEditing`; em edição, o campo vira `Input disabled`
     com nota apontando para Estoque → Ajustar; na criação continua editável (saldo inicial de
     cadastro, não uma alteração de saldo estabelecido).
   - Backend: `material.service.ts.update()` agora sempre ignora `stockQty` do corpo da requisição
     (mesmo padrão dos outros campos já excluídos: `_count`, `suppliers`, etc.) — fecha a porta mesmo
     para quem chamar a API diretamente, não só quem usa a tela. Teste novo:
     `tests/material-stock-edit-guard.test.ts`.
4. **Confirmação reforçada na Numeração de Documentos** — `numeracao-tab.tsx` guarda um snapshot do
   `nextNumber` carregado do servidor por sequência; ao salvar, se o valor mudou desde o carregamento,
   pede confirmação citando o valor antigo/novo e o risco de duplicidade, antes do PUT.
5. **Confirmação dedicada para elevar usuário a Admin** — `usuarios-page.tsx` rastreia
   `editingOriginalRole`; ao salvar, se o perfil final é `admin` e não era antes (usuário novo direto
   como admin, ou promoção de um usuário existente), pede confirmação nomeando o usuário antes do
   PUT/POST.
6. **Confirmação reforçada de aprovação (versão mínima)** — `requisicoes-page.tsx` (`sent→approved`)
   e `compras-page.tsx` (`pending_approval→approved`) ganharam confirmação explicando que a aprovação
   é feita sem segundo aprovador — nenhuma mudança de RBAC/regra de negócio nesta rodada, só
   visibilidade do risco. **Decisão #4 continua pendente** para saber se isso precisa virar uma regra
   real (segundo aprovador, alçada por valor).

**Verificação**: tsc limpo, lint 34 (net zero, nenhum warning novo), 340/340 testes (1 novo:
`material-stock-edit-guard.test.ts`), build limpo.

## PARTE 7 — Fase UX-2 implementada (2026-07-25)

Nenhum dos 4 itens desta fase dependia de decisão pendente — todos reaproveitam backend já pronto e
testado, sem regra de negócio nova.

1. **Telas de relatórios financeiros** — nova aba "Relatórios" dentro de Financeiro
   (`financeiro-relatorios-tab.tsx`), consumindo as 5 rotas que já existiam sem nenhuma tela: Saldo
   de Contas (`/saldo`), Fluxo de Caixa Projetado com seletor de horizonte 30/60/90 dias
   (`/fluxo-caixa`, reaproveitando `DashboardChart` já existente — 2 séries, entradas/saídas),
   Margem Bruta Estimada por período (`/margem`, com aviso explícito da limitação estrutural já
   documentada em `financial-report.service.ts`), Valorização de Estoque (`/valorizacao-estoque`) e
   Histórico de Custo por Material com seletor de produto (`/custo-material/[productId]`).
2. **Indicador visual de título vencido** — `isOverdue()` em `financeiro-page.tsx` (título em aberto
   com vencimento no passado) destaca a data em vermelho/negrito tanto na listagem quanto no
   `DetailDrawer` de Contas a Pagar/Receber — mesmo cálculo que já alimentava só o dashboard, agora
   também na tela onde o usuário realmente decide o que pagar/cobrar primeiro.
3. **Links de navegação bidirecionais** — 4 caminhos que só existiam num sentido ganharam o
   caminho de volta: Pedido de Compra→Requisição de origem, Pedido de Venda→Orçamento de origem,
   Financeiro→Pedido de Compra (a partir de Contas a Pagar) e Financeiro→Pedido de Venda (a partir de
   Contas a Receber). Mesmo padrão de deep-link já usado no projeto (`initialDetailId`/
   `onConsumeInitialDetail` em `page.tsx`) — `RequisicoesPage` e `OrcamentosPage` ganharam esse
   suporte pela primeira vez.
4. **Timeline de status + dados de aprovação** — `StatusHistoryService.list()` (novo, `StatusHistory`
   deixa de ser write-only) + rota `GET /api/status-history` + componente reutilizável
   `StatusTimeline` (`src/components/domain/status-timeline.tsx`), plugado no detalhe de Orçamentos,
   Pedidos de Venda, Requisições, Compras e Produção. `approvedBy`/`approvedAt` (Requisição) e
   `approvedBy`/`approvedAt`/`sentAt`/`confirmedAt` (Pedido de Compra) já existiam como colunas
   no banco (sem FK — só o id do usuário) e nunca eram lidos; `getById()` de ambos os Services agora
   resolve o nome do aprovador (`approvedByName`) sob demanda, só quando o campo existe.

**Verificação**: tsc limpo, lint 39 (+5 sobre a baseline de 34 — mesmo padrão sistêmico de
fetch-em-efeito já tolerado neste projeto em toda fase anterior, não um problema novo: 3 nos cards
independentes da aba Relatórios, 1 no `StatusTimeline`, 1 no consumo de deep-link novo em
Requisições/Orçamentos), 343/343 testes (3 novos: `tests/status-history-visibility.test.ts`), build
limpo.

## Conclusão

O sistema tem uma base de design system e componentes reutilizáveis genuinamente madura (ADR-014/015/
018/019 resolveram muito do que normalmente seria o primeiro achado de uma auditoria de UX). Os
problemas reais encontrados nesta rodada não são de estética — são de **integridade operacional**
(aprovações sem alçada, edição sem trava depois de um documento gerar outro, saldo de estoque com duas
portas de controle desigual) e de **capacidade construída e nunca exposta** (relatórios financeiros,
MRP, Reserva, Rastreabilidade de Lote — tudo pronto no backend, testado, e invisível para quem opera o
sistema). Nenhuma mudança foi implementada. Aguardando aprovação para iniciar pela Fase UX-1.
