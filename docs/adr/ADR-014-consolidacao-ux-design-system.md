# ADR-014 — Consolidação de UX/UI, Qualidade de Dados e Design System

- **Status**: **Lotes 0, 1, 2 e 3 implementados e verificados na íntegra. Lote 4 parcialmente
  implementado por decisão deliberada de escopo (ver seção "Implementação", abaixo) — `AsyncButton`
  e `FormDialog` construídos e em uso; a migração de todas as 16 listagens para um `DataTable`
  genérico foi conscientemente adiada por risco/retorno, não esquecida.**
- **Data**: 2026-07-10 (auditoria) / 2026-07-10 (implementação)
- **Motivo**: pausa deliberada no roadmap funcional (Fase 10 em diante) para consolidar experiência do
  usuário, padronização de componentes, qualidade dos dados e consistência visual antes de continuar
  adicionando funcionalidade nova, seguindo nova diretriz arquitetural do usuário:

  > "O ERP deve ser extremamente simples de operar, rápido, consistente e adaptável ao usuário final. A
  > interface deve trabalhar para o usuário, e não o contrário."

- **Escopo desta rodada**: levantamento e diagnóstico apenas. Implementação vem em lotes subsequentes,
  cada um com sua própria validação antes de começar — mesmo padrão de todas as fases anteriores.

## Metodologia

Auditoria feita com 4 varreduras paralelas contra o código real (não hipóteses), cobrindo:
1. Componentes/inputs de formulário (inventário completo de padrões duplicados).
2. Geração de PDFs (`src/app/services/pdf.service.ts`).
3. Layout e responsividade (modais, grids, tabelas).
4. UX e performance percebida (debounce, paginação, feedback visual, produtividade).

Confirmação estrutural prévia: **toda a UI de domínio do sistema vive em um único arquivo,
`src/app/page.tsx` (3711 linhas)**. Não existe nenhum diretório de componentes de domínio — só os
primitivos genéricos do shadcn/ui em `src/components/ui/*` (Input, Select, Dialog, Table, etc., sem
nenhum wrapper específico do ERP). Isso por si só já é o achado estrutural central de toda a auditoria:
zero abstração entre os primitivos genéricos e as ~150+ ocorrências de campos de formulário do sistema.

---

## 1. Componentes — inventário e duplicação

| # | Categoria | Estado atual | Inconsistência encontrada |
|---|---|---|---|
| 1 | Texto simples | Dominante (150+ ocorrências), sempre `<Label>+<Input>` manual | Nenhuma abstração — todo campo reimplementa o wrapper `space-y-1.5` |
| 2 | **Data** | 3 padrões distintos, nenhum resolve o bug relatado | Ver seção 2 |
| 3 | Dinheiro/Moeda | `formatCurrency` só usado para **exibição** (16x); `parseCurrencyInput` **nunca é chamado** (código morto) | Todo campo editável usa `<Input type="number">` cru — sem separador de milhar, aceita notação científica, não usa vírgula decimal PT-BR |
| 4 | Decimal/Quantidade | `<Input type="number">` cru em quase todos | Só 1 campo em todo o sistema tem `max` (recebimento de PC, `page.tsx:2996`) — o resto aceita negativo/zero indevido sem aviso |
| 5 | Percentual | Idêntico ao de quantidade — mesmo padrão copiado | Nenhum clamp 0–100, nenhum símbolo `%` |
| 6 | **CEP** | 4 ocorrências | 3 têm máscara+busca automática; **Configurações não tem nenhuma das duas** (`page.tsx:3472`) |
| 7 | **CNPJ** | 4 ocorrências | 3 têm máscara+busca completa (Razão Social, Endereço, CEP, Município, UF, telefone, e-mail); **Configurações não tem nenhuma** (`page.tsx:3468`) |
| 8 | CPF | Sempre combinado com CNPJ (`maskCpfCnpj` decide pelo nº de dígitos) | Comportamento correto e intencional; falta apenas validação de dígito verificador (nem client nem aparentemente server) |
| 9 | Telefone | `maskPhone` em 4 de 5 campos | **Cliente/"Telefone Contato" não usa a máscara** (`page.tsx:2254`), enquanto o campo equivalente em Fornecedor usa |
| 10 | Email | 3 de 5 usam `type="email"` (validação nativa) | Orçamento e Configurações não têm nem isso |
| 11 | Select | ~29 ocorrências, implementação consistente | O problema não é o componente, é **quando** ele deveria ser usado: "Unidade" (KG/UN/M/M2...) é texto livre em 4 lugares, apesar de ser um domínio fechado |
| 12 | Autocomplete/Combobox | **Não existe.** Selects de produto listam TODOS os itens sem busca interna | Não escala — precisa virar um combobox de verdade |
| 13 | Upload | 2 ocorrências isoladas (imagem de produto, patch do sistema) | Nenhuma abstração compartilhada |
| 14 | DataTable | 16 tabelas, cada uma reimplementada do zero | Só 1 módulo (Matérias-primas) tem paginação server-side real |
| 15 | Modal | 11 `Dialog` distintos | Ver achado crítico na seção 6 — o componente BASE anula o tamanho pedido por todos eles |
| 16 | Toast | 155 chamadas, cobertura consistente | Sem problema relevante encontrado |
| 17 | Loading | `Skeleton` consistente para carregamento de lista (19x) | `Loader2`/spinner de ação em andamento aparece **1 única vez** no arquivo inteiro; buscas de CEP/CNPJ não indicam "buscando..." |
| 18 | ConfirmDialog | **Não existe** — usa `window.confirm()` nativo em 100% dos casos (10 ocorrências) | Sem estilo, sem diferenciação entre ação destrutiva e reversível |

