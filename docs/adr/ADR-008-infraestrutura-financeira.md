# ADR-008 — Infraestrutura Financeira (Fase 5.9)

- **Status**: **Decisão consolidada** — estratégia híbrida aprovada. Nenhum código, nenhuma migração de
  schema nesta fase; implementação de cada campo fica condicionada aos gatilhos descritos em "Decisão
  Consolidada" abaixo.
- **Data**: 2026-07-09
- **Depende de**: nenhuma fase anterior tecnicamente — é puramente preparatória. Existe para proteger a
  futura **Fase 12 — Financeiro Integrado** (ver roadmap, memória do projeto) contra retrabalho.
- **Escopo explicitamente fora desta fase** (por instrução do usuário): nenhuma regra de negócio
  financeira, nenhum módulo Financeiro, nenhuma Conta a Pagar/Receber, nenhum lançamento financeiro,
  nenhuma alteração de fluxo atual. Esta fase é 100% estrutural — só schema, Repository e DTO,
  aceitando valores nulos em todo lugar.

## Contexto

O roadmap de 12 fases já previa, desde o planejamento original (antes da Fase 1), que alguns campos
fossem "preparados oportunisticamente" para o Financeiro: `costCenterId`, `originDocumentType`/
`originDocumentId`, `projectId`, `financialReferenceId`. Isso nunca foi feito — nenhuma fase até aqui
tocou nesses campos. Antes de iniciar a Fase 6 (MRP), o usuário pediu uma rodada de levantamento
específica para decidir isso conscientemente, em vez de deixar acumular até a Fase 12.

## Levantamento — o que existe hoje

**Nenhum dos 5 campos previstos existe em lugar nenhum do schema.** Confirmado por varredura completa de
`prisma/schema.prisma`: nenhuma ocorrência de `costCenterId`, `projectId`, `financialReferenceId`,
`originDocumentType` ou `originDocumentId` em nenhum model.

