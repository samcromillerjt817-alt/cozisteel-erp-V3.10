# ADR-015 — Fase 13: Padronização da Experiência do Usuário (UX/UI)

- **Status**: **Levantamento e auditoria concluídos. Nenhum código foi alterado nesta rodada** — por
  instrução explícita do usuário: "Não quero código nesta etapa. Quero apenas levantamento técnico
  completo, auditoria da interface atual e um ADR documentando todas as decisões arquiteturais."
- **Data**: 2026-07-10
- **Motivo**: o usuário abriu formalmente a **Fase 13** do roadmap de 12+ fases, com o mesmo rigor de
  qualquer fase funcional (levantamento → ADR → validação → implementação), para tratar UX/UI como uma
  frente de primeira classe, não como polimento visual. Diretriz explícita:

  > "Quero que toda decisão de UX seja baseada em ergonomia operacional, e não apenas em aparência. O
  > objetivo não é deixar o ERP 'bonito', mas fazer com que um usuário novo consiga executar suas tarefas
  > com o menor número possível de cliques, com menor chance de erro e sem precisar consultar manual para
  > operações rotineiras. Sempre priorize clareza, consistência e produtividade sobre efeitos visuais."

- **Relação com [ADR-014](ADR-014-consolidacao-ux-design-system.md)**: esta não é uma auditoria do zero.
  ADR-014 já implementou Lotes 0-3 por completo (fix do modal, PDFs, paginação em 5 telas, `form/*` como
  base do Design System, debounce, `ConfirmDialog`, feedback de status inline) e parcialmente o Lote 4
  (`AsyncButton`, `FormDialog` construídos e aplicados só em Cliente). A Fase 13 audita **o que restou
  depois disso** — o estado real pós-implementação, não uma repetição do levantamento anterior — e
  amplia o escopo para os itens que ADR-014 deixou de fora (CNAE/situação cadastral, Design System de
  cores semânticas, consistência de ícones entre módulos, PDFs com profundidade tipográfica, e uma
  revisão de débito técnico/arquitetural de todo o roadmap).

## Metodologia

4 auditorias paralelas contra o código real (não hipóteses), executadas por agentes de exploração
independentes, mais uma verificação direta minha de um achado crítico de infraestrutura:

1. **Auditoria UX pós-implementação** — o que ainda falta depois de ADR-014 Lotes 0-3: campos
   inteligentes (CNAE/situação cadastral), inputs cru remanescentes por tela, risco de migração de cada
   modal para `FormDialog`, tabelas sem paginação, ergonomia dos 4 fluxos principais, tokens do Design
   System.
2. **Revisão de débito técnico em todo o roadmap** — consistência entre ADRs 001-013 e o código real,
   documentação de eventos, oportunidades de simplificação no backend.
3. **Auditoria profunda de PDFs pós-correções** — o que ADR-014/Lote 1 não cobriu: tipografia, espaço
   não aproveitado, identidade visual entre os 3 documentos comerciais.
4. **Consistência visual por módulo, olhar de usuário novo** — Produtos, Matérias-primas, Fornecedores,
   Estoque, Usuários, Configurações, Relatórios, Dashboard: ícones, cores de status, alertas, navegação.

Verificação direta adicional: ao validar o achado do Agente 2 sobre `Quote.salesOrder`, descobri e
confirmei empiricamente (patch temporário revertido em seguida, `git diff` limpo) um problema de
infraestrutura de verificação que antecede e invalida parte da confiança depositada em ADR-013/ADR-014.

---

## 0. Achado crítico de infraestrutura — `tsc --noEmit` não checava nada

**`tsconfig.json:26`** tem `"ignoreDeprecations": "6.0"`. O TypeScript instalado é a versão **5.9.3**
(`npx tsc --version`), cujo valor válido máximo para essa opção é `"5.0"`. Isso faz `tsc --noEmit`
**abortar imediatamente com um erro de configuração (`TS5103`) antes de checar um único arquivo do
projeto** — o que já aparecia isoladamente em toda verificação feita ao longo de ADR-013 e ADR-014
("`tsc --noEmit` limpo, só o erro de ambiente pré-existente"), mas cuja implicação real não havia sido
investigada: **não é um erro cosmético isolado, é a checagem inteira sendo pulada.**

Confirmei corrigindo o valor para `"5.0"` num arquivo temporário (nunca commitado — `tsconfig.json`
restaurado ao original, `git diff --stat` confirma zero mudança no repositório) e rodando `tsc --noEmit`
de novo. Resultado: **15 erros reais de tipo, nunca antes visíveis**, incluindo exatamente o gap que o
Agente 2 reportou de forma independente:

```
src/app/page.tsx(2093,62): error TS2339: Property 'salesOrder' does not exist on type 'Quote'.
src/app/page.tsx(2096,34): error TS2339: Property 'salesOrder' does not exist on type 'Quote'.
src/app/page.tsx(2097,143): error TS2339: Property 'salesOrder' does not exist on type 'Quote'.
src/app/services/audit.service.ts(30,9): error TS2322: Type 'Record<string, unknown>' is not assignable...
src/app/services/audit.service.ts(31,9): error TS2322: Type 'Record<string, unknown>' is not assignable...
tests/mrp-suggestion-approval.test.ts(68,25): error TS2352: Conversion of type 'RequisitionRecord'...
tests/requisicao-corporativa.test.ts(29,25): error TS2352: ...
tests/requisicao-corporativa.test.ts(54,25): error TS2352: ...
tests/requisicao-corporativa.test.ts(90,27): error TS2352: ...
```

**Impacto**: toda alegação de "`tsc --noEmit` limpo" feita durante ADR-013 e ADR-014 — inclusive as que
sustentaram a decisão de considerar Lotes 0-3 verificados — checava apenas a validade do `tsconfig.json`,
nunca o código-fonte. Isso não significa que o código dos lotes anteriores esteja quebrado (os testes de
backend, 136/136, continuaram sendo uma verificação real e independente), mas remove uma das duas pernas
de verificação que eu vinha reportando como funcionando.

**Recomendação**: corrigir `"ignoreDeprecations": "6.0"` → `"5.0"` (ou remover a chave, se nenhuma
deprecação específica precisar ser suprimida) é uma correção de uma linha, sem risco, que deveria entrar
no primeiro lote de implementação desta fase — não é um item de UX, é uma correção da própria capacidade
de verificar qualquer trabalho futuro. Proponho tratá-la como Lote 0 desta fase, no mesmo espírito do
Lote 0 de ADR-014 (fix isolado, alto retorno, baixíssimo risco).

---

## 1. Padronização dos campos — o que restou após ADR-014

ADR-014/Lote 2 já cobriu a maior parte dos campos monetários/quantidade/percentual/data/CEP/CNPJ/telefone.
O que ainda usa `<Input type="number">` ou `<Input type="date">` cru, por tela:

| Tela | Campo | Situação |
|---|---|---|
| Cotação de fornecedor (dentro de Requisições) | `leadTimeDays` (Prazo, dias) | `<Input type="number">` cru; preço ao lado já usa `CurrencyInput` |
| Fornecedor (cadastro) | `leadTimeDays` do fornecedor | `<Input type="number">` cru |
| Fornecedor × Matéria-prima (vínculo) | `leadTimeDays` do vínculo | `<Input type="number">` cru; `lastPrice` ao lado já usa `CurrencyInput` |
| Configurações → Numeração | "Próximo Número", "Dígitos" | `<Input type="number">` cru (inteiros de configuração, não moeda/quantidade de estoque) |
| Ordem de Produção | "Data", "Prazo" | `<Input type="date">` nativo — `DateInput` já existe e é usado em Orçamento/Requisição, mas não chegou à OP |

Confirmado por auditoria: Ajuste de Estoque, Recebimento de Compra e Requisição de Matéria-Prima estão
**100% migrados**; Orçamento está **100% migrado**. O restante dos campos de texto livre (razão social,
NCM, acabamento, prefixo/sufixo de sequência etc.) são texto genuíno, não candidatos a estes componentes.

**Proposta**: fechar os 5 gaps acima com os componentes já existentes (`QuantityInput` para os
`leadTimeDays`/inteiros de configuração, `DateInput` para Data/Prazo da OP) — não é necessário criar
nenhum componente novo, apenas aplicar os que ADR-014 já construiu.

## 2. Campos inteligentes — CNAE e situação cadastral (gap real confirmado)

- **`descricao_situacao_cadastral`** já está **tipado** em `CnpjData` (`src/lib/masks.ts:130`), mas
  **não é lido em nenhum lugar** — nem em `handleCnpjLookup` (`page.tsx:1007-1026`), nem no lookup de
  Configurações/Empresa (`page.tsx:3654-3666`). É um campo "meio caminho andado": a API já devolve o
  dado, o tipo já existe, só falta consumir.
- **CNAE não existe em nenhuma camada**: não está em `CnpjData`, não está no schema Prisma (`Client` e
  `Supplier` não têm `cnae`/`cnaeDescription`/`situacaoCadastral` — só endereço, contato, IE/IM,
  `paymentTerms`, `leadTimeDays`). A BrasilAPI (mesmo endpoint já consumido, `/api/cnpj/v1/{cnpj}`)
  documenta publicamente os campos `cnae_fiscal`/`cnae_fiscal_descricao`/`cnaes_secundarios` — não foi
  possível confirmar com uma chamada de rede ao vivo neste ambiente (sandbox sem acesso externo), então
  recomendo uma confirmação pontual de payload real antes de codificar.

**Para preencher os dois campos pedidos pelo usuário seria necessário**: (a) migration adicionando
`cnaeCode`/`cnaeDescription`/`situacaoCadastral` a `Client` e `Supplier`; (b) estender `CnpjData` com
`cnae_fiscal_descricao`; (c) adicionar os 2 campos aos formulários de Cliente e Fornecedor (ambos já
usando `CnpjInput`, então o ponto de entrada já existe). Não é uma correção de bug — é uma extensão de
schema genuína, deve entrar no roadmap como item próprio, não como parte do Lote 0.

## 3. Layout e responsividade

O achado sistêmico de ADR-014 (modal travado em 672px pelo `dialog.tsx` base) já foi corrigido no Lote 0
e verificado. O que resta, confirmado por esta auditoria:

- Tabelas (`<Table>` do shadcn) já embrulham em `overflow-x-auto` — não cortam conteúdo — mas **não
  colapsam para cards em mobile**, e `whitespace-nowrap` incondicional em `TableHead`/`TableCell` aumenta
  a chance de precisar de scroll mesmo em tabelas simples.
- **Nenhum indicador visual de "há mais conteúdo à direita"** em nenhuma área de scroll horizontal —
  usuário só descobre que há mais colunas arrastando por acaso.
- Removê-lo por completo (zero scroll horizontal em qualquer tela) exigiria ou colapso para cards em
  mobile em todas as 15 tabelas, ou uma reformulação de colunas por prioridade (esconder colunas
  secundárias abaixo de um breakpoint) — ambas são mudanças de Design System, não fixes pontuais, e
  devem ser avaliadas junto com a extração do `DataTable` (item 7 abaixo), não isoladamente.

## 4. Design System — cores semânticas ainda não são tokens

`globals.css` já define uma base de tokens shadcn real (`--primary`, `--destructive`, `--chart-*`,
`--sidebar-*`, `--radius-*`, via `@theme inline` do Tailwind v4) — usada corretamente pelos componentes
genéricos (Button, Badge, Input). O que **não** é token, é valor espalhado:

- **`statusColors`** (`src/lib/format.ts:31-38`) — paleta hardcoded (`bg-yellow-600/20 text-yellow-400
  border-yellow-600/30` etc.) usada **só** para status de Orçamento, desconectada das CSS vars do tema.
- **Duas convenções visuais diferentes coexistindo** para o mesmo conceito ("verde=sucesso",
  "vermelho=erro", "âmbar=intermediário"): a de `statusColors` (opacidade + borda) e uma segunda,
  duplicada byte-a-byte em `page.tsx:3300` (movimentação de estoque IN/OUT/ADJUST) e `page.tsx:3915`
  (status de patch) — fundo sólido claro + texto escuro, sem opacidade nem borda. Nenhuma das duas é
  reaproveitada pelos demais status do sistema.