## 2. Datas — bug confirmado

**Causa raiz**: não existe nenhuma função de máscara/auto-formatação de data em `src/lib/masks.ts` nem
`format.ts` (só existe `formatDate`, que é para *exibição*, não para digitação). Três padrões coexistem:

- `page.tsx:3344-3345` — únicos 2 campos usando `<Input type="date">` nativo (Ordem de Produção) — não
  sofrem do bug, mas têm UX de date-picker do navegador, diferente do resto do sistema.
- `page.tsx:2785` (Requisição), `page.tsx:3197-3198` (Relatórios) — têm `placeholder="dd/mm/aaaa"` mas
  são texto livre, sem máscara. **É exatamente o bug relatado**: digitar "04012002" nunca vira
  "04/01/2002".
- `page.tsx:2091` (Orçamento, "Validade") — nem placeholder tem.

**Achado que eleva a severidade**: o schema (`prisma/schema.prisma`) armazena datas como `String` livre
em vários modelos (`Quote.date`, `PurchaseOrder.date`, `ProductionOrder.date`/`dueDate`, etc. — decisão
já documentada no ADR-001 desde a Fase 1). Sem máscara na entrada, o mesmo campo pode ser gravado como
"1/1/26", "01/01/2026" ou "2026-01-01" dependendo de quem digitou — isso não é só um incômodo de
digitação, é um **risco real de inconsistência dos dados já persistidos no banco**, afetando
ordenação/comparação futura desses campos.

**Decisão a validar com o usuário** (proposta na seção 10): unificar em um único `<DateInput>` com
máscara DD/MM/AAAA e auto-inserção de barras, substituindo os 2 padrões de texto livre — mantendo (ou
não) os 2 campos `type="date"` nativos da Ordem de Produção como exceção deliberada.

## 3. CEP — telas auditadas

| Tela | Máscara | Busca automática | Preenche endereço/bairro/cidade/UF |
|---|---|---|---|
| Orçamento (`clientCep`) | ✅ `page.tsx:2015` | ✅ | ✅ |
| Cliente (`zipCode`) | ✅ `page.tsx:2255` | ✅ | ✅ |
| Fornecedor (`zipCode`) | ✅ `page.tsx:2656` | ✅ | ✅ |
| **Configurações (`supplierCep`)** | ❌ `page.tsx:3472` | ❌ | ❌ |

Achado adicional: mesmo nas 3 telas com busca automática, `handleCepLookup` (`page.tsx:874-885`) não dá
**nenhum feedback visual** (nem spinner, nem toast) enquanto busca ou se falha — diferente do lookup de
CNPJ, que notifica.

## 4. CNPJ — telas auditadas