**Não existe model `CostCenter`.** Previsto desde o planejamento da Fase 1 ("introduz `CostCenter` cedo,
por ser barato e de baixo risco"), nunca criado.

**A rastreabilidade de origem hoje é feita por FK específica, não por par genérico** — e é mais forte do
que o par genérico proposto:

| Documento | Como registra a origem hoje |
|---|---|
| `SalesOrder` | `quoteId` (FK real, `@unique`, 1 Orçamento → no máximo 1 Pedido de Venda) |
| `ProductionOrder` | `salesOrderId` (FK real, opcional — OP pode não vir de venda) + `bomRevisionId` (Fase 5) |
| `Requisition` | `originModule` (string: `"manual"` / `"production_order"`) + `productionOrderId` (FK real, opcional) — já é, na prática, o padrão "tipo + FK", só não generalizado |
| `PurchaseOrder` | `requisitionId` (FK real, obrigatória) |
| `StockMovement` | `referenceType` (string livre: `"requisition"`, `"production_order"`, `"purchase_order"`, `"manual"`) + `referenceId` (string, sem FK rígida) — **este é exatamente o padrão genérico que o roadmap pede para os outros documentos**, só que já implementado aqui desde a Fase 1 |

Ou seja: **2 dos 5 campos pedidos (`originDocumentType`/`originDocumentId`) já têm um equivalente
funcional em quase todo documento** — via FK real (mais forte, com integridade referencial) ou via
`referenceType`/`referenceId` (idêntico ao padrão pedido, já em produção no Estoque). Adicionar o par
genérico de novo em cima disso duplicaria informação que o Princípio 5 do ADR-001 (Fonte Única da
Verdade) proíbe.

**Nenhum documento tem dimensão de centro de custo ou projeto hoje.** `costCenterId` e `projectId` são,
de fato, informação nova — não existe hoje nenhum campo equivalente em nenhum lugar.

**`financialReferenceId` também é genuinamente novo** — não há hoje nenhum ponteiro de um documento
operacional para "o registro financeiro que ele gerou", porque esse registro (Contas a Pagar/Receber)
ainda não existe.

## Impacto por campo proposto

### `originDocumentType` / `originDocumentId` — **CANCELADO DEFINITIVAMENTE (2026-07-09)**
**Decisão do usuário**: requisito considerado atendido por evolução arquitetural posterior — não será
implementado, em nenhuma entidade, em nenhuma fase futura, nem mesmo em novas entidades do Financeiro
(Fase 12). A evolução do sistema ao longo desta iniciativa (FKs reais entre todos os documentos de
negócio + o par `referenceType`/`referenceId` já em produção em `StockMovement` desde a Fase 1) tornou
esse par genérico redundante por completo. Qualquer entidade nova que precisar referenciar um documento
de origem — inclusive as futuras `ContaPagar`/`ContaReceber` da Fase 12 — deve reaproveitar o padrão já
estabelecido de `StockMovement` (`referenceType`/`referenceId`) em vez de reintroduzir um par com nome
diferente para o mesmo propósito. Este item está encerrado; não deve ser reaberto sem uma razão nova e
concreta que não existia nesta análise.

### `costCenterId` — **infraestrutura oportunista (2026-07-09)**
**Decisão do usuário**: não implementar agora. Registrado como infraestrutura oportunista, condicionada a
DOIS gatilhos, ambos necessários (não implementar por causa de só um deles): (1) existir um domínio real
de Centro de Custos no Cozisteel — hoje não existe nenhum, `CostCenter` é só uma proposta de nome, sem
nenhuma regra de negócio validada por trás; e (2) uma fase que já vá naturalmente alterar a entidade em
questão (Fase 7 para `Requisition`, Fase 8 para `PurchaseOrder`/`ProductionOrder`) — nunca uma migração
isolada só para "preparar terreno". Sem consumidor real, o campo não é criado, mesmo que o gatilho (2)
apareça primeiro. Exige criar o model `CostCenter` primeiro (não existe). Candidatos a receber o campo,
por ordem de relevância, quando os dois gatilhos se confirmarem:
- **`ProductionOrder`** — forte candidato: Fase 12 já prevê "Ordens de Produção → custo real →
  Financeiro"; sem centro de custo desde a origem, toda produção histórica caída fora da atribuição.
- **`Requisition`** — forte candidato, e com sinergia direta com a **Fase 7** (Requisição corporativa):
  o campo `Tipo` que a Fase 7 vai introduzir (Produção/TI/Manutenção/RH/...) é, na prática, a mesma
  dimensão de centro de custo — as duas mudanças de schema tocam a mesma tabela ao mesmo tempo.
- **`PurchaseOrder`** — forte candidato, com sinergia direta com a **Fase 8** (Aprovação de Compras):
  centro de custo costuma ser justamente o dado que decide QUEM aprova uma compra.
- **`SalesOrder`** — candidato mais fraco: normalmente é centro de **receita**, não de custo; pode
  esperar a Fase 12 definir se faz sentido.
- **`Quote`** — não recomendado: orçamento é negociação, nenhum custo é incorrido ainda (Princípio 4:
  responsabilidade única — orçamento não deveria carregar uma dimensão de custeio).

### `projectId` — **adiado (2026-07-09)**
**Decisão do usuário**: adiado, sem nenhuma janela de implementação prevista ainda. Não existe hoje domínio
de Projetos no Cozisteel (nenhum model `Project`) nem nenhum consumidor previsto em nenhuma fase do
roadmap detalhado (Fases 7-11). Registrado formalmente como **requisito futuro condicionado ao
surgimento desse domínio** — só volta a ser avaliado se/quando "Projeto" passar a ser uma entidade real
do sistema (dentro ou fora da Fase 12); até lá, nem o campo nem nenhum model de suporte são criados.

### `financialReferenceId` — **aprovado como identificador opaco (2026-07-09)**
**Decisão do usuário**: aprovada a abordagem proposta, com uma restrição explícita registrada aqui para
não ser reinterpretada no futuro: este campo é um **identificador opaco** (`String?`, sem FK, sem
constraint de integridade referencial, sem regra de negócio própria) — não representa nem nunca deve
passar a representar um relacionamento formal com outra tabela. Quando a entidade que o carrega
(`SalesOrder`/`ProductionOrder`/`PurchaseOrder`) for naturalmente alterada por uma fase futura (a mesma
lógica de gatilho de `costCenterId`), o campo pode ser introduzido como um simples ponteiro de texto para
o que quer que a Fase 12 vier a criar como registro financeiro daquele documento — sem FK, exatamente como
`StockMovement.referenceId` já funciona hoje. Nenhuma fase futura deve promovê-lo para uma relação Prisma
tipada sem uma decisão arquitetural explícita e nova, separada desta.

## Impacto sobre Services, DTOs e Repositories

Se a Opção A for escolhida, cada campo novo em cada entidade exige, no mínimo:
- **Schema**: coluna nova, sempre opcional (`String?`), sem default diferente de `null`.
- **DTO** (`src/app/dto/index.ts`): campo `.optional()`/`.nullable()` adicionado ao schema Zod de
  create/update daquela entidade (5 schemas tocados, na pior hipótese: Quote, SalesOrder,
  ProductionOrder, Requisition, PurchaseOrder).
- **Repository**: nenhuma mudança de lógica — os métodos `create`/`update` genéricos (`BaseRepository`)
  já repassam qualquer campo presente no objeto de dados; só passa a existir mais um campo possível no
  payload.
- **Service**: nenhuma mudança de regra — os Services de cada entidade só precisam aceitar o campo no
  `body` e repassá-lo (mesmo padrão de qualquer campo opcional hoje, ex: `notes`).
- **`CostCenter` (se criado)**: um Repository novo simples (CRUD, sem regra de negócio) e uma rota
  administrativa básica (padrão idêntico a `Category`/`OperationType`), já que alguém precisa cadastrar
  centros de custo antes de referenciá-los.

Nenhum desses campos, em nenhuma hipótese desta fase, é usado para validar, calcular ou bloquear nada —
todos aceitos e devolvidos como estão, sem leitura própria em nenhuma regra.

## Campos que permanecem opcionais

**Todos os 4 campos, em toda entidade, para sempre nesta fase** — `costCenterId`, `projectId`,
`financialReferenceId` e (se algum dia adotado) `originDocumentType`/`originDocumentId` nunca são
obrigatórios aqui. A Fase 12 é quem decide, com as regras de negócio reais em mãos, se algum deles precisa
virar obrigatório em algum fluxo específico — decisão que esta fase não antecipa.

## Migrations necessárias (se Opção A)

Aditivas em SQLite (`ALTER TABLE ... ADD COLUMN`, sempre `NULL` por padrão) — sem risco a dado existente:
- Novo model `CostCenter` (só se decidido implementar agora).
- `ProductionOrder.costCenterId`, `ProductionOrder.financialReferenceId` (opcionais).
- `Requisition.costCenterId` (opcional).
- `PurchaseOrder.costCenterId`, `PurchaseOrder.financialReferenceId` (opcionais).
- `SalesOrder.financialReferenceId` (opcional) — `costCenterId` fica de fora por ora (candidato mais
  fraco, seção acima).
- `prisma db push` em dev (`data/cozisteel.db`) e teste (`prisma/test.db`), como em toda fase anterior.

## Impacto sobre eventos de domínio já existentes

Nenhum. Os payloads de evento (`OrdemProducaoCriadaPayload`, etc.) não precisam ganhar esses campos agora
— nenhum handler registrado hoje (`register-domain-event-handlers.ts`) consumiria essa informação, e
interfaces de payload já são aditivas por natureza (Fase 3/3.1): adicionar um campo opcional a um payload,
quando um consumidor real precisar dele, não quebra nenhum handler existente. Adicionar agora seria
especular sem consumidor, o que a disciplina deste projeto já evita (ex: `bomRevisionId` só entrou no
payload de OP quando a Fase 5 realmente precisou).

## Impacto sobre Graphify e ADRs

- `graphify update .` necessário após qualquer mudança de schema desta fase (novo model `CostCenter`,
  novos campos/relações) — mesma disciplina de sempre.
- Este ADR-008 passa a ser a referência específica da Fase 5.9, citado pela Fase 12 quando ela existir.
- ADR-001 recebe uma entrada no log de decisões e uma nova seção de auditoria de débito estrutural (ver
  abaixo) — os 4 campos daqui são só um dos itens encontrados nessa auditoria mais ampla.

## Opção A — Implementar agora (schema + repositories + DTOs), antes do MRP

**Vantagens**
- Nenhuma migração futura precisa "voltar" a essas 5 tabelas para adicionar essas colunas.
- Documentos criados a partir de agora (incluindo os que o próprio MRP futuramente originar) já nascem
  com o campo disponível, mesmo que nulo.
- Sustenta ao pé da letra a diretriz de "arquitetura de longo prazo antes de conveniência de curto prazo"
  já registrada neste projeto.

**Desvantagens**
- `CostCenter` é o único campo desta lista sem forma nenhuma ainda validada por um caso de uso real — o
  próximo contato genuíno com essa dimensão só vem na Fase 7 (Requisição) e Fase 8 (Pedido de Compra),
  ainda 2-3 fases à frente. Existe risco real de o formato certo (hierarquia? centro único por
  documento? por item?) só ficar claro quando essas fases chegarem — implementhá agora pode significar
  alterar de novo depois, o exato retrabalho que esta fase existe para evitar.
- Acrescenta 4-5 campos "mortos" (aceitos, nunca lidos) espalhados por 5 Services/DTOs por 6+ fases
  seguintes (Fases 6 a 11) antes de qualquer coisa realmente os usar — ruído de manutenção em todo Service
  tocado nesse meio-tempo, sem benefício funcional imediato.
- Especulação além do necessário: os únicos dois campos com forma 100% seguro hoje são
  `financialReferenceId` (string solta, sem FK) e talvez `ProductionOrder.costCenterId`; os demais têm
  incerteza real de modelagem.

**Impacto arquitetural**: horizontal, ~5 tabelas + 5 DTOs + 1 model novo, comportamento zero — parecido em
formato com um "lote" de migração da Fase 1, mas sem nenhuma lógica migrando junto.

**Risco de retrabalho**: **baixo** para `financialReferenceId`; **médio** para `costCenterId`/`CostCenter`
(forma ainda não validada por nenhum caso de uso real); **baixo-mas-desnecessário** para
`originDocumentType`/`originDocumentId` (recomendado não fazer, ver seção própria).

**Esforço estimado**: ~1 dia (schema + DTOs + testes de regressão confirmando zero mudança de
comportamento).

## Opção B — Registrar como débito técnico planejado, implementar antes da Fase 12

**Vantagens**
- `CostCenter` nasce com a forma certa desde o início, informada pelo que a Fase 7 (Requisição com
  `Tipo`) e a Fase 8 (Aprovação de Compras) já tiverem ensinado sobre a dimensão de centro de
  custo/departamento na prática — zero risco de "adivinhar errado" o modelo agora.
- Nenhum campo morto atravessando 6 fases sem uso — cada Service tocado nas Fases 6-11 permanece do
  tamanho exato do que a fase exige, sem ruído de campos reservados para depois.
- Mesma disciplina já usada 2 vezes neste projeto (achados de Fase 1 e Fase 3.1 catalogados, não
  corrigidos na hora) — precedente comprovado de que catalogar formalmente funciona aqui sem que o item
  se perca.

**Desvantagens**
- Documentos criados nas Fases 6-11 (inclusive as sugestões de compra/produção do próprio MRP, e
  qualquer Requisição/Pedido de Compra criado nesse intervalo) nunca terão esses campos preenchidos
  retroativamente — aceitável (Financeiro é prospectivo, não precisa reconstruir histórico), mas é uma
  escolha explícita, não um detalhe.
- Depende de lembrar de fato de implementar antes da Fase 12 — mitigado por registro formal no log de
  decisões do ADR-001 (mesmo mecanismo já usado e nunca esquecido neste projeto até aqui).

**Impacto arquitetural**: nenhum agora. Só se materializa quando a dívida for paga.

**Risco de retrabalho**: **baixo** — nada foi construído prematuramente para estar errado depois. O único
risco é organizacional (esquecer), não técnico.

**Esforço estimado**: zero agora; o esforço da Opção A é só adiado, não eliminado, mas provavelmente MENOR
quando pago de uma vez com o formato de `CostCenter` já validado por Fase 7/8, em vez de arriscar refazer.

## Decisão Consolidada (2026-07-09)

O usuário aprovou a estratégia híbrida recomendada, formalizando-a como a decisão oficial desta fase —
**nenhuma implementação preventiva "para preparar terreno", mas nada esquecido**:

| Campo | Decisão | Gatilho de implementação |
|---|---|---|
| `originDocumentType`/`originDocumentId` | **Cancelado definitivamente** | Nenhum — encerrado |
| `costCenterId` (+ model `CostCenter`) | Infraestrutura oportunista | Domínio real de Centro de Custos existir **E** Fase 7 (`Requisition`) ou Fase 8 (`PurchaseOrder`/`ProductionOrder`) tocar a entidade |
| `projectId` | Adiado | Domínio de Projetos passar a existir no sistema — sem previsão |
| `financialReferenceId` | Aprovado como identificador opaco | Mesma janela oportunista de `costCenterId`, sempre como `String?` solto, nunca como FK |

**Registro formal**: esta fase (5.9) não introduz nenhum código ou migração. O compromisso registrado
aqui — e que qualquer sessão futura deste projeto deve respeitar — é: quando a Fase 7 ou a Fase 8
alterarem naturalmente `Requisition`, `PurchaseOrder` ou `ProductionOrder` por seus próprios motivos, essa
é a oportunidade de introduzir `costCenterId`/`financialReferenceId` nelas, desde que o domínio de Centro
de Custos já esteja minimamente definido nesse momento. Se nenhuma das duas condições estiver satisfeita
quando essas fases chegarem, o campo continua adiado — não é criado só porque "a tabela já está sendo
mexida mesmo".

Esta fase está encerrada. Nenhuma pendência de decisão restante sobre infraestrutura financeira.
