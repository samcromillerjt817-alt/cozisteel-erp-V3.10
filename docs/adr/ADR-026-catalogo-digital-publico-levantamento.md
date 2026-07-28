# ADR-026 — Catálogo Digital Público (Levantamento)

- **Status**: **FECHADO — Catálogo Digital Público definitivo** (decisão do usuário, 2026-07-29). Fases 1-5 implementadas e verificadas, redesign visual comercial (Codex CLI) e responsividade mobile aplicados. Fase 6/evoluções futuras só sob demanda explícita.
- **Data**: 2026-07-29
- **Origem**: pedido explícito do usuário para uma nova linha de evolução — um catálogo digital público
  (link único, sem login) onde um cliente monta uma "cesta" de produtos com personalizações e envia uma
  solicitação de orçamento, que o sistema converte automaticamente em um Orçamento interno aguardando
  triagem. Especificação completa fornecida pelo usuário (fluxo público, fluxo interno, segurança,
  diretriz explícita de "não crie uma segunda lógica paralela de orçamento" e "não altere código até
  que o plano seja revisado e aprovado").

## PARTE 0 — Como este levantamento foi feito

Leitura direta do schema (`Client`, `Product`, `Category`, `ProductImage`, `Attachment`, `Quote`,
`QuoteItem`, `User`), de `rbac.ts` (papéis/módulos/permissões), `storage.service.ts` +
`lib/storage.ts` (armazenamento de arquivo), `cnpj-cep-lookup.ts` (integração já existente com
BrasilAPI), `numbering.service.ts` (numeração de documentos) e `quote.service.ts`/`quote.repository.ts`
(já profundamente conhecidos nesta sessão pelo ADR-025). Sem agente de pesquisa — o contexto acumulado
nesta mesma sessão (ADR-023/024/025) já cobria a maior parte do terreno relevante (motor de aprovação,
máquina de status, padrão de rota pública, exposição externa via Tailscale Funnel).

## PARTE 1 — O que já existe e pode ser aproveitado

| Aspecto | Existe? | Como reaproveitar |
|---|---|---|
| Cliente | Model completo: `type` (company/person), `cpfCnpj` único **nullable**, endereço, cidade/estado, contato, campos autopreenchidos por CNPJ (`situacaoCadastral`/`cnaeCode`) | Lookup de CNPJ (`handleCnpjLookup`, via BrasilAPI) e CEP (`handleCepLookup`) já implementados e usados em Cliente/Fornecedor — mesma função serve a identificação do cliente no catálogo |
| Orçamento sem cliente formal | **Já suportado hoje**: `Quote.clientId` é opcional (`String?`), e o Orçamento já grava `clientName`/`clientCnpj`/`clientContact`/`clientEmail`/`clientPhone`/`clientAddress` **desnormalizados diretamente nele**, independente de existir um `Client` vinculado | Isso já resolve boa parte do requisito de "lead provisório" sem precisar de model novo — ver Parte 10 |
| Produto | Model rico: dimensões (width/height/length/thickness/weight), material, acabamento, família, linha, `productType`, `ProductImage[]` (galeria com `isPrimary`/`order`), `Category` (árvore com parent/children) | Base de dados já suficiente para o catálogo visual — falta só os campos de **controle de exibição pública** (Parte 3) |
| Anexos | Model genérico `Attachment` (`module`/`entityId`/`filePath`/`fileSize`/`mimeType`/`uploadedBy`) + `storageService.resolveFile()` com proteção contra path traversal, arquivo físico fora do `.next` (sobrevive a rebuild) | Mesmo model/serviço serve para anexos da solicitação pública — só precisa de limites de tamanho/tipo na rota de upload pública |
| Item de Orçamento com personalização | `QuoteItem` já tem `weight`/`width`/`height`/`length`/`notes` por item (usado pelo Romaneio, ADR-025 addendum) | Cobre boa parte dos campos de personalização da cesta — mas não cobre material/acabamento/voltagem/lado de operação/acessórios por item (Parte 2) |
| Rota pública sem autenticação | **ADR-025 é o precedente direto**: token opaco na URL como autorização, rota fora de `requireAuth`/`requireModulePermission`, página fora do SPA autenticado em `/` | Mesmo padrão arquitetural rege o catálogo — não é uma decisão nova, é reaplicar o que já existe |
| Numeração de documento | `numberingService.getNextNumber(documentType: string)` é genérico, aceita qualquer tipo novo | Nova sequência `solicitacao_catalogo` para o número de protocolo, sem mudança no serviço |
| Motor de aprovação / status machine do Orçamento | `ALLOWED_TRANSITIONS`, `approvalService` (ADR-023), `quoteService.changeStatus()` | O Orçamento gerado pelo catálogo **é um Orçamento normal**, passa pelas mesmas regras — nenhuma lógica paralela necessária (ver Parte 7) |
| Origem rastreável de um documento | `Requisition.originModule` (`manual`/`production_order`/`mrp`) já é exatamente este padrão, só que em outro domínio | Mesmo padrão: `Quote.origin` (`manual`/`catalogo_digital`) |
| Exposição externa | Tailscale Funnel já configurado e ativo (`https://cozisteel-erp.tailb28391.ts.net`) | O catálogo, uma vez implementado, já é alcançável de fora sem nenhum trabalho de infraestrutura adicional |
| Componentes de UI para tela interna | `DataTable`, `FilterBar`, `SearchableSelect`, `StatusBadge`, `StatusTimeline`, `FormDialog` — usados em todos os módulos existentes | Reaproveitáveis 1:1 na tela de triagem (Parte 5) |

## PARTE 2 — O que precisa ser criado

- **Modelo de dados**: campos de controle de exibição no `Product`; 2 models novos (`CatalogRequest` +
  `CatalogRequestItem`) para a solicitação bruta; poucos campos novos em `Quote` (Parte 3).
- **Serviços**: `catalogPublicService` (leitura pública do catálogo — produtos, categorias, busca,
  filtros, todos só com dado "seguro" pra expor), `catalogRequestService` (recebe a solicitação,
  cria/vincula Cliente ou usa dados desnormalizados, cria o Orçamento automaticamente, gera protocolo).
- **Rotas públicas**: `GET /api/public/catalog` (lista+filtros+busca), `GET /api/public/catalog/[productId]`
  (detalhe), `POST /api/public/catalog-requests` (submissão da cesta), `GET /api/public/uploads/catalog/...`
  (nova rota de imagem pública, restrita a imagens de produtos marcados para exibição — a rota de upload
  atual exige login, não pode servir o catálogo sem uma rota irmã específica).
- **Páginas públicas**: `/catalogo` (listagem+detalhe+cesta+identificação+revisão, SPA cliente-side
  própria, fora do SPA autenticado — mesmo princípio do `/orcamento/[token]` do ADR-025).
- **Tela interna**: "Solicitações do Catálogo" (fila de triagem), nova entrada de menu/módulo RBAC.
- **Segurança nova, pela primeira vez neste projeto**: rate limiting (não existe NENHUM mecanismo
  hoje — nem para a rota do ADR-025), validação de CPF (só existe validação/lookup de CNPJ hoje),
  proteção de upload (tipo/tamanho), idempotência de submissão.

## PARTE 3 — Alterações de banco de dados necessárias (proposta — nenhuma aplicada ainda)

**Novos campos em `Product`** (controle de exibição pública, tudo com default seguro — nada aparece
no catálogo até ser explicitamente habilitado):
```prisma
showInCatalog          Boolean @default(false)
catalogOrder            Int     @default(0)
catalogFeatured         Boolean @default(false)
catalogDescription      String  @default("") // descrição comercial, distinta de `description` (interna)
catalogPriceMode        String  @default("sob_consulta") // sob_consulta, exibir, faixa
catalogAllowCustomization Boolean @default(true)
```

**Novos campos em `Quote`** (rastreabilidade de origem, mesmo padrão de `Requisition.originModule`,
mais o sub-status informativo de triagem aprovado na Parte 7):
```prisma
origin            String  @default("manual") // manual, catalogo_digital
catalogRequestId  String? @unique // vínculo com a solicitação de origem, quando origin = catalogo_digital
internalStage     String? // aguardando_triagem, analise_comercial, analise_tecnica, aguardando_cliente,
                           // em_elaboracao — só relevante enquanto status = draft; sem checkTransition()
```

**2 models novos** — a solicitação bruta do cliente, guardada como registro histórico fiel do que foi
efetivamente submetido (o Orçamento gerado a partir dela pode ser editado livremente pela equipe depois,
sem apagar o que o cliente pediu originalmente):
```prisma
model CatalogRequest {
  id              String   @id @default(cuid())
  protocol        String   @unique // número de protocolo (numberingService, documentType "solicitacao_catalogo")
  status          String   @default("recebida") // recebida, em_triagem, convertida, arquivada
  clientId        String?  // vínculo se CPF/CNPJ/e-mail bateu com Cliente existente
  client          Client?  @relation(fields: [clientId], references: [id])
  clientName      String   @default("")
  clientCpfCnpj   String   @default("")
  clientContact   String   @default("") // nome do responsável
  clientEmail     String   @default("")
  clientPhone     String   @default("")
  clientCity      String   @default("")
  clientState     String   @default("")
  clientCompany   String   @default("")
  generalNotes    String   @default("") // prazo, local de instalação, observações gerais da solicitação
  sourceLink      String   @default("") // qual link gerou (Parte 15 — vendedor/campanha, vazio na v1)
  quoteId         String?  @unique // Orçamento gerado automaticamente
  quote           Quote?   @relation(fields: [quoteId], references: [id])
  createdAt       DateTime @default(now())

  items CatalogRequestItem[]
  @@index([status])
  @@index([clientId])
}

model CatalogRequestItem {
  id                String         @id @default(cuid())
  catalogRequestId  String
  catalogRequest    CatalogRequest @relation(fields: [catalogRequestId], references: [id], onDelete: Cascade)
  productId         String
  product           Product        @relation(fields: [productId], references: [id])
  quantity          Float          @default(1)
  width             Float?
  height            Float?
  length            Float?
  material          String         @default("")
  finish            String         @default("")
  voltage           String         @default("")
  operationSide     String         @default("")
  accessories       String         @default("") // texto livre ou lista serializada — ver Parte 2 do plano de implementação
  modifications     String         @default("")
  notes             String         @default("")
  isCustomized      Boolean        @default(false) // true se qualquer dimensão/material/acabamento difere do padrão do Product

  @@index([catalogRequestId])
}
```

Anexos da solicitação reaproveitam o `Attachment` genérico existente (`module: "catalog_requests"`,
`entityId: CatalogRequest.id`) — nenhum model novo necessário para isso.

**Nenhuma mudança em `Client`** além do relacionamento inverso (`catalogRequests CatalogRequest[]`) —
ver Parte 10 para por que um "lead" não precisa de model ou flag novos.

## PARTE 4 — Fluxo completo da experiência pública (proposto)

1. Cliente abre `/catalogo` (ou uma variante com parâmetro de origem, ver Parte 15).
2. Navega produtos com `showInCatalog=true`: busca, filtro por categoria, ordenação, destaques
   (`catalogFeatured`), ficha de produto (galeria, descrição comercial, dimensões padrão, material,
   preço/faixa/"sob consulta" conforme `catalogPriceMode`, indicação de aceita personalização).
3. Adiciona à cesta — por item: quantidade + campos de personalização **dinâmicos por `productType`/
   categoria** (voltagem só aparece se fizer sentido pro produto, etc. — regra de exibição condicional
   no formulário, não no schema, que já é permissivo o bastante).
4. Identificação do cliente — **decidido (2026-07-29): só ao finalizar a cesta**, não antes de navegar
   (cliente explora livremente primeiro, menos fricção). Formulário com os campos pedidos (nome/razão
   social, CPF/CNPJ, responsável, e-mail, telefone, cidade/estado, empresa, observações). CPF/CNPJ/
   e-mail disparam uma checagem silenciosa contra `Client` existente (nunca revela resultado ao
   cliente — Parte 8).
5. Revisão final: dados do cliente, itens, personalizações, observações gerais, anexos, aviso
   explícito de que não representa preço/pedido/prazo confirmado. Botão "Enviar solicitação de
   orçamento" (nunca "Finalizar compra").
6. Confirmação: protocolo exibido na tela, `CatalogRequest` criado com status `recebida`, `Quote`
   criado automaticamente em `draft` com `origin: catalogo_digital` e `catalogRequestId` vinculado,
   itens do carrinho viram `QuoteItem` (produto avulso vira "avulso" se por acaso não existir mais —
   defensivo, não deveria acontecer em uso normal), campo de personalização condensado em `notes` do
   item (ex.: "Personalizado: 120x80x60cm, aço inox 304, acabamento escovado — cliente solicitou
   revisão técnica"), aviso automático se `isCustomized` (algum item foge do padrão do Product).

## PARTE 5 — Fluxo interno do colaborador (proposto)

Nova tela "Solicitações do Catálogo" (módulo RBAC novo, `catalogo`, action `read`/`manage` — ver Parte
7 sobre por que não reaproveitar o módulo `orcamentos` diretamente). Lista (`DataTable`, mesmo padrão
de todo módulo existente) com: protocolo, cliente/lead, data, nº de itens, status. Ao abrir uma
solicitação: dados do cliente/lead, itens com personalizações e anexos, link direto pro Orçamento já
gerado (que é onde a equipe efetivamente precifica/ajusta/aprova/rejeita — reaproveitando 100% da tela
de Orçamentos existente). Ações específicas da tela de triagem: designar responsável (reaproveita
`Quote.userId`, já existe reassignment via `update()`), arquivar a solicitação (`CatalogRequest.status
= arquivada`, não mexe no Orçamento gerado — ele já existe e continua seguindo seu próprio ciclo),
registrar motivo (campo novo `archivedReason` ou reaproveitar `internalNotes` do Orçamento — a definir
no plano).

## PARTE 6 — Regras de negócio

- O Orçamento gerado nunca é aprovado/precificado/convertido em Pedido automaticamente — nasce em
  `draft`, segue exatamente a máquina de status existente do Orçamento (Parte 7 do ADR-002/ADR-023).
- Cadastro de Produto e sua BOM nunca são alterados pela solicitação — `CatalogRequestItem` é uma
  tabela própria, não escreve em `Product`/`BomItem`.
- Item com dimensão/material fora do padrão do `Product` (`isCustomized = true`) gera destaque visual
  na tela de triagem e no próprio Orçamento (aviso, não bloqueio) de que custo/prazo/viabilidade
  técnica precisam ser revisados manualmente.
- Submissão idempotente (Parte 8) — reenvio/atualização de página não deve duplicar `CatalogRequest`
  nem `Quote`.
- Confirmação pública nunca revela se um CPF/CNPJ/e-mail já está cadastrado (Parte 8).

## PARTE 7 — Máquina de estados: proposta para evitar duplicidade (pergunta central do usuário)

O usuário pediu explicitamente para avaliar se os 9 estados sugeridos (recebida, aguardando triagem,
em análise comercial, em análise técnica, aguardando informações do cliente, orçamento em elaboração,
orçamento enviado, rejeitada, arquivada) pertencem à solicitação, ao orçamento, ou a ambos — evitando
duplicar máquinas de estado.

**Proposta**: **não duplicar** — `CatalogRequest.status` fica deliberadamente minúsculo (`recebida →
em_triagem → convertida → arquivada`), cobrindo só o ciclo de vida do **intake bruto** (chegou → alguém
está olhando → virou Orçamento → foi descartada antes disso). Como a conversão em Orçamento acontece
**automaticamente na submissão** (Parte 4, passo 6), `em_triagem`/`convertida` colapsam quase no mesmo
instante na prática — a distinção só importa pros poucos minutos/segundos entre "chegou" e "o sistema
processou". Todos os estados **comerciais** que o usuário listou (em análise comercial, em análise
técnica, aguardando informações do cliente, orçamento em elaboração, orçamento enviado, rejeitada) são,
na prática, estados do **Orçamento**, não da solicitação — mas a máquina de status ATUAL do Orçamento
(`draft/sent/approved/rejected/cancelled/expired`, ADR-002) não tem granularidade pra "em análise
técnica" vs. "aguardando cliente" vs. "em elaboração": todos esses caem hoje dentro de `draft`.

Duas rotas possíveis, ambas evitando uma segunda máquina de status formal:
- **(A) Sub-status informativo, sem transição validada**: campo novo `Quote.triagemNota` ou
  `Quote.internalStage` (string livre ou enum simples, SEM `checkTransition()`, SEM efeito colateral)
  só usado enquanto `status === 'draft'`, puramente pra filtrar/organizar a fila de triagem — não é uma
  segunda máquina de estados, é uma etiqueta.
- **(B) Não criar nada novo**: usar `internalNotes` (já existe no Orçamento) + a tela de triagem
  simplesmente filtra por `CatalogRequest.status` + `Quote.status`, sem granularidade extra — mais
  simples, mas perde a visibilidade fina que o usuário pediu (não dá pra saber "em análise técnica" vs.
  "aguardando cliente" só olhando pra `draft`).

**Decisão do usuário (2026-07-29): rota (A) aprovada.** Novo campo `Quote.internalStage` (string,
nullable, sem `checkTransition()`, sem efeito colateral) — só usado enquanto `status === 'draft'`,
valores sugeridos: `aguardando_triagem`, `analise_comercial`, `analise_tecnica`,
`aguardando_cliente`, `em_elaboracao`. Puramente informativo/filtro da fila de triagem — não altera
`ALLOWED_TRANSITIONS`, `approvalService` nem nenhuma regra de negócio do Orçamento.

## PARTE 8 — Riscos de segurança

- **Rate limiting inexistente em toda a aplicação** (mesma lacuna já documentada no ADR-025) — pela
  primeira vez isso precisa ser resolvido de verdade, já que o catálogo é a superfície pública mais
  visitável/repetível deste sistema (diferente do link de orçamento do ADR-025, que é enviado 1:1 a um
  cliente específico). Precisa de uma biblioteca nova (nenhuma existe hoje) — ver Parte 16, pergunta 4.
- **Enumeração de clientes**: a checagem de CPF/CNPJ/e-mail contra `Client` existente nunca pode
  vazar resultado diferenciado (nem por timing, nem por mensagem) — sempre a mesma resposta de sucesso
  genérica, independente de ter batido ou não.
- **Upload malicioso**: a rota de anexo da solicitação pública precisa de allowlist de tipo MIME,
  limite de tamanho, e nunca servir o arquivo com o `Content-Type` declarado pelo cliente sem validação
  (mesmo problema clássico de upload — `storageService` já resolve parcialmente via extensão de
  arquivo, não confiando no header do request).
- **CAPTCHA**: o usuário pediu "somente quando necessário" — proposta: nenhum CAPTCHA na navegação do
  catálogo (sem custo de fricção), só no envio final da solicitação, e só se um rate-limit básico não
  for suficiente sozinho (a decidir depois de ver volume real).
- **Idempotência**: gerar a solicitação com uma chave de idempotência client-side (ex.: um UUID gerado
  no primeiro carregamento da página de revisão, reenviado em cada tentativa de submit) evita
  duplicidade por duplo-clique ou reload.
- **Validação de CPF**: não existe hoje (só CNPJ) — precisa de um validador de dígito verificador novo,
  mas isso é uma função pura, sem dependência externa.
- **Nenhuma exposição de dado interno**: a rota pública de catálogo nunca deve devolver `costPrice`,
  `stockQty`/estoque reservado, BOM, ou qualquer campo de Produto que não seja explicitamente
  "voltado pro catálogo" — precisa de uma função de serialização com allowlist explícita de campos
  (mesmo princípio já usado no `toPublicView()` do ADR-025 para Orçamento).

## PARTE 9 — Estratégia de anexos

Reaproveita o model `Attachment` genérico (`module: "catalog_requests"`, `entityId: CatalogRequest.id`)
e o `storageService` existente — sem model novo. Adições específicas da rota pública: limite de
tamanho (ex.: 10MB por arquivo, 5 arquivos por solicitação — a definir), allowlist de MIME (imagem e
PDF, nada executável), e os arquivos ficam sob o mesmo `STORAGE_PATH` já usado por todo o resto do
sistema, fisicamente fora do `.next` (sobrevive a rebuild, mesmo padrão já validado em produção).

## PARTE 10 — Estratégia de clientes existentes e leads

**Achado importante**: `Quote.clientId` já é opcional, e o Orçamento já grava os dados do cliente
desnormalizados nele mesmo (`clientName`/`clientCnpj`/etc.) independente de existir um `Client`
formal — esse é o comportamento **já em produção hoje** para qualquer Orçamento criado sem selecionar
um Cliente cadastrado. Proposta: **não criar model `Lead` nem flag "provisório" em `Client`** —
reaproveitar exatamente esse comportamento já existente:

- Checagem por CPF/CNPJ/e-mail contra `Client` existente. Se bater, vincula `clientId` (tanto no
  `CatalogRequest` quanto no `Quote` gerado) e usa o cadastro real.
- Se não bater, `clientId` fica `null` nos dois, e os dados que o cliente digitou (nome, CPF/CNPJ,
  contato, e-mail, telefone, cidade/estado, empresa) ficam só nos campos desnormalizados do
  `CatalogRequest`/`Quote` — nenhum `Client` é criado. A equipe decide manualmente, durante a triagem,
  se cria um Cliente formal (ação já existente — editar o Orçamento e vincular um Cliente).
- Isso evita 100% do risco de "cliente definitivo com dado incompleto/não validado" que o usuário
  pediu para evitar, sem precisar de nenhum conceito novo no schema.

## PARTE 11 — Plano de implementação incremental (aprovado 2026-07-29, pronto para início da Fase 1)

1. **Fase 1 — Schema**: campos novos em `Product` (controle de exibição), `Quote` (`origin`,
   `catalogRequestId`, `internalStage`), models `CatalogRequest`/`CatalogRequestItem`. `prisma db push`
   em test e produção, com aprovação explícita separada antes de rodar (mesmo protocolo do ADR-025) —
   sem lógica nova nesta fase, só schema.
2. **Fase 2 — Catálogo público, só leitura**: `catalogPublicService` + rotas
   `GET /api/public/catalog`/`GET /api/public/catalog/[productId]` + página `/catalogo` com listagem,
   busca, filtro por categoria, ordenação, destaque, ficha de produto — todos os produtos aparecem como
   "sob consulta" (decisão da Parte 16, pergunta 4: nenhum preço visível na v1). SEM cesta/submissão
   ainda — valida a apresentação visual e a serialização pública (allowlist de campos) antes de
   qualquer captura de dado do cliente.
3. **Fase 3 — Cesta + identificação + submissão**: cesta com personalização dinâmica por produto,
   formulário de identificação **só na revisão final** (decisão da Parte 16, pergunta 1), tela de
   revisão, submissão idempotente (chave client-side) → cria `CatalogRequest` + `Quote` automático
   (`origin: catalogo_digital`, `internalStage: aguardando_triagem`) + protocolo.
4. **Fase 4 — Tela interna de triagem**: módulo RBAC novo (`catalogo`), fila de solicitações
   (`DataTable`, mesmo padrão de todo módulo existente), filtro por `internalStage` (decisão da Parte
   16, pergunta 2), vínculo direto com a tela de Orçamento existente (sem duplicar edição).
5. **Fase 5 — Segurança de produção**: rate limiting real via `rate-limiter-flexible`
   (`RateLimiterMemory` — sem Redis, adequado a uma instância única PM2/SQLite; decisão da Parte 16,
   pergunta 3: dependência nova aprovada), allowlist de upload (tipo/tamanho), validação de dígito
   verificador de CPF (não existe hoje, só CNPJ), CAPTCHA condicional só no envio final se o rate
   limit sozinho não bastar.
6. **Fase 6 — Refinamentos**: o que mais se mostrar necessário depois do uso real (ex.: estrutura de
   opções pré-cadastradas por produto em vez de texto livre para acessórios/modificações — v1 usa
   texto livre simples, decisão de menor impacto, revisitável sem mudança de schema disruptiva).

Cada fase segue a mesma disciplina já usada nas iniciativas anteriores (tsc → lint → testes → build →
atualizar ADR → graphify → commit → aguardar confirmação → push), e nenhuma fase avança sem a anterior
verificada. Nenhuma linha de código será escrita até confirmação explícita para iniciar a Fase 1.

## PARTE 12 — Testes necessários

Unitários/integração por fase: cálculo de exibição do catálogo (produtos `showInCatalog=false` nunca
aparecem, mesmo com URL direta ao id), serialização pública nunca vaza campo interno, dedupe de
cliente por CPF/CNPJ/e-mail (com e sem match), criação automática do Orçamento com os itens corretos,
idempotência de submissão (2 envios com a mesma chave não duplicam), rate limiting básico, allowlist de
upload rejeitando tipo/tamanho inválido, isolamento total entre solicitação arquivada e o Orçamento já
gerado (arquivar a solicitação não deve alterar o Orçamento).

## PARTE 13 — Critérios de aceite (propostos)

- Um Produto só aparece no catálogo se `showInCatalog = true`, mesmo com o id do produto na URL direta.
- Nenhum campo interno (custo, estoque, BOM, margem) é exposto em nenhuma resposta da API pública.
- Uma solicitação enviada sempre gera exatamente 1 `CatalogRequest` + 1 `Quote`, nunca duplicados
  por reenvio/reload.
- O Orçamento gerado nunca nasce aprovado, precificado ou convertido em Pedido.
- A checagem de cliente existente nunca é distinguível externamente (mesma resposta, mesmo tempo de
  resposta dentro de margem razoável) entre "achou" e "não achou".
- Toda a segurança da Parte 8 tem teste automatizado cobrindo o caso de falha.

## PARTE 14 — Riscos de acoplamento identificados

- A tela de triagem **não deve** duplicar a UI/lógica de edição de Orçamento — deve linkar pra tela de
  Orçamentos existente, só adicionando o contexto específico da solicitação (personalizações, anexos,
  protocolo) como um painel extra, não uma segunda tela de edição de Orçamento.
- A serialização pública do catálogo precisa ser mantida junto (não duplicada) sempre que `Product`
  ganhar campo novo no futuro — mesmo princípio de allowlist explícita já em uso no ADR-025.
- O módulo RBAC novo (`catalogo`) para a tela de triagem não deve virar uma segunda fonte de verdade
  sobre quem pode editar Orçamento — só controla acesso à FILA de triagem; editar o Orçamento em si
  continua gated por `orcamentos`/`update` como hoje.

## PARTE 15 — Evoluções futuras (arquitetura não deve impedir)

`CatalogRequest.sourceLink` já reservado (vazio na v1) pra futuramente distinguir link por
vendedor/campanha/cliente. `catalogPriceMode`/`showInCatalog` por produto já permite catálogos
personalizados por cliente no futuro (ex.: tabela de preço específica) sem mudança estrutural.
Aceite digital do orçamento e conversão em Pedido já existem via ADR-023/ADR-025 — o catálogo só
alimenta a entrada, não precisa reinventar nada dali pra frente. Kits/ambientes completos e
recomendação de produtos relacionados ficam fora de escopo da v1, mas nenhuma decisão desta fase
impede isso (são camadas de apresentação sobre o mesmo catálogo de Produto).

## PARTE 16 — Decisões (resolvidas pelo usuário em 2026-07-29)

1. **Identificação do cliente**: ✅ só ao finalizar a cesta, não antes de navegar.
2. **Máquina de estados** (Parte 7): ✅ aprovado o sub-status informativo `Quote.internalStage`
   (sem validação de transição), cobrindo "em análise técnica"/"aguardando cliente"/"em elaboração".
3. **Rate limiting**: ✅ aprovada a adição de uma dependência nova — `rate-limiter-flexible`
   (`RateLimiterMemory`, sem Redis, adequado à instância única PM2/SQLite deste projeto).
4. **Acessórios/modificações da cesta**: v1 usa texto livre simples (menor impacto, decisão reversível
   sem quebra de schema — não bloqueado explicitamente, seguindo o padrão de menor escopo por padrão).
5. **Preço no catálogo**: ✅ todos os produtos começam como "sob consulta" na v1 — campo
   `catalogPriceMode` já fica pronto para "exibir"/"faixa" no futuro, mas nenhum produto mostra preço
   até decisão caso a caso posterior.

## Verificação (Fase 1)

Campos novos em `Product` (6 campos de controle de exibição + índice `showInCatalog`), `Quote`
(`origin`, `internalStage`, índice `origin`) e `Client` (relação inversa `catalogRequests`); 2 models
novos (`CatalogRequest`, `CatalogRequestItem`) — tudo aditivo, sem alteração de campo existente.
Confirmado que `Product` usa soft-delete (`active: false`, nunca remove a linha), então a nova FK
`CatalogRequestItem.productId` não introduz nenhum risco de violação de integridade referencial —
nenhum guard de exclusão precisou ser adicionado. `prisma db push` aplicado em `test.db` e produção
(`data/cozisteel.db`). tsc limpo, lint 57 problemas (mesma contagem, 0 novos), 421/421 testes (nenhum
teste novo nesta fase — só schema, sem lógica), build limpo, PM2 reconstruído e reiniciado. Nenhuma
rota, serviço ou UI nova ainda — só a fundação de dados para a Fase 2.

## Verificação (Fase 2)

`catalogPublicService` (allowlist explícita de campos, nunca `costPrice`/estoque/BOM; `price` só
exposto quando `catalogPriceMode = "exibir"`) + `product.repository.ts` (`findManyPublicCatalog`,
`findPublicDetailById`, `findCatalogCategories`, `isPubliclyVisible`). 3 rotas públicas novas
(`GET /api/public/catalog`, `GET /api/public/catalog/[productId]`, `GET /api/public/catalog/categories`)
+ 1 rota de imagem pública (`GET /api/public/uploads/[...path]`, irmã da rota autenticada existente —
só serve imagem de produto com `showInCatalog=true`, checado antes de ler o arquivo mesmo com o path
exato). 2 páginas públicas (`/catalogo`, `/catalogo/[productId]`), fora do SPA autenticado, mesmo
princípio do `/orcamento/[token]` (ADR-025).

**Lacuna encontrada e fechada nesta mesma fase**: não havia nenhuma forma de um colaborador marcar um
Produto para aparecer no catálogo — sem isso, a Fase 2 nunca teria nenhum produto pra mostrar.
Adicionados os 6 campos novos ao formulário de Produtos (`produto-form-fields.tsx`: switches "Exibir
no catálogo"/"Em destaque"/"Permitir personalização", ordem de exibição, modo de preço, descrição
comercial) + `createProductSchema`/`product.service.ts::create()` atualizados (o `update()` já
aceitava os campos novos de graça, por ser um passthrough genérico que só exclui campos de relação).

Verificação: tsc limpo, lint 58 problemas (+1, mesmo padrão de fetch-em-efeito já aceito em toda a
iniciativa — `catalogo/page.tsx`), 429/429 testes (8 novos em `tests/catalog-public.test.ts`: filtro
`showInCatalog`/`active`, busca, categoria, ordenação por destaque, 404 pra produto oculto/inativo/
inexistente, gating de preço por `catalogPriceMode`, ausência de campo interno na serialização
pública, categorias vazias excluídas). Build limpo, com as 4 rotas públicas + as 2 páginas registradas
corretamente. PM2 reconstruído e reiniciado, testado ao vivo (`/catalogo` responde 200, API devolve
lista vazia — correto, nenhum produto foi habilitado pro catálogo em produção ainda).

## Verificação (Fase 3)

Campo novo `CatalogRequest.idempotencyKey` (único, aditivo). `catalogRequestService.submit()`:
valida produtos contra o catálogo público de verdade (nunca confia em `productId` vindo de fora),
dedupe de cliente por CPF/CNPJ (`clientRepository.findByCpfCnpj`, mesmo formato mascarado já usado
internamente via `maskCpfCnpj`) ou e-mail — sem nunca revelar match/no-match na resposta pública —,
cria `CatalogRequest`+`CatalogRequestItem[]` e o Orçamento (`origin: catalogo_digital`,
`internalStage: aguardando_triagem`, sempre `draft`) na mesma transação (`db.$transaction`, mesmo
padrão já usado em `invoice.service.ts`/`shipment.service.ts`), com personalização condensada em
`QuoteItem.notes` por item (não por produto — o mesmo produto pode aparecer 2x no carrinho com
personalizações diferentes, tratado corretamente via um array pré-computado que preserva a ordem do
carrinho, sem reparear por `productId` depois de ir ao banco).

**Achado durante a implementação, não previsto no levantamento**: `Quote.userId` é campo obrigatório
(nunca opcional), mas uma solicitação pública não tem nenhum usuário interno associado. Resolvido com
um usuário de sistema (`username: "catalogo-digital"`, `active: false` — bloqueia login
estruturalmente, mesma checagem de `src/lib/auth.ts`), criado sob demanda na primeira submissão
(mesmo padrão lazy-create já usado por `numberingService.getNextNumber()`).

Idempotência via chave gerada uma vez por carregamento da página `/catalogo/carrinho`
(`crypto.randomUUID()`), reenviada em qualquer nova tentativa de submit — reenvio da mesma chave
devolve o protocolo já emitido, nunca duplica `CatalogRequest`/Orçamento.

UI: cesta em `localStorage` (`useCatalogCart`, hook novo) — só vira dado real no servidor no momento
da submissão, navegar/fechar a aba antes disso não deixa rastro nenhum. Diálogo de personalização na
ficha do produto (campos de dimensão/material/acabamento só aparecem se `catalogAllowCustomization`).
Página `/catalogo/carrinho`: lista da cesta (quantidade editável, remover item) + identificação do
cliente **só aqui**, na revisão final (decisão da Parte 16) + checkbox de consentimento (obrigatório
pra habilitar o envio) + aviso explícito de que a solicitação não representa preço/pedido/prazo
confirmado + botão "Enviar solicitação de orçamento" (nunca "Finalizar compra").

Verificação: tsc limpo, lint 58 problemas (mesma contagem de antes desta fase — o novo hook de cesta
usa init tardio de estado em vez de `useEffect`, evitando o warning que teria gerado; a nova página do
carrinho compensou com 1 warning do mesmo padrão de fetch-em-efeito já aceito, líquido zero). 437/437
testes (8 novos em `tests/catalog-request.test.ts`: criação vinculada Orçamento↔CatalogRequest, rejeição
de produto oculto/inexistente, dedupe por CNPJ, dedupe por e-mail, ausência de match, idempotência,
produto repetido no carrinho com personalizações distintas, usuário de sistema correto). Build limpo
com `/api/public/catalog-requests` e `/catalogo/carrinho` registrados. PM2 reconstruído e reiniciado,
testado ao vivo.

## Verificação (Fase 4)

Módulo RBAC novo `catalogo` (todos os 9 papéis atualizados; admin/manager/comercial com CRUD+export,
os demais sem acesso — mesmo critério já usado pra `orcamentos`, já que a triagem é uma extensão
comercial). Nova entrada de menu "Catálogo Digital" no grupo COMERCIAL.

`catalogRequestService` ganhou `list()`/`getById()`/`archive()`/`listAssignableUsers()` + 4 rotas
autenticadas (`GET /api/catalog-requests`, `GET /api/catalog-requests/[id]`,
`PATCH /api/catalog-requests/[id]/archive`, `GET /api/catalog-requests/assignable-users`). `archive()`
nunca altera o Orçamento vinculado (Parte 14) — só marca o registro de intake.

**Achado durante a implementação, corrigido antes de virar bug em produção**: a intenção original era
adicionar `userId`/`internalStage` a `ALLOWED_UPDATE_FIELDS` de `quoteService.update()` pra permitir
reatribuir responsável/etapa pela tela de triagem. Descoberto ao escrever o teste que `update()`
**sempre substitui todos os itens do Orçamento** (usa `body.items || []` — decisão de design do
método existente, correta pro caso de uso original de edição completa via formulário, mas perigosa
pra um patch parcial). Reatribuir responsável chamando `update()` sem passar `items` teria apagado
todos os itens do Orçamento. Corrigido com um método dedicado,
`quoteService.reassignAndStage(id, {userId?, internalStage?}, actingUserId)`, que reaproveita
`quoteRepository.updateStatus()` (o mesmo primitivo de update parcial já usado por `changeStatus()`,
que nunca toca em itens) — nova rota `PATCH /api/quotes/[id]/triagem`, dedicada, em vez de reusar
`PATCH /api/quotes/[id]`.

Tela "Solicitações do Catálogo" (`catalogo-requests-page.tsx`): lista com filtro por status
(todas/convertidas/arquivadas), detalhe em painel lateral (dados do lead, itens com personalização
completa, indicação de item personalizado), seletor de responsável + etapa de triagem (as 5 opções
do `internalStage`, Parte 7), botão "Abrir Orçamento" que navega pro módulo Orçamentos de verdade via
`initialDetailId` (mesmo mecanismo já usado por Requisições/Pedidos — sem duplicar tela de edição),
e arquivamento com motivo opcional.

Novo domínio no sistema central de cores de status (`status-tokens.ts`, ADR-015) —
`catalogRequest: {recebida, em_triagem, convertida, arquivada}` — deliberadamente separado do domínio
`quote`, já que são máquinas de status distintas por design (Parte 7).

Verificação: tsc limpo, lint 59 problemas (+1, mesmo padrão de fetch-em-efeito já aceito). 441/441
testes (4 novos: `list()` filtra por status e devolve o Orçamento vinculado, `getById()` com itens
completos + 404 pra id inexistente, `archive()` nunca altera o Orçamento vinculado,
`reassignAndStage()` reatribui responsável/etapa sem apagar itens — o teste que expôs o problema do
`update()`). Build limpo com `/api/catalog-requests` (+ `[id]`, `/archive`, `/assignable-users`) e
`/api/quotes/[id]/triagem` registrados. PM2 reconstruído e reiniciado.

## Verificação (Fase 5)

**Anexos**: decisão do usuário — adiado pra uma fase futura. A Fase 3 nunca implementou upload de
arquivo pro carrinho (só campos de texto), então "allowlist de upload" não tinha nada pra proteger
ainda; registrado aqui como pendência explícita, não como lacuna silenciosa.

**Rate limiting** (primeira vez que existe em qualquer rota deste projeto — nem o link do ADR-025
tinha): nova dependência `rate-limiter-flexible` (`RateLimiterMemory`, sem Redis — decisão do usuário,
adequada à instância única PM2/SQLite). Helper `src/lib/rate-limit.ts`, chaveado por IP
(`x-forwarded-for`), lança `TooManyRequestsException` (429, classe nova em `exceptions/index.ts`).
Aplicado em: `GET /api/public/catalog`/`[productId]`/`categories` (60/60s — navegação), 
`GET /api/public/uploads/[...path]` (120/60s — mais generoso, uma ficha de produto carrega várias
imagens de uma vez), `POST /api/public/catalog-requests` (5/60s — cria registro real, mais restrito).
**Também fechado retroativamente**: os 2 endpoints públicos do ADR-025
(`GET`/`POST /api/public/quotes/[token]`, 30/60s e 5/60s) — era o único gap de segurança documentado
e não resolvido naquele ADR, agora reaproveita o mesmo mecanismo.

**Validação de CPF/CNPJ**: achado durante a implementação — `isValidCpf`/`isValidCnpj`/
`isValidCpfCnpj` **já existiam** em `src/lib/masks.ts` (de trabalho anterior desta mesma sessão,
branch `cep-cnpj-lookup`), mas eram usados só no frontend (`cnpj-input.tsx`), nunca validados
server-side em lugar nenhum do sistema. `submitCatalogRequestSchema.clientCpfCnpj` agora usa
`isValidCpfCnpj` via `.refine()` — campo vazio continua válido (identificação sem documento é
permitida), só rejeita dígito verificador incorreto.

**CAPTCHA**: deliberadamente **não implementado** — decisão original (Parte 8) já era condicional
("só se o rate limit sozinho não bastar"). Sem evidência de abuso real ainda, adicionar CAPTCHA
agora seria fricção especulativa. Registrado como decisão consciente, não como pendência esquecida —
revisitar se o rate limiting (Fase 5) se mostrar insuficiente em uso real.

Verificação: tsc limpo, lint 59 problemas (mesma contagem, 0 novos — mudanças desta fase são todas
backend, sem componente novo). 446/446 testes (5 novos em `tests/catalog-fase5-security.test.ts`:
rate limit bloqueia a Nª+1 requisição, isola por IP, aceita CPF/CNPJ com dígito válido, rejeita dígito
inválido, aceita campo vazio). Build limpo, PM2 reconstruído e reiniciado, testado ao vivo.

## Addendum — redesign visual (2026-07-28, via Codex CLI)

Usuário avaliou as 3 páginas públicas ao vivo e achou o visual "seco" demais pra uma vitrine
comercial. Redesign feito com `codex exec` (Codex CLI, já configurado no projeto) nas 3 páginas —
`catalogo/page.tsx` (hero comercial, cards de produto mais ricos, skeletons melhores, estado vazio
acolhedor), `catalogo/[productId]/page.tsx` (galeria maior, especificações em destaque, CTA mais
forte), `catalogo/carrinho/page.tsx` (fluxo de revisão reorganizado, resumo lateral fixo). Prompt
explicitamente restringiu Codex a: não mudar nenhuma chamada de API/payload, não mudar lógica de
estado, reaproveitar componentes shadcn/ui já existentes, não tocar em nenhum arquivo fora das 3
páginas. Revisão própria confirmou: `git diff --stat` só nas 3 páginas esperadas, toda lógica
(fetch/useState/useEffect/useCatalogCart) idêntica à anterior, só JSX/CSS mudou.

Verificação: tsc limpo, lint 59 problemas (mesma contagem, 0 novos), 446/446 testes (nenhum teste
quebrou — confirma que o contrato de API e o comportamento não mudaram), build limpo, PM2
reconstruído e reiniciado, testado ao vivo.

## Addendum — responsividade mobile e fechamento (2026-07-29)

Revisão manual das 3 páginas em busca de grids fixos sem quebra pra tela pequena (não achou nenhuma
ferramenta de screenshot mobile disponível no ambiente — análise feita lendo as classes Tailwind
diretamente). 2 pontos reais de aperto encontrados e corrigidos:

- `catalogo/[productId]/page.tsx`: galeria de miniaturas (`grid-cols-5` fixo) → `grid-cols-3
  sm:grid-cols-5` — 5 colunas em ~340px de largura de tela deixava cada miniatura com ~59px.
- Diálogo "Adicionar à cesta" (mesma página): os 3 grids de personalização (`grid-cols-3` pra
  largura/altura/comprimento, `grid-cols-2` pra material/acabamento e voltagem/lado) não tinham
  nenhuma quebra — em ~279px de largura útil do diálogo (largura do Dialog padrão do shadcn menos
  padding), 3 colunas deixavam ~85px por campo, cabendo mal o rótulo "Comprimento (cm)". Todos os 3
  grids agora usam `grid-cols-N sm:grid-cols-M` (2→3, 1→2, 1→2), com o campo "Comprimento" ocupando
  a linha inteira em telas bem pequenas (`col-span-2 sm:col-span-1`).

O resto das 3 páginas já usava o padrão mobile-first correto (`grid-cols-1 sm:...`) desde o redesign
via Codex — não precisou de mudança.

**Decisão do usuário: este é o Catálogo Digital Público definitivo.** Fase 6 (refinamentos) e
qualquer evolução futura (Parte 15) ficam em espera, sem trabalho programado — só entram se
houver pedido explícito.

### O que fica pendente/fora de escopo, por decisão explícita (não é lacuna esquecida)

- **Anexos** (desenhos/fotos de referência no carrinho) — usuário decidiu adiar na Fase 5; nunca
  implementado, `Attachment` genérico já existe pronto pra reaproveitar quando for pedido.
- **CAPTCHA** — decisão original já era condicional ("só se o rate limit não bastar"); sem
  evidência de abuso real, não implementado.
- **Links por vendedor/campanha/cliente** — só existe 1 link único (`/catalogo`) pra todo mundo;
  `CatalogRequest.sourceLink` já reservado no schema pra isso, sem código ainda.
- **Preço visível por produto** — todo produto começa em "sob consulta"; o campo
  `catalogPriceMode` já suporta "exibir"/"faixa", só precisa ser ligado produto a produto pelo
  colaborador quando fizer sentido (não é um bug, é a configuração padrão escolhida).
- **Analytics de catálogo** (visualizações, produtos mais vistos, taxa de conversão) — não
  implementado, mencionado só como evolução futura possível na Parte 15.
- **Rate limiting em memória** — `RateLimiterMemory` não sobrevive a um restart do PM2 nem escala
  pra múltiplas instâncias; decisão consciente do usuário (Parte 16), adequada ao deploy atual
  (instância única).

Verificação (mobile): tsc limpo, lint 59 problemas (mesma contagem, 0 novos), 446/446 testes, build
limpo, PM2 reconstruído e reiniciado.