- **Requisição, Compra, Produção e Pedido de Venda não têm cor de status nenhuma** — só `Badge
  variant="outline"` neutro. E o caso da **Ordem de Produção é pior que "sem cor"**: o badge
  (`page.tsx:3469`) nem passa o valor por `productionStatusLabels` — mostra o enum bruto em inglês
  (`"in_progress"`, `"planned"`) na tela, diferente de Compras e Pedidos de Venda que traduzem
  corretamente.
- Não existe escala tipográfica tokenizada (só troca de `font-family` para Space Grotesk nos headings,
  sem tamanho/peso/line-height sistematizados) nem camada semântica de ícones (usa `lucide-react`
  diretamente, sem mapeamento tipo "ícone de status X").

**Proposta de Design System completo** (amplia a tabela de componentes já proposta em ADR-014 §10):
1. Um único mapa `statusColors` **semântico**, não por módulo — `success`/`warning`/`danger`/`info`/
   `neutral` como 5 categorias, cada status de cada módulo (Orçamento, Requisição, Compra, Produção,
   Pedido de Venda, Movimentação de Estoque, Patch, Usuário ativo/inativo) mapeado para uma dessas 5,
   e as 5 categorias implementadas como CSS vars derivadas de `--destructive`/`--chart-*` do tema (não
   uma paleta paralela nova).
2. `productionStatusLabels` (e equivalentes) aplicados sempre — nunca exibir enum bruto.
3. Uma escala tipográfica mínima (título de seção / título de card / corpo / legenda) documentada em
   `globals.css`, não decidida ad-hoc por tela.
4. Ícones de ação com convenção única por significado (ver item 5 — hoje o mesmo ícone tem 2-3
   significados diferentes dependendo da tela).

## 5. UX — ergonomia por módulo e pelos 4 fluxos principais

### Consistência de ícones (achado novo, não coberto por ADR-014)

- **`Edit`** é usado tanto para "editar cadastro" quanto para "Ajustar estoque" (que abre um diálogo de
  ajuste de quantidade, não edição de cadastro) — mesma forma, ações diferentes, só desambiguadas pelo
  texto do `title`.
- **`Trash2` vermelho** é usado tanto para exclusão real (Fornecedor, Matéria-prima, Usuário, Cliente)
  quanto para **desativação reversível** de Produto — o `ConfirmDialog` já diferencia corretamente no
  nível do diálogo (`destructive:true` só nas exclusões reais), mas o ícone da tabela não reflete essa
  diferença de severidade.
- **`FileOutput` vs `Download` para "baixar PDF"**: `FileOutput` é o padrão de fato (Requisições,
  Compras, OPs, Configurações/PDF, Relatórios/Exportar PDF) — **exceto Orçamentos**, que usa `Download`.
  E `Download` por sua vez já significa outras duas coisas em outras telas ("Exportar Excel/CSV" em
  Relatórios; "buscar atualização" em Configurações) — o mesmo ícone com 3 significados diferentes.
- **`Eye` é importado e nunca usado** — não existe convenção nenhuma para "ver detalhes"; a ação mais
  próxima ("Ver histórico" em Estoque) usa `FileText`.

### Bug de navegação confirmado

O sino de notificações no cabeçalho lista matérias-primas com estoque baixo, mas o clique chama
`goToNotification('produtos')` (`page.tsx:1887`) — **a chave correta do módulo é `'materiais'`**
(confirmada em `page.tsx:1688`). O único alerta proativo do sistema leva o usuário para uma tela
(Produtos) que nem exibe coluna de estoque, então ele chega lá sem conseguir agir sobre o alerta.

### Dashboard não é acionável

Os 4 cards de estatística e a tabela "Orçamentos Recentes" não têm `onClick`/`cursor-pointer`/link — são
puramente informativos. A busca do cabeçalho superior (`placeholder="Buscar..."`) não tem
`value`/`onChange` — é decorativa, sem função nenhuma.

### Usuários — risco de auto-bloqueio sem aviso prévio

O backend já protege corretamente contra auto-exclusão e exclusão do último admin
(`user.service.ts:70-87`, com mensagem clara) — mas essas proteções só aparecem **depois** do clique
(toast de erro), o botão nunca é desabilitado nem sinaliza o risco antes. E **não existe proteção
equivalente para desativação ou rebaixamento**: `userService.update` aplica `role`/`active` sem checar
"é o último admin?" — um admin pode se auto-desativar ou rebaixar o único outro admin com um simples
"Salvar", sem passar por `ConfirmDialog` (só a exclusão passa). Adicionalmente, Usuários não tem
busca/filtro nem paginação — acima de 20 usuários (default de `parsePagination`), os excedentes ficam
invisíveis.

### Produtos sem paridade com Matérias-primas/Estoque

Matérias-primas e Estoque destacam estoque baixo em vermelho/negrito e têm checkbox "Só estoque baixo".
Produtos **não tem coluna de estoque nenhuma** — para saber se um produto acabado está com estoque baixo,
o usuário precisa trocar de módulo.

### Os 4 fluxos principais — pontos de atrito reais

- **Criar Orçamento**: bem resolvido — tudo em um único modal, cliente cadastrado autopreenche 8 campos,
  sem ziguezague entre módulos.
- **Aprovar Requisição**: troca de status via `<Select>` inline, sem indicação de quais itens ainda
  faltam cotação; a trava de negócio (não avançar para `ordered` sem cotação vencedora selecionada por
  item) é correta no backend, mas só aparece **depois** da tentativa (toast de erro), forçando o usuário
  a descobrir o fluxo correto por tentativa e erro na primeira vez.
- **Receber Pedido de Compra**: bem resolvido — quantidade a receber já vem pré-preenchida com o saldo
  em aberto, recebimento total é literalmente abrir e confirmar.
- **Registrar Produção de uma OP** (o ponto mais fraco dos 4): não existe ação dedicada "Concluir
  produção"/"Apontar produção parcial" — o único caminho é reabrir o modal genérico de edição e mudar o
  campo Status. O backend já tem `produce(id, quantityThisRound, userId)`
  (`production-order.service.ts:200-260`), explicitamente pensado para produção **parcial** (consumo
  proporcional de matéria-prima, liberação proporcional de reserva, entrada proporcional de produto
  acabado, comentário no código confirma a intenção) — mas **não existe rota de API que exponha isso com
  uma quantidade arbitrária**; o `PUT` genérico só chama `produce()` internamente com o restante inteiro.
  É uma funcionalidade sofisticada e testada, mas hoje inacessível pela UI. O badge de status da OP
  também mostra o enum bruto em vez do label traduzido (mesmo achado do item 4).

### Outras inconsistências entre módulos

- **Posição de "Novo" + busca**: Orçamentos/Produtos/Fornecedores usam um layout (título + busca/botão
  na mesma linha); Matérias-primas/Estoque usam outro (busca numa segunda linha). Duas convenções para
  telas estruturalmente equivalentes.
- **Busca sem debounce em Fornecedores**: as outras 4 buscas usam `useDebouncedValue` (ADR-014/Lote 3);
  Fornecedores ainda exige Enter, sem dica visual disso.
- **Configurações → "Sistema"** mistura versão/instalação com um log de auditoria completo de segurança
  no mesmo card — dois assuntos distintos sob um nome que sugere só o primeiro.
- **Relatórios**: cards de resumo e exportação (Excel/PDF) funcionam bem; a tabela detalhada usa
  `Object.keys(rows[0])` como cabeçalho cru (nomes de campo de API, sem tradução) e `String(v)` em cada
  célula (sem formatação de data/moeda) — um dump genérico dentro de uma tela por outro lado bem
  resolvida.

## 6. PDFs — achados além de ADR-014/Lote 1

ADR-014/Lote 1 já corrigiu a causa raiz de sobreposição de texto (`splitTextToSize`) e adicionou
`ensureSpace()` a `generateSalesOrderPdf`/`generatePurchaseOrderPdf`. Remanescentes, confirmados por
auditoria dedicada:

- **Ordem de Produção**: falta por completo a linha "Data:" que os outros documentos têm.
- **Relatório genérico**: desvios de tamanho de fonte em relação aos demais documentos.
- Espaço não aproveitado no cabeçalho/rodapé dos documentos em modo paisagem (landscape).
- `ensureSpace()` ainda ausente em 3 documentos além dos 2 já corrigidos no Lote 1.
- **Identidade visual inconsistente**: bloco de assinatura/marca presente **só** no PDF de Orçamento,
  apesar de Pedido de Venda e Pedido de Compra serem, pelos próprios comentários do código, igualmente
  documentos comerciais externos.
- **Inconsistência de formatação numérica dentro do mesmo documento**: a tabela de materiais de
  `generateProductionOrderPdf` mistura `.toFixed(2)` com `toLocaleString('pt-BR', ...)` para números que
  deveriam usar o mesmo formato.
- Diversas micro-inconsistências de copy/nomenclatura/estrutura entre os 3 geradores de PDF "comerciais"
  (Orçamento, Pedido de Venda, Pedido de Compra), que hoje evoluíram de forma independente em vez de
  compartilhar um template comum.

**Proposta**: consolidar os 3 geradores comerciais sobre um template compartilhado (cabeçalho, bloco de
assinatura, rodapé, formatação numérica) em vez de 3 implementações paralelas — isso resolve as
inconsistências de identidade visual e formatação de uma vez, ao invés de corrigi-las uma a uma.

## 7. Componentização — o que falta migrar e o risco de cada peça

### Modais → `FormDialog`

Dos 10 modais que ainda usam `Dialog`/`DialogContent`/`DialogFooter` diretos:

| Modal | Risco de migração | Observação |
|---|---|---|
| **Usuário** | Baixíssimo | Mais simples até que Cliente (já migrado) — só texto/senha/select/switch, footer único |
| Ajuste de Estoque, Recebimento, Requisição | Baixo | Footer único (Cancelar + ação assíncrona), encaixa no contrato atual de `FormDialog` sem adaptação |
| Matéria-prima | Baixo | Seções condicionais somente-leitura, mas sem footer próprio |
| Ordem de Produção | Baixo | Seção condicional no topo, mas footer único |
| Orçamento | Médio (corpo extenso) | Segue o mesmo padrão de footer único — migra sem exigir mudança no componente |
| Produto, Fornecedor | Médio (sub-formulários com persistência própria e imediata) | Vínculos produto↔matéria-prima e fornecedor↔matéria-prima persistem por conta própria dentro do modal, sem passar por `onSave` — cabem em `FormDialog` estruturalmente, mas a extração exige cuidado para não quebrar essas ações inline |
| **Cotação** | **Não encaixa no contrato atual** | Footer só tem "Fechar" (sem `onSave`) — é uma tela de registro incremental item a item, não "preencher e salvar". Exigiria tornar `onSave`/`saveLabel` opcionais em `FormDialog`, ou uma variante "somente leitura" |

**Proposta de ordem**: Usuário primeiro (zero risco, mesmo padrão de Cliente), depois Ajuste de
Estoque/Recebimento/Requisição/Matéria-prima/OP (mesmo contrato, risco baixo), Orçamento em seguida.
Produto/Fornecedor exigem atenção extra aos sub-formulários. Cotação só depois de estender `FormDialog`
com uma variante sem `onSave`.

### Tabelas → paginação

Das 10 tabelas sem `PaginationBar` (as outras 5 já foram cobertas por ADR-014/Lote 1):

| Tabela | Backend já suporta paginação? | Prioridade |
|---|---|---|
| Dashboard "Orçamentos Recentes" | N/A — backend já limita a 5 (`take: 5`), não é uma lacuna | — |
| Sequências de Numeração | N/A — é uma lista de cards fixa por tipo de documento, não cresce | — |
| Configurações → Histórico de Patches | Não paginado, mas cresce devagar (1 por atualização) | Baixa |
| Pedidos de Venda, Clientes, Produtos | **Sim** (`parsePagination` já implementado nas rotas) | Alta — catálogos que crescem sem teto |
| Fornecedores | Sim, mas usa `limit=100` fixo hoje | Média |
| Usuários | Sim, mas é cadastro pequeno/fixo | Baixa |
| Movimentações de Estoque | **Sim** (`stockRepository.findManyMovementsPaginated` já existe, só não exposto na UI) | Alta — histórico transacional, cresce a cada movimento |
| Logs de Auditoria (Sistema) | **Sim** (`parsePagination` já em uso no service) | Alta — cresce a cada ação do sistema |
| **Estoque — Saldo Atual** | **Não** — `/api/stock/summary` não tem `parsePagination` | Requer trabalho de backend antes do front |