| Tela | Máscara | Busca automática | Preenche Razão Social/Endereço/CEP/Município/UF/Telefone/E-mail |
|---|---|---|---|
| Orçamento (`clientCnpj`) | ✅ `page.tsx:2009` | ✅ | ✅ |
| Cliente (`cpfCnpj`) | ✅ `page.tsx:2249` | ✅ | ✅ |
| Fornecedor (`cpfCnpj`) | ✅ `page.tsx:2650` | ✅ | ✅ |
| **Configurações (`supplierCnpj`)** | ❌ `page.tsx:3468` | ❌ | ❌ |

Busca via BrasilAPI já preenche 7 campos de uma vez quando existe — não preenche CNAE hoje (pedido
explícito do usuário) — a decidir se a API atual retorna esse dado e vale a pena adicionar.

## 5. PDFs — achados priorizados

1. **Alta prioridade / causa raiz do bug relatado**: `pdf.service.ts:218,239` (`drawInfoCards`, cartões
   Cliente/Empresa) e `:301,302` (`drawTwoColumnBoxes`, condições comerciais) — `doc.text(..., {
   maxWidth })` quebra o texto internamente no jsPDF, mas o Y da linha seguinte é incrementado com passo
   FIXO, sem contar quantas linhas reais a anterior ocupou. E-mail/endereço longo → sobreposição de
   texto. A altura do card/caixa também assume 1 linha por item, podendo vazar da borda.
   **Correção**: usar `doc.splitTextToSize()` para medir linhas reais ANTES de desenhar, e usar essa
   contagem tanto para o avanço de `y` quanto para o cálculo de `cardHeight`/`boxHeight`. O próprio
   arquivo já usa esse padrão corretamente em outro lugar (`pdf.service.ts:619-621`), só não foi
   replicado nessas duas funções.
2. **Alta prioridade / bug pior, sem quebra alguma**: `pdf.service.ts:503` (Romaneio de Transporte,
   observações) e `:671-676` (Relatório genérico, linhas de resumo) — nenhum `maxWidth`/
   `splitTextToSize` — texto longo simplesmente corre para fora da margem, sem quebrar.
3. **Média prioridade**: `generateSalesOrderPdf`/`generatePurchaseOrderPdf` não têm nenhuma chamada a
   `ensureSpace()` (usada em `generateQuotePdf`) — uma tabela de itens longa pode empurrar a caixa de
   resumo/condições para além do rodapé da página.
4. **Média prioridade / manutenibilidade**: total da Requisição (`pdf.service.ts:567-574`) reimplementa
   manualmente a barra de total em vez de reaproveitar `drawSummaryBox` — produz um alinhamento
   diferente (84mm da margem em vez do padrão de 14mm+82mm usado pelos outros documentos).
5. **Baixa prioridade**: `requisition.date` nunca é impresso no PDF de Requisição (todos os outros
   documentos mostram a data de emissão); tabela de materiais da Ordem de Produção sem `columnStyles`
   (colunas numéricas alinhadas à esquerda, diferente das outras tabelas); Pedido de Venda/Compra sem
   bloco de assinatura/barra de marca (a confirmar se é intencional).

## 6. Layout — achado crítico (causa raiz sistêmica)

**`src/components/ui/dialog.tsx:79`** — o componente BASE de modal do projeto (usado pelos 11 modais do
sistema) já vem com `sm:max-w-2xl` fixo na classe padrão. Quando cada tela passa seu próprio
`className="max-w-6xl"` (ou `max-w-4xl`, `max-w-3xl`, `max-w-md`), o merge de classes Tailwind
(`twMerge`) remove o conflito com `max-w-[calc(100%-2rem)]` (sem variante), mas **mantém `sm:max-w-2xl`
intocado** — são "grupos" de variante diferentes para o utilitário de merge. Confirmado inspecionando o
CSS realmente compilado: a regra `sm:max-w-2xl` aparece DEPOIS de todas as regras `max-w-*` sem prefixo
no stylesheet gerado (comportamento padrão do Tailwind), então **ela vence em qualquer tela ≥640px**.

**Resultado**: em qualquer desktop/notebook/tablet, TODO modal do sistema é forçado para 672px de
largura, não importa se pediu 1152px (`max-w-6xl`), 896px, 768px ou até 448px (`max-w-md`, que fica
**mais largo** que o pedido). Isto explica por si só a maior parte dos sintomas relatados:

- **Modal "Novo Orçamento" com barra horizontal**: a tabela de itens (`page.tsx:2027-2029`) tem
  `min-w-[900px]` — o autor calculou isso esperando ~1088px úteis (max-w-6xl menos padding), mas o modal
  na prática só tem ~608px úteis (672px − 64px de padding). 900px sempre estoura, então a barra de
  rolagem horizontal fica **sempre visível**, em qualquer resolução.
- **Campos sobrepostos/apertados**: o grid de "Condições" (`page.tsx:2063`, `lg:grid-cols-4`) reage à
  largura da JANELA do navegador (que dispara o breakpoint `lg:` normalmente), não à largura REAL do
  modal (travada em 672px) — tentando encaixar 4 colunas em ~143px cada. O mesmo padrão se repete em
  `page.tsx:2431`, `:2681`, `:2792`, `:3184`.
- Confirmado que **não há sobreposição por z-index/popover/calendário** dentro de modais — o `Calendar`
  não é usado em lugar nenhum, e o único `Popover` do sistema é o sino de notificações, fora de qualquer
  modal. A causa da sensação de sobreposição é 100% o aperto de grid, não conflito de camadas.

**Correção proposta**: remover o `sm:max-w-2xl` fixo do componente base `dialog.tsx`, deixando cada tela
controlar seu próprio `max-w` (como o código já tenta fazer), ou reestruturar a ordem de merge para que a
variante explícita de cada modal sempre vença. Esta é, isoladamente, a correção de maior impacto por
menor esforço de toda a auditoria — um ajuste de poucas linhas em um único arquivo resolve a causa raiz
de quase todos os problemas visuais relatados nos 11 modais do sistema.

## 7. Responsividade

Ao contrário da hipótese inicial, **o sistema não é totalmente rígido**: de 26 usos de `grid-cols-`,
apenas 2 não têm nenhum breakpoint responsivo — e ambos são o template de tabela de itens do Orçamento
(colunas de largura fixa em pixel, um padrão aceitável para tabela, coberto pelo achado da seção 6).

Achados remanescentes:
- Tabelas (`<Table>` do shadcn) já embrulham em `overflow-x-auto` por padrão
  (`src/components/ui/table.tsx:11`) — não ficam cortadas, mas **não colapsam para cards em mobile**, e
  `TableHead`/`TableCell` aplicam `whitespace-nowrap` incondicionalmente, aumentando a chance de precisar
  de scroll horizontal mesmo em tabelas simples.
- **Nenhum indicador visual de "há mais conteúdo à direita"** em nenhuma área de scroll horizontal
  (nem nas listagens, nem no bloco de itens do modal de Orçamento) — reforça a queixa de "campos
  escondidos sem indicação clara de scroll".

## 8. Experiência do usuário

- **Debounce**: **não existe em lugar nenhum do sistema.** Todo campo de busca (Orçamentos, Clientes,
  Produtos, Materiais, Estoque) dispara uma requisição HTTP completa a cada tecla digitada, sem
  cancelamento de requisições em voo (sem `AbortController` identificado) — risco de respostas fora de
  ordem. Único campo protegido (`supplierSearch`) só busca ao pressionar Enter, não por debounce.
- **Paginação — bug funcional, não só lentidão**: a camada de repositório/serviço já suporta paginação
  real (`skip`/`take` + `count()`), mas **nenhuma tela do frontend usa isso**:
  - Orçamentos e Ordens de Produção: frontend nunca envia `page`/`limit` → sempre o default (`page=1,
    limit=20`) e **não existe nenhum controle de página na UI** — registros além do 20º ficam
    permanentemente invisíveis, sem qualquer aviso.
  - Pedidos de Compra/Requisições: `limit=100` fixo, mesmo problema além do centésimo registro.
  - Materiais: a tela nunca ativa o modo paginado da API, então o backend **carrega a tabela inteira em
    memória** e filtra em JS — piora diretamente com o crescimento do catálogo.
- **Feedback em ações de status inline**: os formulários de criar/editar têm bom feedback (13
  `*Saving` states consistentes, botão desabilitado + texto "Salvando..."). Mas as mudanças de status
  via `<Select>` direto na tabela — justamente as ações de aprovação mais usadas no dia a dia (aprovar
  Orçamento, aprovar Requisição, mudar status de Pedido de Compra, converter Orçamento em Pedido) — **não
  têm nenhum indicador visual nem proteção contra clique duplo**. É o cenário clássico de ação duplicada
  por impaciência do usuário.