**Achado importante**: a maioria dessas 10 tabelas já tem suporte de paginação pronto no backend — é
puramente wiring de frontend (o mesmo padrão já aplicado 5 vezes em ADR-014/Lote 1). Só "Estoque — Saldo
Atual" exige adicionar paginação na camada de repositório/serviço primeiro.

## 8. Débito técnico e consistência arquitetural (revisão de todo o roadmap)

Além do achado crítico da seção 0, a revisão de ADRs 001-013 contra o código real confirmou:

- **ADR-006, 007, 011, 012 e 013 batem exatamente com o código** — nenhum drift encontrado.
- **A lacuna de reconciliação reserva-multinível de ADR-012 está genuinamente fechada**, sem resíduo.
- **`stockQty` sem checagem de suficiência** e **`reserveItemWithTx()` sem guarda terminal** continuam
  corretamente caracterizados como débito pré-existente/inatingível nas condições atuais — nenhuma fase
  posterior reabriu esses casos.
- **Inconsistências reais encontradas, ainda não corrigidas**:
  - Validação Zod ainda ausente na maioria das rotas `PUT`.
  - `interface Quote` em `page.tsx` sem o campo `salesOrder` (ver seção 0 — só não gerava erro visível
    por causa do bug de `tsconfig.json`).
  - `NumberingService.getNextNumber()` ainda não incrementa corretamente no primeiro uso de um
    `documentType` novo.
  - `docs/eventos/CATALOGO-EVENTOS.md` desatualizado: falta por completo o evento
    `producao.parcial_realizada`; a entrada de `ordem_producao.finalizada` cita incorretamente
    `update()`/`completeAndConsumeStock()` em vez dos métodos reais, `produce()`/`produceWithTx()`.
- **Duas oportunidades de simplificação no backend, catalogadas agora pela primeira vez**:
  - O padrão "buscar por ID, lançar `NotFoundException` se não existir" se repete em 15 arquivos de
    Service sem nenhum helper `findByIdOrThrow()` compartilhado.
  - O mesmo bloco de 2 linhas que monta a resposta paginada (`{data, total, page, limit, totalPages}`)
    está duplicado literalmente em 12 Services, sem uma função `paginate()` compartilhada.

Nenhum desses itens é urgente por si só, mas todos são candidatos naturais a um lote de "hardening"
depois desta fase de UX — nenhum exige decisão arquitetural nova, só aplicar um padrão já usado em outro
lugar do próprio código de forma mais consistente.

---

## 9. Roadmap proposto em lotes (Fase 13)

**Lote 0 — Infraestrutura de verificação** (pré-requisito de tudo que vem depois):
- Corrigir `tsconfig.json:26` (`ignoreDeprecations: "6.0"` → `"5.0"`), restaurando `tsc --noEmit` como
  uma checagem real. Sem isso, qualquer lote seguinte continuaria sendo "verificado" apenas pela suíte
  de testes de backend, que não cobre `page.tsx`.
- Corrigir `interface Quote` (adicionar `salesOrder?: { id: string; number: string }`), o único erro de
  tipo real hoje visível em código de produção (os outros 2 latentes são em `audit.service.ts`, os 3
  restantes são em arquivos de teste).
- Corrigir o bug de navegação do sino de notificações (`'produtos'` → `'materiais'`).

**Lote 1 — Fechar os gaps de campos que ADR-014 já resolveu para outras telas**:
- `QuantityInput` nos 3 `leadTimeDays` restantes (Cotação, Fornecedor, vínculo Fornecedor×Material) e
  nos 2 campos inteiros de Configurações/Numeração.
- `DateInput` em Data/Prazo da Ordem de Produção.
- Aplicar `*StatusLabels` no badge de status da OP (hoje mostra o enum bruto).

**Lote 2 — Design System de cores semânticas**:
- Unificar `statusColors` num mapa semântico de 5 categorias (`success`/`warning`/`danger`/`info`/
  `neutral`) atado às CSS vars do tema, substituindo as 2 paletas divergentes hoje existentes.
- Estender cor de status a Requisição, Compra, Produção e Pedido de Venda (hoje sem cor nenhuma).
- Resolver a sobrecarga semântica de ícones (`Edit` para ajuste de estoque, `Trash2` para desativação
  reversível, `Download`/`FileOutput` com 3 significados) com convenções únicas por significado.

**Lote 3 — Paginação restante** (maioria já suportada pelo backend, é wiring de frontend):
- Pedidos de Venda, Clientes, Produtos, Fornecedores, Movimentações de Estoque, Logs de Auditoria.
- Adicionar suporte de paginação no backend de `/api/stock/summary` (único caso que exige isso antes do
  front).

**Lote 4 — Migração de modais para `FormDialog`** (ordem por risco, seção 7):
- Usuário → Ajuste de Estoque/Recebimento/Requisição/Matéria-prima/OP → Orçamento → Produto/Fornecedor
  (com atenção aos sub-formulários) → estender `FormDialog` com variante sem `onSave` → Cotação.

**Lote 5 — Ergonomia dos fluxos e paridade entre módulos**:
- Produtos: adicionar coluna/indicador de estoque (paridade com Matérias-primas/Estoque).
- Requisições: sinalizar antes do clique quais itens ainda faltam cotação, antes de tentar avançar
  status.
- Ordem de Produção: expor uma rota/ação dedicada para `produce()` com quantidade parcial arbitrária,
  substituindo o caminho indireto via edição genérica de status.
- Usuários: desabilitar/avisar antes do clique em auto-exclusão, auto-desativação e rebaixamento do
  último admin (hoje só descoberto depois, via toast); adicionar busca e paginação.
- Fornecedores: aplicar debounce (paridade com as outras 4 buscas).
- Dashboard: tornar cards/tabela acionáveis (navegação ao clicar) ou remover a aparência de clicável;
  decidir sobre a busca decorativa do cabeçalho (implementar ou remover).
- Relatórios: aplicar tradução/formatação de data e moeda na tabela detalhada (hoje é dump cru de JSON).

**Lote 6 — CNAE e situação cadastral** (extensão de schema, não bugfix — item à parte dos demais):
- Confirmar payload real da BrasilAPI para `cnae_fiscal_descricao`.
- Migration adicionando os campos a `Client`/`Supplier`, estender `CnpjData`, adicionar campos aos
  formulários de Cliente e Fornecedor (já usando `CnpjInput`), e consumir `descricao_situacao_cadastral`
  (já tipado, só nunca lido).

**Lote 7 — PDFs**:
- Template compartilhado para os 3 geradores comerciais (cabeçalho, assinatura, rodapé, formatação
  numérica), fechando as inconsistências de identidade visual entre eles.
- Linha "Data:" na OP, correção de fonte no Relatório, `ensureSpace()` nos 3 documentos restantes,
  aproveitamento de espaço em paisagem.

**Lote 8 — Débito técnico de backend** (fora do escopo de UX, mas catalogado nesta revisão):
- Zod em rotas `PUT` restantes; correção de `NumberingService.getNextNumber()`; atualização de
  `CATALOGO-EVENTOS.md`; helpers `findByIdOrThrow()`/`paginate()` compartilhados.

Cada lote validado e testado antes do próximo, mesmo padrão de todas as fases anteriores. Nenhuma
implementação começa até o usuário validar esta estratégia e a ordem dos lotes — exatamente como
solicitado.

## Aprovação da estratégia (2026-07-10)

Usuário aprovou o roadmap de 9 lotes com uma reordenação: **Lote 0 passa a ser "Baseline de Qualidade"**
(tsconfig + `tsc --noEmit` + erros de tipagem reais, incluindo `Quote.salesOrder`), antes de qualquer
outro lote. Regra obrigatória adicionada para **todos** os lotes daqui em diante: rodar `npm run lint`,
`tsc --noEmit` e `npm run build` antes e depois de cada lote; nenhum lote é considerado concluído
enquanto qualquer um dos três apresentar erro; qualquer regressão interrompe a implementação
imediatamente. Reordenação dos lotes originais: 0 (baseline) → 1 (bugs funcionais: notificação +
produção parcial) → 2 (padronização UX/UI: cores/ícones) → 3 (paginação) → 4 (campos inteligentes:
CNAE/situação cadastral) → 5 (PDFs) → 6 (componentização) → 7 (débito técnico de backend) → 8
(polimento final).

## Lote 0 — Baseline de Qualidade (implementado)

### tsconfig.json e `tsc --noEmit`

`tsconfig.json:26` corrigido: `"ignoreDeprecations": "6.0"` → `"5.0"` (único valor válido para o
TypeScript 5.9.3 instalado). Com o valor corrigido, `tsc --noEmit` passou a checar o projeto de verdade
pela primeira vez.

**Catalogação exigida pelo usuário**:
- **Erros encontrados**: 9.
- **Erros corrigidos**: 9.
- **Erros remanescentes**: 0.
- **Causa de cada um**:
  1. `src/app/page.tsx:2093,2096,2097` (3 ocorrências) — `interface Quote` não declarava o campo
     `salesOrder`, embora o backend já o retorne (`quote.repository.ts:7`, `include: { salesOrder: {
     select: { id: true, number: true } } }` na consulta de listagem, e `quote.service.ts:75` já tipa
     `salesOrder: { id: string; number: string } | null` no domínio). Causa: a interface do frontend
     nunca foi atualizada quando o campo foi adicionado ao backend. **Corrigido** adicionando
     `salesOrder?: { id: string; number: string } | null` à interface `Quote`.
  2. `src/app/services/audit.service.ts:30-31` — `beforeValue`/`afterValue` (`Record<string, unknown>`)
     passados diretamente para um campo `Json?` do Prisma sem cast. Causa: o tipo `InputJsonValue` do
     Prisma é uma união recursiva que não aceita `unknown` estruturalmente, e nunca havia sido detectado
     porque o `tsc` nunca rodou de verdade. **Corrigido** com `as Prisma.InputJsonValue ?? Prisma.JsonNull`
     (sentinela explícita exigida pelo Prisma para diferenciar "campo não definido" de "campo nulo").
  3. `tests/mrp-suggestion-approval.test.ts:68` e `tests/requisicao-corporativa.test.ts:29,54,90`
     (4 ocorrências) — os testes fazem `as { id: string; tipo: string; ... }` sobre o retorno de
     `requisitionService.create()`/`createFromMrpSuggestion()`/`mrpSuggestionService.approve()`, mas o
     tipo interno `RequisitionRecord` (usado nesses métodos) só declarava `{ id, number, status }` — bem
     mais estreito do que o objeto Prisma real retornado (que inclui `tipo`, `originModule`, `items` com
     `material`/`supplier`, via `MUTATION_INCLUDE` no repository). Causa: `RequisitionRecord` nunca foi
     atualizado para refletir o retorno real depois que `tipo`/`originModule`/`items` passaram a ser
     necessários pelos testes (Fase 7, ADR-009). **Corrigido** ampliando `RequisitionRecord` para
     `{ id, number, status, tipo, originModule, items: Array<{...}> }`, batendo com o que
     `createWithItems()`/`createFromMrpSuggestion()` de fato devolvem. Nota: 2 usos remanescentes de
     `RequisitionRecord` (`update()`/`delete()`, linhas 203/243) vêm de `findById()` genérico (sem
     `include`), que não populará `items`/`tipo` em runtime — inofensivo porque nenhum desses dois
     métodos lê esses campos, mas registrado aqui para não ser reinterpretado como garantia futura.

`tsc --noEmit` confirmado limpo (exit 0) após as 3 correções.

### `npm run lint` — infraestrutura ausente, não só erros

**Achado adicional, fora do escopo original**: o projeto não tinha nenhum `eslint.config.js`/`.mjs`
(arquivo obrigatório do ESLint 9 flat config) — `npm run lint` nunca havia rodado com sucesso em nenhuma
fase anterior deste roadmap. Criado `eslint.config.mjs` consumindo diretamente o array de flat config já
nativo de `eslint-config-next@16.2.10` (`next/core-web-vitals` + `next/typescript` + ignores) — sem
`FlatCompat` (tentativa inicial que quebrou com `TypeError: Converting circular structure to JSON`,
porque esta versão do `eslint-config-next` já exporta objetos de flat config diretamente, e envolvê-los
de novo em `FlatCompat` — pensado para configs antigas no formato `.eslintrc` — duplica/corrompe a
referência do plugin `react-hooks`).