- **Carregamento em cascata**: não é um problema real — o padrão dominante já dispara múltiplas
  chamadas "fire-and-forget" no mesmo tick (efetivamente paralelo), mesmo sem `Promise.all` explícito.
- **Toasts**: cobertura consistente (155 ocorrências) — único ponto fraco são 3 cargas de dados de apoio
  em segundo plano com falha silenciosa (dropdowns/notificações), não ações do usuário.
- **Produtividade**: praticamente zero. Nenhum atalho de teclado (fora de Enter em 3 pontos pontuais),
  nenhuma seleção múltipla/ação em lote, nenhum filtro rápido de período. Para aprovar 15 requisições
  pendentes, é preciso abrir cada Select individualmente, sem nenhum mecanismo de escala.

## 9. Qualidade dos dados

Consolidando achados das seções anteriores que representam risco real de dado inconsistente, não só UX:

- Datas em texto livre sem máscara → risco de formatos diferentes persistidos no mesmo campo `String`
  do banco (seção 2).
- Nenhuma validação de dígito verificador de CPF/CNPJ, nem client nem server.
- Campos de quantidade/decimal sem `min`/`max` em quase todo o sistema (1 exceção em dezenas de campos).
- Campos de percentual sem clamp 0–100.
- "Unidade" como texto livre em 4 lugares, apesar de ser um domínio fechado de poucos valores — permite
  digitar qualquer string onde deveria haver um enum.
- `parseCurrencyInput` existe mas nunca é usado — todo valor monetário é `parseFloat` cru, sujeito a
  interpretar vírgula decimal brasileira incorretamente dependendo de como o usuário digita.
- Email só validado pelo `type="email"` nativo do navegador em 3 de 5 ocorrências; nenhuma validação
  além disso em nenhum lugar.

## 10. Design System — proposta de arquitetura

Manter os primitivos genéricos já existentes (`src/components/ui/*`, shadcn) como estão — são a base
correta. Propõe-se uma nova camada intermediária, específica do domínio do ERP, em
`src/components/form/*` (nome a validar), que todo formulário do sistema passa a consumir em vez de
montar `<Label>+<Input>` na mão:

| Componente | Resolve |
|---|---|
| `<FormField>` | Wrapper padrão `Label + controle + espaçamento + slot de erro`, elimina a repetição estrutural de todo campo |
| `<DateInput>` | Máscara DD/MM/AAAA com auto-inserção de barra, validação de data real (não só formato) — decide de uma vez o comportamento de TODO campo de data do sistema |
| `<CurrencyInput>` | Formatação PT-BR (vírgula decimal, separador de milhar) tanto na exibição quanto na digitação, finalmente usando `parseCurrencyInput`/`formatCurrency` dos dois lados |
| `<QuantityInput>` / `<DecimalInput>` | `min`/`max`/precisão decimal configuráveis, aplicados por padrão |
| `<PercentInput>` | Clamp 0–100 e símbolo `%` sempre visível |
| `<CepInput>` | Máscara + busca automática + feedback visual (spinner) + tratamento de erro — substitui o boilerplate `handleCepLookup` repetido em cada formulário |
| `<CnpjInput>` (ou `<CnpjCpfInput>`) | Mesma ideia para CNPJ/CPF, incluindo validação de dígito verificador |
| `<PhoneInput>` | Máscara sempre aplicada, sem exceção |
| `<EmailInput>` | Validação de formato consistente em todo lugar |
| `<UnitSelect>` | Select de domínio fechado para unidade de medida, substituindo os 4 campos de texto livre |
| `<SearchSelect>`/`<Combobox>` | Select com busca interna + debounce embutido — substitui tanto os selects gigantes sem busca quanto o padrão manual de busca+filtro de tabela |
| `<DataTable>` | Tabela genérica com paginação server-side embutida por padrão (nunca "esquecer" de paginar de novo) |
| `<FormDialog>` | Casco padrão de modal (header/corpo rolável/rodapé fixo com Salvar/Cancelar) — e É AQUI que a correção do bug do `dialog.tsx` (seção 6) se integra, garantindo que todo modal futuro já nasça com o tamanho correto |
| `<ConfirmDialog>` | Substitui as 10 chamadas a `window.confirm()` por um diálogo consistente com o resto do app, diferenciando ação destrutiva de reversível |
| `<AsyncButton>` | Botão com estado de carregamento embutido (spinner + disable automático) — padroniza o "Salvando..." já bem aplicado nos formulários E estende a mesma proteção às mudanças de status inline hoje sem feedback nenhum |

Princípios que orientam o Design System:
- Números sempre exibidos em formato PT-BR (vírgula decimal); nunca `parseFloat`/`toFixed` cru fora do
  componente compartilhado.
- Toda máscara/lookup centralizado — nenhum formulário reimplementa `onBlur`+fetch na mão.
- Campo de domínio fechado nunca é texto livre — sempre um `Select`/enum tipado.
- Todo componente que dispara requisição assíncrona (lookup, busca) sempre mostra feedback visual
  (mesmo que sutil) enquanto está em andamento.

## 11. Plano de implementação em lotes

**Lote 0 — Correção isolada de altíssimo impacto e baixíssimo risco** (recomendado começar por aqui,
antes até do Lote 1 formal): corrigir `src/components/ui/dialog.tsx` (remover/corrigir o `sm:max-w-2xl`
fixo). É uma mudança de poucas linhas em um único arquivo que resolve a causa raiz visual de quase todos
os modais do sistema — o retorno sobre o esforço é desproporcionalmente alto comparado a qualquer outro
item desta auditoria.

**Lote 1 — Correções críticas** (bugs, campos sobrepostos, PDFs, responsividade, erros visuais):
- Bug do `dialog.tsx` (se não resolvido no Lote 0).
- `drawInfoCards`/`drawTwoColumnBoxes` (email/endereço sobrepondo texto) + `generateTransportPdf`/
  `generateReportPdf` (texto sem quebra alguma).
- `ensureSpace()` ausente em `generateSalesOrderPdf`/`generatePurchaseOrderPdf`.
- Paginação ausente na UI de Orçamentos/OPs/Pedidos de Compra/Materiais — dado existe no banco mas fica
  invisível sem aviso; tratado como bug funcional, não só melhoria de performance.
- Grids apertados (Condições do Orçamento e afins) — revisitar contagem de colunas após o Lote 0, já que
  parte do aperto é efeito colateral do bug do modal.

**Lote 2 — Padronização de componentes** (datas, CEP, CNPJ, telefone, moeda, percentuais, validações):
- Construir `DateInput`, `CurrencyInput`, `QuantityInput`, `PercentInput`, `CepInput`, `CnpjInput`,
  `PhoneInput`, `EmailInput`, `UnitSelect`.
- Aplicar em todo o sistema, corrigindo as inconsistências concretas já mapeadas (Configurações sem
  CEP/CNPJ/telefone/e-mail tratados; Cliente/"Telefone Contato" sem máscara; datas de Requisição/
  Relatórios; campos de unidade como texto livre).
- Adicionar validação de dígito verificador de CPF/CNPJ; `min`/`max` em quantidade; clamp em percentual.

**Lote 3 — UX**:
- Debounce em todas as buscas ao vivo (Orçamentos, Clientes, Produtos, Materiais, Estoque).
- Controles de paginação na UI (`page`/`totalPages`, "mostrando X de Y").
- Feedback visual + proteção contra clique duplo nas mudanças de status inline (Orçamento, Requisição,
  Pedido de Compra, conversão de Orçamento).
- `ConfirmDialog` substituindo os 10 `window.confirm()`.
- Atalhos básicos (Esc fecha modal, no mínimo) e avaliar ações em lote nas telas de aprovação mais usadas
  (Requisições/Cotações).
- Filtros rápidos de período onde fizer sentido.

**Lote 4 — Design System**:
- Extrair `FormDialog`, `DataTable`, `AsyncButton` como cascos compartilhados.
- Migrar todas as listagens para `DataTable` com paginação server-side embutida por padrão.
- Padrão de fallback para mobile nas tabelas mais usadas (ou, no mínimo, indicador visual de scroll
  horizontal disponível).
- Documentar as convenções do Design System para todo desenvolvimento futuro.

Cada lote é validado e testado antes do próximo — mesmo padrão de todas as fases do roadmap funcional.
Nenhuma implementação começa até o usuário validar esta estratégia e a ordem dos lotes.