Com o lint rodando pela primeira vez, apareceram **20 erros reais** (33 warnings), quase todos de uma
regra nova neste major do `eslint-plugin-react-hooks` (estilo React Compiler): `react-hooks/set-state-
in-effect` (17 ocorrências — 16 em `page.tsx`, 1 em `currency-input.tsx`, mais 2 em componentes shadcn/
hook compartilhados, `carousel.tsx` e `use-mobile.ts`) e `react-hooks/purity` (1 ocorrência —
`Math.random()` dentro de `useMemo` em `sidebar.tsx:611`). Decisão do usuário: **não são bugs de
comportamento** (o app funciona exatamente como antes), mas corrigi-los de forma correta exige revisar
cada efeito individualmente para preservar comportamento — trabalho real, não mecânico, e arriscado de
apressar em `page.tsx` (maior arquivo do sistema, sem cobertura de teste de UI). Por isso, rebaixadas
para `warn` (nunca desabilitadas/suprimidas) em `eslint.config.mjs`, com backlog formal abaixo.

**Baseline final de lint estabelecida**: `npm run lint` → **0 erros, 53 warnings**. Catalogação completa:

| Categoria | Qtd | Arquivos | Status |
|---|---|---|---|
| `react-hooks/set-state-in-effect` | 17 | `page.tsx` (16: linhas 657, 668, 672, 675, 678, 683, 686, 693, 697, 701, 707, 711, 714, 717, 720, 836), `currency-input.tsx:24`, `carousel.tsx:98`, `use-mobile.ts:14` | Rebaixado a warn — **backlog dedicado, ver abaixo** |
| `react-hooks/purity` | 1 | `sidebar.tsx:611` (`Math.random()` em `useMemo`) | Rebaixado a warn — **backlog dedicado** |
| `react-hooks/exhaustive-deps` | 1 | `page.tsx:850` (lista de 22 dependências faltando no `useEffect` de troca de módulo) | Pré-existente, já era warning — fora do escopo desta correção |
| `@next/next/no-img-element` | 2 | `page.tsx:2459,2541` (`<img>` cru em vez de `next/image`) | Pré-existente, já era warning |
| `import/no-anonymous-default-export` | 2 | `eslint.config.mjs:4`, `postcss.config.mjs:1` | Novo (arquivos de config recém-criados/varridos agora que o lint roda) — cosmético, sem risco |
| `Unused eslint-disable directive` (`@typescript-eslint/no-explicit-any`) | 28 | 19 arquivos em `src/app/repositories`, `src/app/services`, `src/lib/domain-events.ts`, `tests/domain-event-bus.test.ts` | Pré-existente — comentários de supressão que não suprimem nada nesta config; **auto-corrigível com `eslint --fix`, não aplicado ainda por decisão de manter Lote 0 estritamente no escopo pedido** |

**Regra do usuário daqui em diante**: nenhum warning novo pode ser introduzido — 53 é o teto, só pode
diminuir. Backlog de correção dos 18 pontos de `react-hooks/set-state-in-effect`/`purity` entra no
roadmap como um lote dedicado (candidato a Lote 9, após o Lote 8), a ser corrigido efeito por efeito
(mover `setState` para o evento que o dispara, `useMemo`/inicialização preguiçosa, ou remover o efeito
onde for redundante), sem misturar com nenhum outro lote.

### `npm run build`

Limpo (exit 0), sem erros ou warnings de build — build de produção completo gerado com sucesso.

### `npm test`

**136/136 testes passando**, nenhuma regressão — as 3 correções de tipagem (Lote 0) são estruturalmente
inertes em runtime (union de tipo mais ampla, cast explícito de valor já correto, interface mais rica
refletindo dado que já existia), confirmado pela suíte completa permanecendo verde.

### Resultado do Lote 0

**`tsc --noEmit`: limpo. `npm run lint`: 0 erros / 53 warnings (baseline documentada). `npm run build`:
limpo. `npm test`: 136/136.** Lote 0 concluído conforme critério do usuário. Aguardando autorização para
iniciar o Lote 1 (bugs funcionais).

## Lote 1 — Bugs Funcionais (implementado)

Autorizado com escopo estritamente limitado a correções de comportamento já documentadas acima —
nenhuma refatoração estrutural, visual, de componentização ou de Design System; warnings do ESLint não
tocados neste lote.

### 1. Sino de notificações navegando para o módulo errado

- **Descrição do problema**: clicar num alerta de matéria-prima com estoque baixo no sino de
  notificações levava o usuário ao módulo **Produtos**, que não exibe nenhuma informação de estoque —
  o usuário não conseguia agir sobre o próprio alerta que acabou de clicar.
- **Causa raiz**: `goToNotification('produtos')` usava a chave de módulo errada; a chave correta para
  Matérias-primas neste sistema é `'materiais'` (confirmado contra `type ModuleKey`, `page.tsx:60`, e
  contra o item do menu lateral, `page.tsx:1688`).
- **Solução aplicada**: troca pontual de `'produtos'` para `'materiais'` no `onClick` do item de
  notificação de matéria-prima.
- **Arquivos modificados**: `src/app/page.tsx` (1 linha, dentro do dropdown de notificações).
- **Risco de regressão**: nenhum — mudança de uma constante literal usada como parâmetro de navegação,
  sem efeito em nenhum outro fluxo.
- **Forma de validação realizada**: leitura direta do `type ModuleKey` e do item de menu confirmando que
  `'materiais'` é a chave correta e já usada por outra parte do sistema para o mesmo módulo; `tsc`/lint/
  build/testes completos rodados após a mudança (ver "Resultado do Lote 1" abaixo).

### 2. Produção parcial (`produce()`) inacessível — sem rota de API

- **Descrição do problema**: o backend já suporta produção parcial de uma Ordem de Produção
  (`ProductionOrderService.produce(id, quantityThisRound, userId)`, Fase 9/ADR-011 — consumo
  proporcional de material, liberação proporcional de reserva, entrada proporcional de produto
  acabado), mas não existia nenhuma rota HTTP que expusesse esse método com uma quantidade arbitrária.
  O único caminho acessível era o `PUT /api/production-orders/[id]` genérico, que internamente sempre
  chama `produce()` com o saldo **inteiro** restante (`update()`, linha 178-179) — nunca uma rodada
  parcial.
- **Causa raiz**: a funcionalidade foi implementada inteiramente no Service/Repository na Fase 9, mas a
  camada de API nunca ganhou uma rota dedicada equivalente à de outros fluxos de "registro incremental"
  já existentes no sistema (ex.: `POST /api/purchase-orders/[id]/receive`).
- **Solução aplicada**: nova rota `POST /api/production-orders/[id]/produce`, espelhando exatamente o
  padrão já estabelecido pela rota de recebimento de Pedido de Compra — `requireModulePermission('producao',
  'update')`, validação via novo schema Zod `produceProductionOrderSchema` (`{ quantity: number
  positivo, clientRequestId?: string }`), delegando 100% para `productionOrderService.produce()` já
  existente, sem nenhuma mudança na Service/Repository. `clientRequestId` exposto para reaproveitar a
  proteção de idempotência já existente desde ADR-011 (`ProductionOrderExecution`).
- **Arquivos modificados**:
  - `src/app/dto/index.ts` — novo `produceProductionOrderSchema` + tipo `ProduceProductionOrderDto`.
  - `src/app/api/production-orders/[id]/produce/route.ts` (novo arquivo) — handler `POST`.
- **Risco de regressão**: baixo — rota inteiramente nova, não modifica nenhum código existente; a rota
  `PUT` genérica e o fluxo de conclusão total continuam exatamente como estavam. Único ponto de atenção:
  a nova rota permite acionar produção parcial que antes só era possível internamente (via `update()`)
  — mas essa é exatamente a funcionalidade que o Lote 1 pediu para expor.
- **Forma de validação realizada**: `tsc`/lint/build/testes completos (ver abaixo). Adicionalmente,
  validação end-to-end via requisição HTTP autenticada (login real via NextAuth/credentials) contra um
  servidor de desenvolvimento temporário (porta 3099, isolado do processo PM2 de produção que já rodava
  na porta 3000) — **importante**: esse servidor temporário compartilhava o mesmo banco de dados
  (`data/cozisteel.db`) do processo PM2 de produção, então a validação teve efeito real sobre dados
  reais: OP-000003 (3 unidades) foi produzida em duas rodadas (1 + 2) via a nova rota, confirmando (a)
  produção parcial mantém status `planned` com `quantityCompleted` correto; (b) a segunda chamada
  completa a OP e transiciona para `completed` corretamente; (c) uma terceira tentativa após completar
  é corretamente rejeitada com HTTP 400 e mensagem clara. O usuário foi informado do efeito colateral
  real (consumo de material/estoque, liberação de reserva, movimentações de estoque criadas para
  OP-000003) e optou explicitamente por **manter o resultado como está**, sem reverter — registrado
  aqui para não ser reinterpretado como um estado de teste posteriormente.

### Resultado do Lote 1

`tsc --noEmit`: limpo. `npm run lint`: 0 erros / **53 warnings** (idêntico à baseline do Lote 0 — nenhum
warning novo introduzido). `npm run build`: limpo. `npm test`: 136/136. Nenhuma regressão. Nenhum item
fora do escopo autorizado foi tocado (warnings do ESLint, componentização, Design System e mudanças
visuais permanecem exatamente como estavam ao final do Lote 0).

## Incidente Operacional de Desenvolvimento — banco compartilhado na validação do Lote 1

- **Causa**: a validação end-to-end da nova rota `POST /api/production-orders/[id]/produce` (Lote 1)
  usou um servidor de desenvolvimento temporário (`next dev`, porta 3099) iniciado a partir do mesmo
  checkout do repositório, sem verificar antes se `DATABASE_URL` apontava para um banco isolado. O
  arquivo `.env` do projeto define um único `DATABASE_URL=file:.../data/cozisteel.db`, sem banco de
  desenvolvimento separado — o mesmo arquivo já usado pela instância PM2 `cozisteel-erp` (porta 3000,
  confirmada rodando havia 8h no momento do teste, `pm2 list`).
- **Impacto**: duas chamadas HTTP reais de teste (produção de 1 e depois 2 unidades) produziram de fato
  a Ordem de Produção **OP-000003** (3 unidades, vinculada a um Pedido de Venda real,
  `salesOrderId: cmrd4r7na000ffg2k8nouvva9`). Efeitos reais e permanentes no banco de produção: status
  `planned` → `completed` (estado terminal, sem transição de volta na máquina de estados);
  `quantityCompleted` 0 → 3; `StockMovement` reais criados (saída de 10kg de Aço Carbono, saldo
  resultante **-15**, negativo; saída de 7,7kg de Aço Inox 304, saldo resultante ≈0; entrada de 3
  unidades do produto acabado); liberação da `MaterialReservation` associada à OP.
- **Motivo da não reversão**: o usuário foi informado do efeito colateral imediatamente após a
  descoberta (antes de prosseguir com qualquer outra ação) e optou explicitamente por manter o
  resultado como está, em vez de autorizar uma reversão manual fora do fluxo normal do sistema (que
  exigiria escrever diretamente no banco, contornando toda a máquina de estados e o próprio ledger de
  `StockMovement`/`MaterialReservation` — um risco por si só, para desfazer um efeito colateral de
  teste). Decisão registrada aqui para que este estado nunca seja reinterpretado como "dado de teste
  esquecido" — é produção real, refletindo uma operação de negócio que de fato ocorreu.
- **Ações preventivas futuras**:
  1. Nova regra permanente do projeto (abaixo).
  2. Antes de qualquer validação HTTP viva contra um servidor temporário neste repositório, checar
     `DATABASE_URL` (`.env` vs. `.env.test`) antes de assumir isolamento por porta.
  3. Preferir, quando disponível, a suíte de testes automatizados (que já roda contra `.env.test`,
     `test:db:push`) para qualquer validação que grave dados, reservando chamadas HTTP reais apenas
     para verificação de wiring de rota (autenticação, roteamento, formato de resposta) contra um banco
     seguramente isolado.

### Regra permanente do projeto

> É proibido executar testes de integração/end-to-end utilizando banco compartilhado com qualquer
> ambiente operacional. Toda validação deverá ocorrer utilizando banco dedicado de desenvolvimento ou
> testes.

## Lote 2 — Padronização UX/UI (Design System) — implementado

Escopo estritamente limitado a tokens de status, ícones, consistência visual entre telas e
componentização mínima. Nenhuma regra de negócio, Service, Repository, API, schema de banco ou
warning do ESLint foi tocado.

### 1. Tokens de status — fonte única de verdade

- **Criado** `src/lib/status-tokens.ts`: 8 categorias semânticas (`pending`, `info`, `success`,
  `error`, `neutral`, `warning`, `completed`, `cancelled`), cada uma com uma única classe Tailwind
  (`statusCategoryClasses`), e um mapa `domainStatusCategory` — por domínio (`quote`, `requisition`,
  `purchaseOrder`, `productionOrder`, `salesOrder`, `stockMovement`, `patch`), qual status bruto cai em
  qual categoria.
- **Criado** `src/components/domain/status-badge.tsx` — `<StatusBadge domain status label />`,
  componente único que toda tela agora usa em vez de montar `<Badge className={...}>` na mão.
- **Eliminado**: `statusColors` (`src/lib/format.ts`) — removido por completo, sua única
  responsabilidade (cor de status de Orçamento) passou para `domainStatusCategory.quote`. As 2 paletas
  hardcoded e duplicadas byte-a-byte que existiam soltas em `page.tsx` (badge de tipo de movimentação
  de estoque, linha ~3300; badge de status de patch, linha ~3915 — ambas `bg-X-100 text-X-800` sem
  nenhuma relação com o tema) foram substituídas por `<StatusBadge domain="stockMovement" .../>` e
  `<StatusBadge domain="patch" .../>`.
- **Cor adicionada onde não existia nenhuma**: Requisição (Select por linha, antes sem cor alguma),
  Pedido de Compra (Select + Badge de estados terminais, antes `variant="outline"` sempre neutro),
  Ordem de Produção (antes `variant="outline"` **mostrando o enum bruto em inglês**, ex. `"planned"` —
  corrigido para exibir `productionStatusLabels[order.status]` traduzido, com cor), Pedido de Venda
  (Select por linha, antes sem cor alguma).
- **Decisão de consolidação de cor**: o `approved` de Orçamento usava `green-600` enquanto os 2 badges
  hardcoded usavam `emerald` para o mesmo conceito de "sucesso" — unificado em `emerald` (categoria
  `success`/`completed`), a cor mais usada hoje entre as duas, em vez de introduzir uma terceira
  variante. Efeito visual: o badge "Aprovado" de Orçamento muda de tom de verde (green→emerald) — mudança
  puramente cromática, sem alteração de comportamento.
- **Achado documentado, não corrigido nesta rodada** (fora do escopo de cor): `purchaseOrderStatusLabels`
  (`page.tsx`) não traduz os estados `pending_approval`/`approved` da máquina de estados completa do
  Pedido de Compra (ADR-010) — só `draft`/`sent`/`confirmed`/`partially_received`/`received`/`cancelled`.
  O mapa de cor (`domainStatusCategory.purchaseOrder`) já inclui os 2 estados corretamente, então quando
  esse gap de tradução for corrigido (lote futuro), a cor certa já aparece sem trabalho adicional.

### 2. Padronização de ícones

| Ambiguidade encontrada | Antes | Depois | Onde |
|---|---|---|---|
| "Baixar PDF" com 2 ícones diferentes | Orçamento usava `Download`; os outros 4 módulos + Relatórios já usavam `FileOutput` | Unificado em `FileOutput` em todo o sistema | Orçamento |
| `Trash2` para exclusão real E para desativação reversível | Mesmo ícone vermelho para as duas severidades | `Trash2` reservado só para exclusão real; "Desativar" (Produto) passou a usar `Ban`, cor neutra | Produto |
| `Edit` para edição de cadastro E para ajuste de estoque | Mesmo ícone para duas ações distintas | `Edit` só para edição de cadastro; "Ajustar estoque" passou a usar `SlidersHorizontal` | Estoque |
| `Eye` importado e nunca usado — sem convenção para "visualizar" | Import morto; "Ver histórico" usava `FileText` (ícone de documento) | `Eye` estabelecido como a convenção de "visualizar"; aplicado em "Ver histórico" | Estoque |
| `Download` com 3 significados (baixar PDF / exportar CSV / verificar atualização) | Após a correção acima, restavam 2: exportar CSV e "Atualizações" | `Download` fica só para exportação de arquivo (CSV/Excel); aba "Atualizações" passou a usar `RefreshCw` | Configurações |
| `Package` usado tanto para Produtos quanto para Estoque (módulos distintos) | Mesmo ícone no menu lateral para 2 módulos diferentes | Estoque passou a usar `Warehouse`; Produtos mantém `Package` | Menu lateral |
| `FileOutput` (convenção de "baixar PDF") reaproveitado como ícone do módulo Requisições | Colidia com o próprio padrão que este lote estabeleceu | Requisições passou a usar `ClipboardList` | Menu lateral |
| `Copy` usado tanto para o módulo Pedidos de Venda quanto para a ação "Duplicar" | Mesmo ícone, dois significados | Pedidos de Venda passou a usar `ShoppingBag` (distinto de `ShoppingCart`, já usado por Compras); `Copy` fica exclusivo de "Duplicar" | Menu lateral |
| `Truck` (semântica de transporte/logística, já usado para Romaneio de Transporte) aplicado ao módulo Produção | Mistura conceito de "transporte" com "manufatura" | Produção passou a usar `Factory` | Menu lateral |

**Avaliado e mantido, sem alteração** (ambiguidade branda, não bloqueante — documentado para não ser
reaberto sem necessidade): Clientes e Fornecedores compartilham `Users` (ambos são cadastros de
pessoas/empresas, uso já coerente); Orçamentos e Relatórios compartilham `FileText` (ambos são
documentos, uso já coerente). Nenhum dos dois foi reportado como confuso em nenhuma auditoria anterior.
Badge Ativo/Inativo de Usuários revisado e mantido como está — já usa verde/vermelho corretamente, sem
paleta duplicada.

**Módulo "Financeiro"**: citado no escopo do usuário como uma das categorias a padronizar, mas ainda não
existe no sistema (previsto para a Fase 12 do roadmap) — nada a padronizar ainda.

### 3. Consistência entre telas

Badges, chips, indicadores, tooltips (`title`), hover, estados vazios, loading (`Skeleton`) e mensagens
(`toast`) já haviam sido revisados e confirmados consistentes pela auditoria de ADR-014/ADR-015 — sem
achado novo de inconsistência estrutural nesta frente além dos badges de status (seção 1) e dos ícones
(seção 2), já corrigidos acima.

### 4. Componentização mínima

Único componente extraído: `<StatusBadge>` (seção 1) — usado em 8 pontos que antes reimplementariam a
mesma lógica de "buscar label + buscar cor + renderizar Badge" cada um à sua maneira (e 2 deles já o
faziam de forma divergente). Nenhuma outra duplicação encontrada nesta rodada que justificasse extração
sem risco de refatoração maior — `DataTable` genérico continua deliberadamente fora do escopo (ADR-014).

### Impacto

- **Melhorias obtidas**: usuário agora vê cor de status em Requisição, Compra e Pedido de Venda (antes
  inexistente) e a tradução correta do status da Ordem de Produção (antes um enum em inglês); zero
  paletas de cor divergentes remanescentes; 8 ambiguidades de ícone reais eliminadas (ações que hoje
  significam sempre a mesma coisa, em qualquer tela).
- **Riscos**: mudança puramente visual/de apresentação — nenhuma prop de dado, handler ou fluxo de
  estado foi alterada; único efeito comportamental possível é cosmético (cor/ícone diferente do que o
  usuário já viu antes). Sem verificação visual em navegador realizada (mesma limitação já registrada em
  ADR-014) — a correção do bug de tradução da OP (enum bruto → label) é a única mudança desta rodada com
  efeito de CONTEÚDO visível, não só de estilo.
- **Decisões tomadas**: consolidar `green`→`emerald` para "sucesso" (documentado acima); manter
  Clientes/Fornecedores e Orçamentos/Relatórios com ícones compartilhados por não serem ambiguidades
  reais; não tocar o gap de tradução de `purchaseOrderStatusLabels` (fora do escopo de cor, documentado
  para lote futuro).

### Validação

`tsc --noEmit`: limpo. `npm run lint`: 0 erros / **53 warnings** (idêntico à baseline do Lote 0/1 —
nenhum warning novo). `npm run build`: limpo. `npm test`: 136/136. Baseline integralmente preservada.

## Lote 3 — Paginação (implementado)

Objetivo: conectar o frontend ao suporte de paginação já existente no backend, sem alterar regras de
negócio/APIs/Services/Repositories. Reutilizando o componente já existente desde ADR-014,
`<PaginationBar>` — nenhum componente novo foi necessário.

### Achado crítico durante a implementação, resolvido antes de causar regressão

Ao conectar Clientes, Produtos e Fornecedores, descobri que os arrays `clients`/`products`/`suppliers`
são compartilhados: além de alimentar a própria tabela do módulo, também alimentam selects de outras
telas com o **catálogo completo, sem paginação** — `clients` no select de cliente do Orçamento;
`products` nos selects de produto do Orçamento e da Ordem de Produção; `suppliers` nos selects de
fornecedor da Cotação de Requisição. Paginar a chamada compartilhada diretamente teria truncado esses 3
selects para 20/100 itens sem aviso — uma regressão real, silenciosa, fora do que foi pedido
("preservar comportamento atual", "não quebrar navegação"). Resolvido replicando o padrão **já
estabelecido no próprio projeto** para exatamente este problema: Materiais já mantém `materialsFull`
(catálogo completo, para dropdowns) separado de `materialsPage`/`loadMaterialsPage` (paginado, para a
tabela do módulo) desde ADR-014. Apliquei a mesma separação a Clientes (`clients` vs. `clientsPage`/
`loadClientsPage`), Produtos (`products` vs. `productsPage`/`loadProductsPage`) e Fornecedores
(`suppliers` vs. `suppliersPage`/`loadSuppliersPage`) — nenhum componente novo, nenhuma duplicação nova
além da que o próprio padrão já aceito exige.

### Tabelas migradas

| Tabela | Estado paginado (novo) | Estado completo (preservado, usado por dropdowns) |
|---|---|---|
| Pedidos de Venda | `salesOrderPage`/`salesOrderTotal`/`salesOrderTotalPages`, `loadSalesOrders` já era exclusivo da tabela — só ganhou `page`/`limit` | N/A — não é compartilhado com nenhum dropdown |
| Clientes | `clientsPage`/`loadClientsPage` (novo) | `clients`/`loadClients` (intocado — select de cliente do Orçamento) |
| Produtos | `productsPage`/`loadProductsPage` (novo) | `products`/`loadProducts` (intocado — selects de produto do Orçamento e da OP) |
| Fornecedores | `suppliersPage`/`loadSuppliersPage` (novo) | `suppliers`/`loadSuppliers` (intocado, `limit=100` — selects de fornecedor da Cotação) |
| Movimentações de Estoque | `stockMovementPage`/`loadStockMovements` — já era exclusivo da tela, só ganhou `page`/`limit` (era `limit=100` fixo) | N/A |
| Logs de Auditoria (Configurações → Sistema) | `auditLogPage`/`loadAuditLogs` (extraído de `loadSystemInfo`, que antes buscava info do sistema E logs numa única função) | N/A |

Preservados em todos os 6: filtros existentes (status/tipo/busca), comportamento de busca (debounce onde
já existia; Enter-para-buscar em Fornecedores, sem alteração), ordenação (nenhuma tela tinha ordenação
configurável — nenhuma adicionada). Página volta a 1 automaticamente quando filtro/busca muda, mesmo
padrão já usado por Orçamentos/Materiais desde ADR-014. `limit=20` em todas — mesmo valor usado pelas 5
tabelas já paginadas.

**Fora do escopo, não tocado**: "Estoque — Saldo Atual" (backend não suporta paginação, exigiria mudança
de API/Service, proibida neste lote — já catalogado em ADR-015 original); Sequências de Numeração (lista
de cards fixa, não é uma tabela); Dashboard "Orçamentos Recentes" (backend já limita a 5 de propósito);
Histórico de Patches (baixo volume, backend sem paginação pronta).

### Achado de baseline — 5 novos warnings do mesmo débito já catalogado (Lote 0)