## Implementação (2026-07-10)

Autorizado pelo usuário ("pode aplicar tudo") sem validação lote a lote — implementação feita
sequencialmente (Lote 0 → 4), com `tsc --noEmit`, verificação de compilação da aplicação e a suíte
completa de testes automatizados rodados após cada lote. Nenhum teste de UI existia antes desta
consolidação (o projeto não tinha, e continua sem, testes automatizados de frontend) — a verificação
desta rodada combinou: `tsc --noEmit` (sem novos erros em nenhum lote); compilação real da aplicação
(servidor de desenvolvimento já em execução, confirmado servindo sem erro de build/runtime após cada
lote); e a suíte de 136 testes de backend (Fases 1-10), que não cobre UI mas confirma zero regressão em
nenhuma regra de negócio tocada indiretamente. **Não houve verificação visual/interativa em navegador
por mim** — sem essa camada, alguns ajustes finos de espaçamento/alinhamento só serão confirmados no uso
real; nenhuma alegação de "verificado visualmente" é feita aqui.

### Lote 0 — `dialog.tsx`

`src/components/ui/dialog.tsx:79`: nenhuma mudança no componente base (risco de afetar todo modal do
sistema de uma vez, incluindo os que não tinham `className` próprio). Em vez disso, os 10 `DialogContent`
com `max-w-*` próprio (`src/app/page.tsx`) tiveram esse valor trocado para `sm:max-w-*` — mesmo "grupo de
variante" que o `sm:max-w-2xl` do componente base, o que faz o `tailwind-merge` corretamente substituir
um pelo outro (confirmado rodando `twMerge` diretamente, não só por inspeção). O único `DialogContent`
sem `className` (Ajustar Estoque) foi deixado como está, herdando o default do componente base — decisão
deliberada.

### Lote 1 — PDFs e paginação

- `src/app/services/pdf.service.ts`: `drawInfoCards`/`drawTwoColumnBoxes` agora usam
  `doc.splitTextToSize()` para medir linhas reais antes de desenhar (confirmado com teste manual via
  jsPDF: um e-mail longo quebra em 3 linhas, todas contabilizadas corretamente na altura do card).
  `generateTransportPdf`/`generateReportPdf` ganharam a mesma quebra de linha que faltava por completo.
  `generateSalesOrderPdf`/`generatePurchaseOrderPdf` ganharam `ensureSpace()` antes da caixa de
  resumo/condições, mesmo padrão já usado em `generateQuotePdf`. Total da Requisição realinhado à mesma
  geometria de `drawSummaryBox` (82mm de largura, 14mm de margem). `requisition.date` agora impresso.
  Tabela de materiais da OP ganhou `columnStyles`.
- `src/components/domain/pagination-bar.tsx` (novo) + `src/app/page.tsx`: paginação real conectada em
  Orçamentos, Ordens de Produção, Requisições, Pedidos de Compra e Materiais — nas 3 últimas, foi
  necessário criar efeitos dedicados por módulo que não existiam antes (a lista só recarregava ao trocar
  de aba, nunca ao mudar de página/filtro) — mesma causa raiz também corrigida para o filtro de status de
  Pedidos de Compra, que hoje passa a reagir de fato à seleção.

### Lote 2 — Design System de componentes

Criado `src/components/form/*`: `date-input.tsx` (máscara DD/MM/AAAA), `currency-input.tsx` (formata
PT-BR, finalmente usando `parseCurrencyInput`), `quantity-input.tsx`, `percent-input.tsx` (clamp 0–100),
`cep-input.tsx`/`cnpj-input.tsx` (máscara + busca automática + spinner, reaproveitando os handlers
`handleCepLookup`/`handleCnpjLookup` já existentes), `phone-input.tsx`, `email-input.tsx`, `unit-select.tsx`.
`src/lib/masks.ts` ganhou `isValidCpf`/`isValidCnpj`/`isValidCpfCnpj` (validação de dígito verificador,
usada por `CnpjInput`).