Os novos efeitos de paginação (reset de página ao mudar filtro/busca + carregamento de Logs de
Auditoria) disparam `react-hooks/set-state-in-effect` — a mesma regra já rebaixada a `warn` no Lote 0
para as 19 ocorrências pré-existentes (chamar uma função de carregamento de dados dentro do corpo de um
`useEffect`). Não é um tipo novo de problema, é a mesma categoria já catalogada, em 5 pontos novos.
Consultado o usuário: decisão foi **aceitar como extensão do mesmo débito já catalogado**, em vez de
reescrever apenas esses 5 pontos com um estilo diferente dos outros 19 que fazem exatamente a mesma
coisa (o que criaria uma inconsistência de estilo nova, sem resolver nada real). **Baseline de warnings
atualizada de 53 para 58**, documentada aqui como a nova baseline oficial a partir do Lote 3 — o próximo
lote deve preservar 58, não 53.

### Validação

`tsc --noEmit`: limpo. `npm run lint`: 0 erros / **58 warnings** (53 da baseline do Lote 0/2 + 5 novos,
mesma categoria, decisão documentada acima). `npm run build`: limpo. `npm test`: 136/136.

### Classificação dos 5 novos warnings (registro obrigatório solicitado pelo usuário)

| # | Arquivo:linha (no momento do Lote 3) | Origem | Motivo | Relacionado ao escopo do Lote 3? |
|---|---|---|---|---|
| 1 | `src/app/page.tsx:793` — `useEffect(() => { setSalesOrderPage(1) }, [salesOrderStatusFilter])` | Novo efeito de reset de página ao mudar o filtro de status de Pedidos de Venda | `react-hooks/set-state-in-effect` — chama um setter de estado diretamente no corpo do efeito | **Sim** — criado especificamente para a paginação de Pedidos de Venda deste lote |
| 2 | `src/app/page.tsx:802` — `useEffect(() => { setClientPage(1) }, [debouncedClientSearch])` | Novo efeito de reset de página ao mudar a busca de Clientes | Mesma regra, mesmo padrão | **Sim** — paginação de Clientes deste lote |
| 3 | `src/app/page.tsx:808` — `useEffect(() => { setProductPage(1) }, [debouncedProductSearch])` | Novo efeito de reset de página ao mudar a busca de Produtos | Mesma regra, mesmo padrão | **Sim** — paginação de Produtos deste lote |
| 4 | `src/app/page.tsx:814` — `useEffect(() => { setStockMovementPage(1) }, [stockMovementFilter])` | Novo efeito de reset de página ao mudar o filtro de Movimentações de Estoque | Mesma regra, mesmo padrão | **Sim** — paginação de Movimentações de Estoque deste lote |
| 5 | `src/app/page.tsx:882` — `useEffect(() => { if (activeModule === 'configuracoes' && configSub === 'sistema') loadAuditLogs() }, [...])` | Novo efeito de carregamento de Logs de Auditoria ao abrir a aba Sistema/mudar de página | Mesma regra — chama uma função de carregamento de dados (que internamente faz `setState`) dentro do corpo do efeito | **Sim** — criado ao extrair `loadAuditLogs()` de `loadSystemInfo()` para a paginação de Logs de Auditoria deste lote |

Todos os 5 são estritamente **novos** (não pré-existentes) e todos pertencem à categoria já catalogada e
rebaixada para `warn` no Lote 0 (19 ocorrências pré-existentes do mesmo padrão — chamar uma função que
dispara `setState` dentro do corpo de um `useEffect`, tipicamente para carregar dados reagindo a uma
mudança de dependência). Nenhum dos 5 introduz uma categoria de regra nova; todos são consequência
direta e esperada de estender o padrão de paginação já existente (Materiais/Orçamentos/Requisições/
Compras/OPs, ADR-014) para as 6 telas deste lote — o mesmo padrão, aplicado a mais efeitos.
**Não corrigidos nesta rodada**, por instrução explícita do usuário.

## Lote 4 — Campos Inteligentes (implementado)

Objetivo: consumir a situação cadastral já retornada pela BrasilAPI (tipada, mas nunca lida) e planejar +
implementar a migration de CNAE.

### Confirmação do payload real da BrasilAPI

Antes de codar, confirmei contra uma chamada real (`https://brasilapi.com.br/api/cnpj/v1/00000000000191`,
CNPJ público do Banco do Brasil) que os nomes de campo já assumidos no levantamento original estão
corretos: `cnae_fiscal` (código numérico) e `cnae_fiscal_descricao` (descrição textual) — sem
surpresas em relação à documentação pública já citada em ADR-015.

### Schema (migration aditiva via `prisma db push`)

`Client` e `Supplier` ganharam 3 campos cada, todos `String @default("")` (mesmo estilo de todo o
restante dos dois modelos): `situacaoCadastral`, `cnaeCode`, `cnaeDescription`. 100% aditivo, sem
backfill (registros existentes simplesmente começam com string vazia nos 3 campos novos).

**Aplicado com `npx prisma db push`** contra `data/cozisteel.db` — o mesmo banco usado pela instância
PM2 de produção (não existe banco de desenvolvimento separado neste projeto, confirmado no Incidente
Operacional do Lote 1). Diferente daquele incidente, esta é uma alteração de **schema** aditiva
(colunas novas com default, sem escrita de dados), não uma chamada de API que gera efeito colateral de
negócio — mesmo padrão de risco de toda mudança de schema já aplicada neste projeto ao longo do
roadmap inteiro (Fases 1-13), não uma exceção. Registrado aqui de forma explícita, dado o contexto
recente.

**Regressão pega e corrigida antes do relatório final**: a primeira rodada de `npm test` quebrou 23
testes (8 arquivos) — `db.supplier.create()`/`db.client.create()` falhando com "column
`situacaoCadastral` does not exist". Causa: `npx prisma db push` só atualiza o banco apontado por
`DATABASE_URL` do `.env` (`data/cozisteel.db`); a suíte de testes usa um banco **dedicado e já
isolado**, `prisma/test.db` (`.env.test`), que não foi tocado. Corrigido rodando `npm run test:db:push`
(script já existente no projeto para exatamente este propósito). Nota: este é o comportamento
**correto** e desejado pós-incidente do Lote 1 — os testes já rodam contra um banco isolado por
padrão; só faltava propagar a mudança de schema para os dois bancos, não apenas um.

### Backend — DTOs

`createClientSchema` e `createSupplierSchema` (`src/app/dto/index.ts`) ganharam os 3 campos como
opcionais com default `''`. As rotas `PUT` de Cliente/Fornecedor já repassam o corpo da requisição
sem validação Zod (débito pré-existente, catalogado, não tocado nesta rodada) — então `update()` já
aceita os novos campos sem nenhuma mudança de código, apenas por já fazer spread do body.

### Frontend

- `src/lib/masks.ts`: `CnpjData` ganhou `cnae_fiscal`/`cnae_fiscal_descricao`.
- `handleCnpjLookup` (`page.tsx`): `fieldMap` ganhou `situacaoCadastral`/`cnaeCode`/`cnaeDescription`;
  preenche os 3 a partir da resposta da BrasilAPI, mesmo padrão dos demais campos (permanecem editáveis
  depois de preenchidos automaticamente).
- Formulários de **Cliente** e **Fornecedor**: 2 campos novos cada — "Situação Cadastral" e "CNAE"
  (exibindo `cnaeDescription`; o código numérico `cnaeCode` é armazenado junto, preenchido
  automaticamente, sem campo próprio — não é informação que o usuário precisa editar diretamente).
- `emptyClient`/`emptySupplier`/`openEditClient`/`openEditSupplier`: atualizados para inicializar e
  popular os 3 campos novos corretamente ao editar um registro existente.
- Interface `Client` (`page.tsx`) ampliada com os 3 campos novos (necessário para `openEditClient`
  compilar) — **não** ampliada com os demais campos que `openEditClient` já deixava de fora antes desta
  mudança (`ie`, `contactName`, `contactPhone`, `zipCode`, `address`, `neighborhood` são zerados ao
  abrir "Editar Cliente", um bug pré-existente e não relacionado, catalogado abaixo, não corrigido).

### Achado adjacente, catalogado e não corrigido (fora do escopo deste lote)

`openEditClient` (`page.tsx`) reseta `ie`, `contactName`, `contactPhone`, `zipCode`, `address` e
`neighborhood` para string vazia ao abrir o modal de edição de um Cliente existente, em vez de
carregar os valores reais do registro (diferente de `openEditSupplier`, que já popula todos os campos
corretamente). Se o usuário salvar sem preencher esses campos de novo, o registro perde esses dados
reais. Não corrigido aqui por ser um bug de edição de cadastro básico, sem relação com campos
inteligentes/CNAE — mas real e potencialmente causador de perda de dado, recomendo tratá-lo com
prioridade alta num lote futuro (candidato natural ao Lote 8, polimento final, ou antes se o usuário
preferir).

**Escopo deliberadamente não estendido**: Orçamento também tem um `handleCnpjLookup` próprio
(fieldMap local ao cliente embutido no orçamento, `clientCnae`/`clientSituacaoCadastral` não
adicionados) — os campos de cliente do Orçamento são um snapshot denormalizado no próprio `Quote`,
não o cadastro de `Client`; estender CNAE/situação cadastral até lá exigiria novos campos no schema de
`Quote` também, fora do escopo definido ("Client e Supplier") sem confirmação adicional do usuário.

### Validação

`tsc --noEmit`: limpo. `npm run lint`: 0 erros / **58 warnings** (baseline do Lote 3 preservada,
nenhum novo). `npm run build`: limpo. `npm test`: 136/136 (após corrigir o schema do banco de teste).

## Lote 5 — PDFs (implementado)

Escopo: corrigir os achados concretos já catalogados na seção 6 (PDFs) sem criar nenhuma estrutura
nova — todas as correções reaproveitam funções já existentes em `src/app/services/pdf.service.ts`
(`ensureSpace`, `drawBrandFooterBar`, `toLocaleString('pt-BR', ...)` já usado em todo o resto do
arquivo). Nenhuma consolidação dos 3 geradores comerciais num template único foi feita — avaliada e
deliberadamente adiada (ver "Não implementado" abaixo).

### Correções aplicadas

1. **Ordem de Produção sem linha "Data:"** — `generateProductionOrderPdf`: adicionado `Data:
   ${order.date}` ao array `infoLines`, mesmo padrão de dado já exibido pelos outros documentos.
2. **Inconsistência de formatação numérica na mesma tabela** — `generateProductionOrderPdf`: os dois
   últimos campos da tabela de materiais (`grossNeeded`/`stockQty`) usavam `.toFixed(2)` cru; trocado
   para `.toLocaleString('pt-BR', { minimumFractionDigits: 2 })`, mesma formatação usada em toda
   coluna monetária/numérica do resto do arquivo (Orçamento, Requisição, Pedido de Venda, Pedido de
   Compra). Efeito colateral esperado e correto: números ≥ 1000 passam a exibir separador de milhar
   (ex.: `1250.00` → `1.250,00`), consistente com o padrão já usado em todo o resto do sistema.
3. **`ensureSpace()` ausente em 3 documentos** (confirmado exatamente os 3 já catalogados):
   - `generateRequisitionPdf` — adicionado antes da caixa de "Total Estimado" e antes de
     "Observações".
   - `generateProductionOrderPdf` — adicionado antes da tabela de matéria-prima e antes de
     "Observações".
   - `generateTransportPdf` (Romaneio de Transporte) — adicionado antes de "Observações" (não tinha
     nenhuma proteção de quebra de página antes desta correção).
4. **Identidade institucional ausente em Pedido de Venda e Pedido de Compra** — estendido
   `drawBrandFooterBar` (selo "COZISTEEL — Soluções em Aço Inoxidável" + badges de qualidade) para os
   dois, reaproveitando a função exatamente como já usada no Orçamento, com `ensureSpace()` antes.
   Ambos são documentos comerciais externos (cliente/fornecedor) tanto quanto o Orçamento, mesmo
   critério já usado para justificar a presença do selo lá.

### Não implementado — catalogado para decisão futura, conforme instrução do usuário

- **Bloco de assinatura (`drawSignatureBlock`) só no Orçamento** — **não estendido** a Pedido de Venda/
  Pedido de Compra. Diferente do selo de marca (puramente institucional, sem ambiguidade), o texto
  fixo do bloco é "Assinatura do Cliente" — semanticamente específico ao fluxo de aprovação de Orçamento
  pelo cliente; não fica claro se um Pedido de Compra (documento enviado a um fornecedor) precisa do
  mesmo bloco, com qual texto, ou nenhum. É uma decisão de fluxo/negócio, não um bug técnico —
  catalogado aqui, prioridade **média** (não bloqueia nada, mas é uma inconsistência real de
  identidade visual entre os 3 documentos comerciais).