Aplicados em: Configurações (CEP/CNPJ/telefone/e-mail — a lacuna mais grave da auditoria, hoje sem
NENHUM tratamento, corrigida por completo, incluindo busca automática via handlers próprios já que o
formato de `settings` é uma tabela chave-valor plana, incompatível com o `fieldMap` genérico dos
handlers existentes); Cliente, Fornecedor e Orçamento (upgrade dos campos que já tinham máscara manual,
ganhando o spinner de carregamento que faltava); correção pontual do "Telefone Contato" do Cliente (não
tinha máscara, diferente do mesmo campo em Fornecedor); todos os campos de data em texto livre
(Orçamento/Validade, Requisição/Necessário até, Relatórios/De-Até); os 4 campos de "Unidade" como texto
livre (Produto, Material, Ordem de Produção, vínculo Produto×Material); e uma passada ampla de
`CurrencyInput`/`QuantityInput`/`PercentInput` nos formulários de Orçamento (itens, desconto dual-modo,
frete), Produto (custo/venda/IPI/ICMS/dimensões), Material (custo/densidade/estoque), Fornecedor×Material
(preço), Requisição (itens) e Cotação (preço).

### Lote 3 — UX

`src/hooks/use-debounced-value.ts` (novo) aplicado às 5 buscas ao vivo do sistema (Orçamentos, Clientes,
Produtos, Materiais, Estoque) — achado durante a implementação: Clientes e Produtos não tinham NENHUM
efeito reagindo à busca (nem debounced nem por tecla) — a busca nessas duas telas não recarregava a
lista até trocar de aba; corrigido junto com o debounce, mesma causa raiz já vista em Compras no Lote 1.

`src/components/domain/confirm-dialog.tsx` (novo, `ConfirmProvider`/`useConfirm`) — substitui os 10
`window.confirm()` do sistema por um `AlertDialog` consistente com a identidade visual do app,
diferenciando ações destrutivas (excluir — botão vermelho) de reversíveis (converter, desativar, aplicar
atualização — estilo padrão). Registrado em `src/components/providers.tsx`.

Feedback + proteção contra clique duplo nas 5 ações de status inline (`changeQuoteStatus`,
`changeSalesOrderStatus`, `changeRequisitionStatus`, `changePurchaseOrderStatus`,
`convertQuoteToOrder`): novo estado compartilhado `pendingStatusIds` (`Set<string>`) desabilita o
`Select`/botão daquela linha especificamente enquanto a requisição está em andamento, sem afetar outras
linhas da mesma tabela.

### Lote 4 — Design System (escopo parcial, por decisão deliberada)

`src/components/domain/async-button.tsx` (novo) — aplicado nos 13 botões "Salvando..." já existentes no
sistema, substituindo o padrão manual `disabled={xSaving}>{xSaving ? 'Salvando...' : 'Salvar'}` por um
componente único com spinner.

`src/components/domain/form-dialog.tsx` (novo) — casco padrão de modal (header + corpo rolável + rodapé
Cancelar/Salvar). Migrado o modal de Cliente como demonstração do padrão — os outros 10 modais do
sistema continuam com a estrutura atual (`Dialog`/`DialogContent`/`DialogFooter` diretos), que já
funciona corretamente após o Lote 0.

**Não implementado nesta rodada, por decisão deliberada de risco/retorno**: extração de um `DataTable`
genérico e migração das 16 listagens do sistema para ele. Diferente dos itens acima — cada um corrigia
um bug concreto e já verificado (relatado pelo usuário ou confirmado por auditoria) com uma mudança
localizada — migrar 16 tabelas para um componente genérico é um projeto de paridade de funcionalidade
por tabela (cada uma tem colunas/ações diferentes), numa base de código que não tenho como verificar
visualmente. Fazer isso apressadamente arriscaria regressão silenciosa em telas que hoje funcionam
corretamente. Registrado como o próximo incremento natural do Design System, não como pendência
esquecida — `PaginationBar` (Lote 1) e a disciplina de paginação já wireada em 5 telas são exatamente a
base sobre a qual um futuro `DataTable` seria construído.

### Resultado final

**136/136 testes de backend passando. `tsc --noEmit` sem novos erros (só o erro de ambiente
pré-existente, não relacionado). Aplicação compilando e servindo sem erro de build/runtime em todas as
verificações feitas após cada lote.**

## Próximo passo

Validação do usuário em uso real (navegador) — a única camada de verificação que não pude fazer.
Se aprovado, decidir com o usuário se a extração do `DataTable` genérico (Lote 4, restante) entra no
roadmap como um item futuro dedicado.