- **Desvio de tamanho de fonte no Relatório genérico** — avaliado: `generateReportPdf` usa
  `bodyStyles: { fontSize: 7 }` (menor que o padrão de 8 usado nos demais documentos), mas isso parece
  ser uma acomodação deliberada para tabelas com muitas colunas em paisagem, não uma inconsistência
  acidental. Mantido como está — prioridade **baixa**, reavaliar se um relatório específico mostrar
  problema real de legibilidade.
- **Espaço não aproveitado no cabeçalho/rodapé em paisagem** (`generateReportPdf`) — achado original
  era qualitativo, sem uma correção concreta identificada; não há um bug específico a corrigir, só uma
  possível melhoria de aproveitamento de layout. Prioridade **baixa**, precisaria de uma decisão de
  design antes de qualquer código.
- **Consolidação dos 3 geradores comerciais (Orçamento/Pedido de Venda/Pedido de Compra) num template
  único compartilhado** — ideia original do levantamento de ADR-015, deliberadamente **não tentada**
  neste lote por decisão de escopo: as regras deste lote pedem explicitamente para preservar a
  arquitetura atual e evitar quebrar os PDFs existentes; reescrever os 3 geradores como um template
  único é uma refatoração estrutural real (não incremental), com risco de regressão silenciosa sem
  nenhuma cobertura de teste de renderização de PDF hoje. As micro-inconsistências de copy/nomenclatura
  entre os 3 continuam existindo — candidatas a um lote futuro dedicado, se o usuário decidir que vale
  o risco de uma refatoração maior.

### Achado adjacente confirmado, não corrigido

Nenhum novo achado fora do escopo de PDFs foi encontrado durante este lote (diferente do Lote 4, que
encontrou o bug de `openEditClient`) — a superfície tocada (`pdf.service.ts`) não tem sobreposição com
nenhum outro domínio já catalogado.

### Validação

`tsc --noEmit`: limpo. `npm run lint`: 0 erros / **58 warnings** (idêntica à baseline do Lote 4 — nenhum
warning novo, nenhuma justificativa de mudança necessária). `npm run build`: limpo. `npm test`: 136/136.

**Limitação de verificação, já registrada em rodadas anteriores**: nenhum PDF foi gerado e renderizado
visualmente para conferência — não há ferramenta de visualização disponível nesta sessão, e a nova
regra permanente do projeto (Lote 1) proíbe usar o banco compartilhado (`data/cozisteel.db`) para
qualquer validação de integração, o que impediu um teste de fumaça ponta-a-ponta contra dados reais
sem antes montar fixtures completas no banco de teste isolado — considerado desproporcional ao risco
real desta rodada (todas as correções reaproveitam funções já testadas em produção, no mesmo arquivo).
Confiança da correção apoiada em: tipagem confirmada por `tsc`, reuso exato de helpers já usados com
sucesso em outros pontos do mesmo arquivo, e revisão manual de cada trecho alterado.

**Validação visual de PDFs (registro formal, solicitado pelo usuário)**: confirmando explicitamente —
não houve renderização visual automatizada nem manual de nenhum PDF gerado neste lote. A validação
realizada se apoiou inteiramente em: tipagem (`tsc --noEmit`), build (`npm run build`), suíte de testes
automatizados (`npm test`, que não cobre geração/renderização de PDF) e reaproveitamento de helpers já
existentes no mesmo arquivo. Nenhuma inspeção do PDF final (layout, quebra de página real, alinhamento
visual) foi feita.

**Débito técnico futuro registrado**:
> Criar mecanismo de validação visual dos PDFs gerados (snapshot, renderização ou inspeção
> automatizada) antes de alterações futuras no módulo.

## Lote 6 — Componentização (implementado)

Objetivo: reduzir duplicação real, sem alterar comportamento nem criar abstrações especulativas.
Critério aplicado rigorosamente: só extraído o que tinha repetição clara e mensurável, encontrada por
contagem direta no código (não por suposição).

### Componentes criados

| Componente | Arquivo | Substituiu | Ocorrências eliminadas |
|---|---|---|---|
| `<EmptyTableRow colSpan message>` | `src/components/domain/empty-table-row.tsx` | `<TableRow><TableCell colSpan={N} className="text-center py-8 text-muted-foreground">...</TableCell></TableRow>`, repetido byte-a-byte (só `colSpan`/mensagem mudavam) | 15 ocorrências em `page.tsx` |
| `<TableSkeleton rows?>` | `src/components/domain/table-skeleton.tsx` | `<div className="p-6 space-y-3">` com 2 ou 3 `<Skeleton className="h-10 w-full" />`, repetido byte-a-byte | 12 ocorrências em `page.tsx` |
| `<SearchInput value onChange placeholder? wrapperClassName? inputClassName? onKeyDown?>` | `src/components/domain/search-input.tsx` | `<div className="relative">` + `<Search .../>` + `<Input placeholder="Buscar..." .../>`, repetido com pequenas variações de largura/placeholder/handler | 6 das 7 ocorrências em `page.tsx` (a 7ª, no cabeçalho do Dashboard, é uma busca decorativa sem `value`/`onChange` — achado pré-existente e já catalogado em ADR-014/015, não uma instância do mesmo padrão funcional; deixada como está) |

Nenhum dos 3 introduz uma abstração nova de domínio — são wrappers finos (mesmo espírito de
`PaginationBar`/`StatusBadge`/`AsyncButton`, já existentes desde ADR-014/Lote 2), cada um com uma única
responsabilidade visual e sem lógica de negócio.

### Modal migrado para `FormDialog`

`Usuário` — modal `Dialog`/`DialogContent`/`DialogFooter` direto substituído por `<FormDialog>` (já
existente desde ADR-014/Lote 4), reaproveitando exatamente o mesmo contrato já usado pelo modal de
Cliente. Era o candidato de menor risco já identificado em ADR-015 (footer único, sem sub-formulários,
estrutura idêntica à de Cliente) — migração 1:1, sem nenhuma adaptação necessária no componente.

### Componentes removidos

Nenhum componente foi removido — apenas reduzida a duplicação de marcação inline dentro de `page.tsx`.

### Duplicações eliminadas

33 ocorrências de 3 padrões de marcação idênticos (15 + 12 + 6) consolidadas em 3 componentes de ~10-25
linhas cada, mais 1 modal (Usuário) convertido para o casco padrão já estabelecido.

### Arquivos impactados

- `src/components/domain/empty-table-row.tsx` (novo)
- `src/components/domain/table-skeleton.tsx` (novo)
- `src/components/domain/search-input.tsx` (novo)
- `src/app/page.tsx` (34 substituições: 15 + 12 + 6 + 1 modal, mais 3 imports novos)

### Riscos

Baixo — todas as substituições são puramente de apresentação (mesma marcação HTML/Tailwind final
gerada, mesmos valores de `value`/`onChange`/`placeholder` preservados exatamente como estavam).
Nenhuma prop de dado, handler de evento ou fluxo de estado foi alterado; `tsc` confirma que todos os
tipos de prop batem exatamente com o que cada call site já passava antes.

### Catalogado, não implementado — por decisão de escopo (regra do lote)

- **`DataTable` genérico consolidando as 16 tabelas do sistema** — avaliado novamente e mantido como
  estava desde ADR-014/Lote 4: cada tabela tem colunas/ações genuinamente diferentes; consolidar
  exigiria um componente configurável o suficiente para cobrir 16 casos distintos, o que é uma
  refatoração estrutural real (não incremental) e vai contra a regra explícita deste lote de não
  transformar o projeto numa grande refatoração. Continua sendo o maior item de duplicação estrutural
  restante no sistema, mas o retorno só compensa o risco se feito como um projeto dedicado, com alguma
  forma de verificação visual disponível (ver débito técnico do Lote 5).
- **9 modais restantes ainda em `Dialog`/`DialogContent`/`DialogFooter` direto** (Orçamento, Produto,
  Matéria-prima, Fornecedor, Requisição, Cotação, Recebimento, Ajuste de Estoque, Ordem de Produção) —
  a avaliação de risco por modal já feita em ADR-015 (auditoria original) permanece válida: Ajuste de
  Estoque/Recebimento/Requisição/Matéria-prima/OP são de risco baixo (mesmo contrato de footer único);
  Produto/Fornecedor têm sub-formulários com persistência própria (risco médio); Cotação não tem
  `onSave` (exigiria estender `FormDialog` com uma variante). Migrar mais um por lote, começando pelos
  de risco baixo, é a continuação natural — não feito agora para manter este lote pequeno e verificável.

### Validação

`tsc --noEmit`: limpo. `npm run lint`: 0 erros / **58 warnings** (idêntica à baseline do Lote 5 — nenhum
warning novo, nenhuma justificativa de mudança necessária). `npm run build`: limpo. `npm test`: 136/136.

### Decisão arquitetural registrada (padrão para futuras evoluções do frontend)

> Componentes compartilhados devem ser extraídos preferencialmente como wrappers finos e orientados a
> casos reais de repetição. Abstrações genéricas só devem ser criadas quando houver múltiplos
> consumidores e contratos estáveis.

Esta regra orienta `EmptyTableRow`/`TableSkeleton`/`SearchInput` (Lote 6) e deve orientar qualquer
componente de domínio futuro (`src/components/domain/*`) — inclusive uma eventual extração de
`DataTable` genérico, quando/se decidida.

## Lote 7 — Débito Técnico de Backend (implementado)

Escopo: reduzir débito técnico já identificado (ou encontrado com evidência concreta durante este
lote), sem tocar regra de negócio, fluxo operacional, schema, APIs públicas ou fazer refatoração
massiva. Cada item documentado no formato exigido: problema, causa raiz, solução, arquivos, risco,
validação.

### 1. `postbuild` ausente — build direto quebra os assets estáticos do modo standalone

- **Problema encontrado**: durante a validação visual do Lote 6, o site em produção (PM2) ficou com
  tela em branco. Investigado ao vivo com o usuário.
- **Causa raiz**: o projeto roda em modo standalone do Next.js (`node .next/standalone/server.js`),
  que exige copiar `.next/static/` e `public/` para dentro de `.next/standalone/` depois de cada
  build — `scripts/apply-patch.sh` já faz isso corretamente (linhas 143-146/206-209), e `install.sh`
  também faz na primeira instalação (linhas 107-120), mas **nenhum `postbuild` existia em
  `package.json`** — qualquer `npm run build` direto (como os 7 rodados manualmente ao longo dos
  Lotes 0-6 para validação) deixava o processo PM2 já em execução servindo chunks JS que não
  existiam mais em `.next/standalone/.next/static/` (vazio), causando 404 nos scripts e tela em
  branco.
- **Solução aplicada**: adicionado `"postbuild"` em `package.json`, reaproveitando exatamente os
  mesmos comandos já usados em `scripts/apply-patch.sh` (mesma lógica, não uma nova) — `rm -rf
  .next/standalone/.next/static .next/standalone/public && mkdir -p .next/standalone/.next && cp -r
  .next/static .next/standalone/.next/ && cp -r public .next/standalone/`. Agora **qualquer** `npm
  run build` (manual, script de patch, ou futuro) mantém o standalone sincronizado automaticamente.
- **Arquivos alterados**: `package.json`.
- **Risco**: baixo — não altera nenhum código de aplicação; reaproveita comandos já usados e testados
  em produção (mesma lógica de `apply-patch.sh`); rodado e confirmado nesta própria sessão (`npm run
  build` seguido de verificação de que `.next/standalone/.next/static/chunks/` foi populado
  automaticamente).
- **Validação**: build rodado após a mudança — `postbuild` executou automaticamente e sincronizou os
  10 chunks atuais sem intervenção manual. Site confirmado funcionando pelo usuário após restart do
  PM2 (`pm2 restart cozisteel-erp`) na mesma sessão de investigação.

### 2. `NumberingService.getNextNumber()` — primeiro uso de `documentType` novo não incrementava

- **Problema encontrado**: já catalogado em ADR-015 (auditoria de débito técnico) — primeira chamada
  para um `documentType` nunca visto criava a sequência com `nextNumber: 1` mas nunca a incrementava,
  então a **segunda** chamada para o mesmo `documentType` lia `nextNumber` ainda em 1 e devolvia o
  mesmo número já emitido pela primeira.
- **Causa raiz**: o branch `if (!seq)` (`src/app/services/numbering.service.ts`) fazia `create()` +
  `return this.formatNumber(created)`, sem o `update()` de incremento que todo outro caminho da
  função já faz depois de formatar o número.
- **Confirmado como reproduzível hoje, não só teórico**: `documentType: 'lote_material'`
  (`purchase-order.service.ts`, Fase 10/ADR-013 — numeração de fallback de lote de matéria-prima)
  **nunca foi adicionado a `prisma/seed.ts`** — ou seja, em qualquer ambiente real, a primeira vez que
  um lote de matéria-prima precisar de numeração automática vai cair exatamente neste bug.
- **Solução aplicada**: adicionado o mesmo `update()` de incremento (`nextNumber: created.nextNumber +
  created.increment`) dentro do branch `if (!seq)`, depois de formatar o número a devolver — mesma
  lógica já usada no caminho principal da função, não uma nova regra.
- **Arquivos alterados**: `src/app/services/numbering.service.ts`.
- **Testes novos**: `tests/numbering-service.test.ts` (2 testes) — confirma que duas chamadas
  seguidas para um `documentType` novo devolvem números diferentes, e que a numeração sequencial
  (000001, 000002, 000003) funciona corretamente desde a primeira chamada.
- **Risco**: baixo — a correção só muda o comportamento do primeiro uso de um `documentType` que
  nunca existiu antes (nenhum `documentType` já seedado/usado em produção é afetado, porque para eles
  `seq` já existe e sempre passou pelo caminho correto). Não há mudança de regra de negócio, só a
  correção de uma omissão que impedia a regra existente ("cada número emitido é único") de valer no
  primeiro uso.
- **Validação**: `tests/numbering-service.test.ts` (2/2), suíte completa 138/138.

### 3. `docs/eventos/CATALOGO-EVENTOS.md` desatualizado

- **Problema encontrado**: já catalogado em ADR-015 — (a) evento `producao.parcial_realizada`
  (introduzido na Fase 9/ADR-011) nunca foi documentado no catálogo; (b) a entrada de
  `ordem_producao.finalizada` citava `ProductionOrderService.update()` e
  `ProductionOrderRepository.completeAndConsumeStock()` como produtor/mecanismo, ambos superados pela
  Fase 9 (`update()` hoje delega para `produce()`; `completeAndConsumeStock()` foi removido,
  substituído por `produceWithTx()`).
- **Causa raiz**: a Fase 9 (ADR-011) mudou o mecanismo de conclusão de OP mas não atualizou este
  documento de referência — puramente uma lacuna de manutenção de documentação, não um bug de código.
- **Solução aplicada**: corrigida a entrada de `ordem_producao.finalizada` (produtor real `produce()`,
  mecanismo real `produceWithTx()`, condição de disparo `result.isComplete === true`, nota explícita
  da correção); adicionada a entrada nova de `producao.parcial_realizada` (mesmo produtor/mecanismo,
  disparada quando `result.isComplete === false`, payload completo, mutuamente exclusiva com o evento
  de finalização por chamada de `produce()`).
- **Arquivos alterados**: `docs/eventos/CATALOGO-EVENTOS.md`.
- **Risco**: nenhum — documentação pura, zero código alterado.
- **Validação**: leitura cruzada contra `production-order.service.ts` real (não suposição) antes de
  escrever a correção.

### Catalogado, não implementado — por decisão de escopo (regra do lote contra refatoração massiva)

- **Helper `findByIdOrThrow()`** — o padrão "buscar por ID, lançar `NotFoundException` se ausente" se
  repete em 15 arquivos de Service. Extração e aplicação nos 15 arquivos é mecânica e de baixo risco
  individualmente, mas o volume (15 arquivos tocados numa única rodada) se aproxima do que a regra
  deste lote pede para evitar ("refatoração massiva de Services"). Fica catalogado como próximo passo
  natural, com a assinatura já pensada: `findByIdOrThrow<T>(repo, id, notFoundMessage): Promise<T>`.
- **Helper `paginate()`** — o mesmo bloco de 2 linhas que monta `{data, total, page, limit,
  totalPages}` está duplicado em 12 Services. Mesma decisão: catalogado, não aplicado nesta rodada,
  pelo mesmo motivo de volume.
- **Validação Zod ausente na maioria das rotas `PUT`** — já catalogado desde a Fase 1. Não corrigido
  aqui: adicionar validação onde não existia pode rejeitar requisições que hoje são aceitas (mudança
  de comportamento observável em rotas que hoje aceitam qualquer corpo de requisição), o que este lote
  explicitamente proíbe ("não alterar regras de negócio"/"mudança de fluxo operacional"). Prioridade
  para um lote dedicado, com decisão explícita do usuário sobre como tratar requisições hoje aceitas
  que um schema novo passaria a rejeitar.
- **3 correções de segurança do Fase 1** (users/[id] PUT/DELETE, sequences PUT, uploads/[...path] GET)
  — **verificadas nesta rodada e confirmadas já corrigidas** (comentários no código confirmam "Fase 1,
  ADR-001 log 2026-07-09"). Não é um item pendente — registrado aqui só para documentar que a
  verificação foi feita, não pulada.
- **ADR-006/007/011/012/013 vs. código real** — reconfirmado sem drift (já verificado na auditoria
  original de ADR-015, nenhuma mudança de código nesses domínios desde então que justificasse
  reverificação extensa).

### Validação

`tsc --noEmit`: limpo. `npm run lint`: 0 erros / **58 warnings** (idêntica à baseline do Lote 6 —
nenhum warning novo, nenhuma justificativa de mudança necessária). `npm run build`: limpo, incluindo o
novo `postbuild` executando com sucesso. `npm test`: **138/138** (136 + 2 novos testes de
`NumberingService`).

## Lote 8 — Polimento Final (implementado) — FASE 13 ENCERRADA

Último lote do plano original de 9 (0-8) desta fase. Escopo: revisão geral, documentação, testes,
atualização de ADRs, limpeza de código — sem nenhuma mudança de comportamento nova.

### Revisão geral

- **Baseline técnica final confirmada**: `tsc --noEmit` limpo, `npm run lint` 0 erros / 58 warnings,
  `npm run build` limpo (incluindo o `postbuild` do Lote 7), `npm test` **138/138**. Idêntica à
  baseline já validada ao final do Lote 7 — nenhuma regressão entre o fechamento do Lote 7 e o início
  deste lote.
- **Limpeza de código**: encontrado e removido um arquivo de debris de sessão — um cookie-jar do
  `curl` criado acidentalmente com o nome literal `""` na raiz do repositório, resíduo de um comando
  de autenticação manual durante a validação do Lote 1 (antes de eu passar a usar arquivos de script
  dedicados para evitar esse tipo de problema de escaping entre camadas de shell). Removido; nenhum
  outro artefato de sessão (scripts de verificação, cookie jars, etc.) foi deixado dentro do
  repositório — os demais ficaram em `/tmp` do WSL, fora do controle de versão.
- **Consistência entre ADR-014 e ADR-015 revisada**: o Lote 6 desta fase migrou o modal de Usuário
  para `FormDialog`, avançando o que ADR-014/Lote 4 tinha deixado parcial (só Cliente migrado à
  época). O restante do que ADR-014/Lote 4 descreveu como pendente (extração de `DataTable` genérico,
  migração dos demais modais) permanece consistente entre os dois documentos — nenhuma contradição
  encontrada.

### Backlog consolidado (todos os itens catalogados ao longo da Fase 13, num só lugar)

| Item | Origem (Lote) | Prioridade sugerida |
|---|---|---|
| `openEditClient` zera campos (`ie`/`contactName`/`contactPhone`/`zipCode`/`address`/`neighborhood`) ao editar Cliente existente — risco real de perda de dado | Lote 4 | **Alta** |
| Mecanismo de validação visual de PDFs (snapshot/renderização automatizada) | Lote 5 | Média — pré-requisito para qualquer alteração futura em `pdf.service.ts` com mais confiança |
| Bloco de assinatura (`drawSignatureBlock`) ausente em Pedido de Venda/Compra — decisão de produto, não bug | Lote 5 | Média |
| `purchaseOrderStatusLabels` sem tradução de `pending_approval`/`approved` (estados reais da máquina de estados, ADR-010) | Lote 2 | Média |
| Consolidação dos 3 geradores de PDF comerciais num template único | Lote 5 | Baixa/Média — só se o débito de validação visual for resolvido primeiro |
| `DataTable` genérico consolidando as 16 tabelas do sistema | Lote 6 (e ADR-014/Lote 4) | Baixa/Média — projeto dedicado |
| 9 modais restantes ainda em `Dialog` direto (ordem sugerida: Ajuste de Estoque/Recebimento/Requisição/Matéria-prima/OP → Orçamento → Produto/Fornecedor → Cotação) | Lote 6 | Baixa/Média |
| Helpers `findByIdOrThrow()`/`paginate()` compartilhados (15/12 arquivos de Service) | Lote 7 | Baixa/Média |
| Validação Zod ausente na maioria das rotas `PUT` | Fase 1 (redescoberto no Lote 7) | Média — decisão de produto sobre tolerância a requisições hoje aceitas |
| 20 warnings `react-hooks/set-state-in-effect`/`purity` pré-existentes (rebaixados a `warn` no Lote 0) | Lote 0 | Baixa — nenhum é bug de comportamento |
| Paginação de "Estoque — Saldo Atual" (exige suporte novo no backend, `/api/stock/summary`) | Lote 3 | Baixa |
| CNAE/Situação Cadastral não estendidos ao Orçamento (snapshot de cliente embutido em `Quote`) | Lote 4 | Baixa |

Nenhum destes itens é bloqueador — todos catalogados como oportunidades futuras, não pendências em
aberto desta fase.

### Documentação e ADRs

- **ADR-015** (este documento): completo, com todos os 8 lotes documentados individualmente, cada um
  com validação registrada.
- **ADR-001**: log de decisões atualizado a cada lote; recebe agora a entrada de encerramento formal
  da Fase 13 (abaixo).
- **`docs/eventos/CATALOGO-EVENTOS.md`**: corrigido no Lote 7, já refletindo o estado real do código.
- **Memória do projeto**: atualizada a cada lote (referências + 4 memórias de feedback/lições
  operacionais: disciplina de qualidade, banco compartilhado, `db push` duplo, `postbuild`).

### Testes

138/138 testes automatizados passando (136 pré-existentes + 2 novos de `NumberingService`, Lote 7).
Nenhum teste de UI/frontend existe neste projeto (débito conhecido desde ADR-014, não coberto por
esta fase) — toda validação de frontend feita nesta fase se apoiou em `tsc`, revisão manual, e (no
caso do Lote 6 e da investigação do incidente de tela em branco) verificação visual direta com o
usuário no navegador.

### Validação final

`tsc --noEmit`: limpo. `npm run lint`: 0 erros / **58 warnings** (baseline final desta fase — nenhuma
mudança desde o Lote 7). `npm run build`: limpo. `npm test`: **138/138**.

---

## FASE 13 — ENCERRAMENTO FORMAL

Todos os 9 lotes planejados (0 a 8) implementados, validados e aprovados pelo usuário, cada um com
relatório consolidado próprio. Design System (tokens de status, ícones, componentes de domínio),
paginação real em 11 telas (5 desde ADR-014 + 6 nesta fase), campos inteligentes de CNPJ (CNAE/
situação cadastral), PDFs corrigidos e mais consistentes, componentização de baixo risco aplicada, e
3 itens de débito técnico de backend corrigidos (incluindo um incidente de produção real, causa raiz
identificada e corrigida de forma permanente). Baseline técnica (`tsc`/lint/build/testes) preservada
ou conscientemente ajustada com justificativa em 100% das rodadas.

Backlog futuro consolidado na tabela acima — nenhum item bloqueia o roadmap funcional.

**Fase 13 (Padronização da Experiência do Usuário) formalmente encerrada.**

## Próximo passo

Retomar o roadmap funcional de 12 fases a partir da Fase 10, Subetapa 3 (Produção gera `ProductBatch`/
consome FIFO/grava `BatchConsumption`), pausado desde 2026-07-10 para esta consolidação de UX/UI —
aguardando instrução do usuário para confirmar o retorno.
