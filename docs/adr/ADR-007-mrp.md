# ADR-007 — MRP (Planejamento de Necessidade de Materiais)

- **Status**: **Fase 6 (MRP) concluída.** Subetapa 1 (Schema), Subetapa 2 (Motor de Cálculo) e
  Subetapa 3 (Execução e Persistência) implementadas e verificadas — `mrp-calculation.service.ts`
  (puro) + `mrp-execution.service.ts`/`mrp-run.repository.ts` (orquestração/persistência transacional).
  65/65 testes passando no total do projeto.
- **Data**: 2026-07-09
- **Depende de**: [ADR-005 — Engenharia do Produto (BOM)](./ADR-005-engenharia-produto-bom.md) (a
  explosão de estrutura usa `BomRevision`/`BomLine`); [ADR-006 — Reserva de Material](./ADR-006-reserva-de-material.md)
  (o MRP lê `reservedQty`, `MaterialReservation` e o conceito de saldo disponível que a Fase 5 introduziu)
- **Escopo explicitamente fora desta fase** (por instrução do usuário): geração automática de Pedido de
  Compra, geração automática de OP, planejamento finito, sequenciamento, capacidade de máquinas, APS,
  previsão de demanda. Este ADR é levantamento e proposta — o MRP desta fase **sugere**, nunca **cria**
  documentos formais sozinho.

## Contexto

A Fase 5 deu à Ordem de Produção uma reserva individual e idempotente — "o que ESTA OP específica ainda
precisa". Mas nenhuma parte do sistema hoje olha para **todas** as OPs abertas ao mesmo tempo e pergunta
"considerando tudo que já está reservado, a caminho e em produção, o que falta comprar ou fabricar no
total?". Essa é a lacuna que o MRP fecha: é o próximo consumidor natural da explosão de BOM (ADR-005) e da
distinção físico/reservado/disponível (ADR-006), agora rodando em escala — sobre o conjunto de demanda
aberta, não uma OP por vez.

## Levantamento — o que existe hoje

**`RequisitionService.suggestForProductionOrder()` já existe, mas é um cálculo raso.** Usa a relação
"ao vivo" `ProductMaterial` (não `BomLine`/`BomRevision`), soma `grossNeeded = quantity × orderQty ×
(1 + scrapPct/100)` e compara direto com `Material.stockQty` — um nível só (não explode subconjunto),
sem descontar `reservedQty` de outras OPs, e roda para **uma OP por vez**, sob demanda manual do usuário
(rota `POST /api/requisitions/suggest`). Continua existindo e continua útil para esse caso pontual — o
MRP não o substitui, é um cálculo agregado e multinível que essa rota não faz.

**A explosão de BOM (`bom-explosion.service.ts`) sempre desce até a matéria-prima, ignorando o estoque de
subconjuntos intermediários.** `explode()`/`explodeRevision()` recursam por um `componentProduct` sempre
que ele tem revisão própria, sem nunca checar `stockQty` daquele subconjunto no meio do caminho — correto
para Reserva (que precisa saber a necessidade bruta de matéria-prima de UMA OP), mas insuficiente para MRP
clássico, que precisa **abater o estoque de cada subconjunto antes de propagar a necessidade mais fundo**
(ver "Netting multinível" abaixo — decisão já validada com o usuário).

**`MaterialReservation.quantityShortfall` já é, por construção, a necessidade líquida de matéria-prima de
uma OP específica.** Como a Fase 5 só reserva o que o saldo permite e registra o resto como shortfall,
esse campo já vem "descontado" do que está reservado — é reaproveitável como ponto de partida do MRP para
folhas (matéria-prima e componentes sem BOM própria), sem precisar recalcular do zero e sem risco de
contar `reservedQty` em dobro (ver "Algoritmo proposto").

**`onOrderQty`/`inProductionQty` existem no schema desde a Fase 5, mas nada os popula ainda.** Foram
adicionados como preparação explícita ("só contabilizado nesta fase, sem gatilho automático", ADR-006).
O MRP é a primeira fase que precisa de um valor real ali — a decisão de como preencher esse valor está em
"Algoritmo proposto".

**Não existe hoje nenhum conceito de "sugestão" persistida.** `RequisitionItemQuote.isSelected` é o
precedente mais próximo no código (uma linha proposta que o usuário aceita/rejeita manualmente), e serve
de modelo para `MrpSuggestion` abaixo.

## Modelagem proposta

### 1. Fluxo completo de cálculo da necessidade líquida

Uma execução do MRP roda em 4 passos, sobre o conjunto de OPs com `status IN ('planned', 'in_progress',
'paused')` (**confirmado com o usuário**: só demanda já formalizada em OP; Pedido de Venda sem OP
vinculada não entra nesta fase — evita antecipar previsão de demanda comercial):

1. **Nível 0 — demanda firme.** Agrupar todas as OPs abertas por produto, somando `quantity`. Esta soma
   NÃO é líquida contra `Product.stockQty` — a OP já é uma decisão tomada; o MRP não questiona se ela
   deveria existir (isso seria planejamento, fora do escopo).
2. **Baixo nível de código (low-level coding).** Antes de explodir, calcular para cada Material/Product a
   profundidade MÁXIMA em que ele aparece como componente em qualquer `BomRevision` `released` alcançável
   a partir das OPs abertas (0 = só aparece como produto final de alguma OP; N = aparece N níveis abaixo
   em pelo menos uma estrutura). Isso garante que cada item só é líquido/explodido **depois** que TODA a
   sua demanda dependente — vinda de todos os produtos-pai, em todos os ramos — já foi somada. Sem isso,
   um subconjunto usado em dois produtos diferentes (ou em profundidades diferentes) seria processado
   parcialmente mais de uma vez, gerando números errados.
3. **Nivelar e explodir, do nível 0 ao mais profundo.** Para cada item, no seu nível:
   - Somar toda demanda bruta acumulada dele (vinda de todos os pais já processados).
   - Calcular disponibilidade líquida (ver seção 4).
   - `necessidadeLíquida = max(0, demandaBruta − disponibilidadeLíquida)`.
   - Se `necessidadeLíquida > 0` e o item tem `BomLine`s próprias (é fabricável) → sugestão de produção
     (seção 6) + propaga `necessidadeLíquida × (quantity da BomLine × (1+scrapPct/100))` como demanda
     bruta do nível seguinte para cada componente.
   - Se o item é folha (matéria-prima, ou componente sem `BomRevision` própria) → sugestão de compra
     (seção 5), sem propagar mais nada.
4. **Persistir o resultado** (seção "Entidades novas") como uma nova `MrpRun` + suas `MrpSuggestion`.

### 2. Integração com Engenharia (BOM)

Reaproveita `BomRevisionRepository`/`BomLineRepository` (ADR-005) exatamente como a Reserva já faz, mas
com uma trilha de explosão própria (`mrp-explosion.service.ts`, novo — ver "Neting multinível" abaixo para
o porquê de não reaproveitar `bom-explosion.service.ts` como está). Cada OP contribui com a `BomRevision`
que ela já tem **congelada** em `bomRevisionId` (ADR-006, ponto 1) — o MRP nunca busca "a revisão ativa
agora" para uma OP já existente, pelos mesmos motivos já validados na Fase 5 (a OP foi planejada contra
uma estrutura específica, que não muda debaixo dela). OPs sem `bomRevisionId` (produto sem engenharia
formal) caem no comportamento herdado: usam `ProductMaterial` "ao vivo", um nível só, exatamente como
`suggestForProductionOrder()` já faz hoje — nenhuma regressão para quem ainda não adotou BOM formal.

### 3. Integração com Reserva de Material

Para itens de **nível 0 direto** (matéria-prima ou componente sem BOM própria, usados diretamente por uma
OP) a Reserva **já calculou** a necessidade líquida daquela OP especificamente: `MaterialReservation.
quantityShortfall`. O MRP soma esse campo (não `quantityNeeded`) entre todas as OPs abertas que usam
aquele material como ponto de partida da demanda bruta de compra — isso já vem líquido de `reservedQty`,
então **não é somado de novo** contra `reservedQty` na disponibilidade (evita a dupla contagem: a mesma
reserva não pode reduzir a disponibilidade E já estar refletida como "falta" ao mesmo tempo). Para
subconjuntos com `BomLine` própria — que a Reserva atualmente atravessa sem nunca gerar uma linha de
reserva para eles (ADR-006, ponto 2: sempre desce até matéria-prima) — o MRP calcula a necessidade líquida
dele mesmo pela primeira vez (não existe hoje nenhum registro de "quanto este subconjunto específico está
faltando"), o que é exatamente a origem da sugestão de produção (seção 6). As duas reservas (Reserva de
Material, por OP; MRP, agregado) continuam coexistindo sem conflito: uma nunca escreve na tabela da outra.

### 4. Disponibilidade calculada (físico × reservado × produção × compra)

```
disponibilidadeLíquida(item) = stockQty − reservedQty + onOrderQty + inProductionQty
```

- **`stockQty`**: saldo físico atual — sem mudança.
- **`reservedQty`**: já comprometido com outras OPs abertas — só entra na fórmula para folhas cujo ponto
  de partida NÃO veio de `quantityShortfall` (ver seção 3); onde a demanda já é o shortfall,
  `reservedQty` não entra de novo, para não contar a mesma reserva duas vezes.
- **`onOrderQty`**: **calculado ao vivo** a cada execução, não lido do campo persistido em
  `Material`/`Product` (esse campo continua existindo e "sem gatilho automático" como a Fase 5 deixou —
  o MRP não passa a escrever nele). Soma de `PurchaseOrderItem.quantity − quantityReceived` de todo
  `PurchaseOrder` com `status NOT IN ('received', 'cancelled')` daquele material — mesmo padrão de
  "nunca armazenar o calculável" já usado para `availableQty` na Fase 5.
- **`inProductionQty`**: soma da `necessidadeLíquida` já calculada para aquele mesmo item em OUTRA
  ocorrência dele como subconjunto dentro da MESMA execução do MRP (ele já está "programado para ser
  produzido" pelo próprio cálculo desta rodada) — evita sugerir produzir de novo algo que a rodada atual
  já decidiu que vai ser produzido por outro ramo da árvore.

### 5. Critérios para geração de sugestão de compra

Gerada quando o item é uma **folha** (matéria-prima, ou `Product` sem `BomRevision` `released` própria) e
`necessidadeLíquida > 0`. **Confirmado com o usuário**: gerada mesmo sem fornecedor vinculado —
`SupplierMaterial` preferencial é anexado quando existir (`supplierId` na sugestão); quando não existir,
a sugestão é gerada do mesmo jeito com `supplierId: null`, sinalizando a lacuna, para o usuário não perder
visibilidade da necessidade real só porque o cadastro de fornecedor está incompleto.

### 6. Critérios para geração de sugestão de produção

Gerada quando o item tem `BomLine`s próprias (é fabricável — subconjunto ou produto com engenharia
formal) e sua `necessidadeLíquida` calculada no seu próprio nível é `> 0`, depois de abatido seu próprio
`stockQty`/`onOrderQty`/`inProductionQty` (seção 4). Isso é, por definição, uma necessidade que nenhuma OP
aberta hoje cobre — é a lacuna que uma nova OP (criada manualmente pelo usuário, fora desta fase) supriria.

### 7. Tratamento de materiais faltantes

Dois casos distintos, ambos sem bloquear o cálculo do restante da árvore:
- **Falta de estoque** (o caso comum): vira sugestão de compra ou produção normalmente (seções 5/6).
- **Falta de cadastro** (material/produto sem `SupplierMaterial`, ou componente sem `BomRevision` E sem
  vínculo de compra nenhum): a sugestão ainda é gerada (quantidade e item corretos), só sem o fornecedor
  preenchido — nunca interrompe a explosão dos demais itens da árvore. Nenhum erro é lançado; a ausência
  de cadastro é informação para o usuário resolver, não uma condição de exceção do cálculo.

### 8. Preparação para horizonte de planejamento futuro

Nesta fase, TODAS as OPs abertas entram no cálculo, sem filtro de data — não há bucketing por período
nem priorização por `dueDate`. Preparação schema-only (mesmo padrão de `onOrderQty` na Fase 5: campo
existe, nada o usa para decidir nada ainda):
- `MrpRun.horizonDate` (opcional) — reservado para uma fase futura filtrar OPs por `dueDate` até essa
  data; nesta fase, sempre `null`, sem efeito no cálculo.
- `MrpSuggestion.neededByDate` (opcional) — preenchido com o menor `dueDate` entre as OPs de origem
  daquela sugestão, quando houver; puramente informativo, não ordena nem prioriza nada nesta fase.

## Netting multinível — por que uma trilha de explosão nova

**Confirmado com o usuário**: o MRP deve descontar o estoque de um subconjunto intermediário ANTES de
propagar a necessidade para as matérias-primas dele — comportamento clássico de MRP (netting por nível).
Isso é diferente do que `bom-explosion.service.ts` faz hoje (sempre desce até matéria-prima, ignorando
estoque de subconjunto no meio do caminho) — correto para Reserva (ADR-006, ponto 2 do ADR: "detecção de
ciclo baseada no caminho do ramo", pensado para UMA OP), mas incompatível com o requisito de netting por
nível do MRP, que precisa agregar a demanda de TODOS os ramos antes de decidir quanto abater. Por isso a
proposta é um serviço novo (`mrp-explosion.service.ts`), não uma opção nova dentro do serviço existente:
as dependências que o algoritmo carrega durante a recursão são diferentes (Reserva percorre por ramo;
MRP percorre por nível, com um acumulador global por item) — misturar os dois no mesmo método aumentaria o
acoplamento sem ganho real, já que nenhum dos dois vai precisar do modo do outro no meio da própria
execução. Reaproveita, sim, a mesma leitura de `BomLine`/`BomRevision` via os repositories existentes, e a
mesma disciplina de detecção de ciclo (um item não pode aparecer como seu próprio ancestral, verificado ao
montar os níveis antes de nivelar).

## Subetapa 1 — Schema (proposta detalhada, 2026-07-09)

Refina as entidades já esboçadas na seção anterior à luz do formato de saída pedido para o motor de
cálculo (Subetapa 2): "quantidade necessária, quantidade disponível, quantidade reservada, quantidade
faltante, tipo de ação sugerida". Isso muda `MrpSuggestion` de um único campo `quantity` para o mesmo
vocabulário de três campos já usado por `MaterialReservation` (`quantityNeeded`/`quantityReserved`/
`quantityShortfall`, ADR-006) — reaproveita um nome já estabelecido no domínio em vez de inventar um novo,
e dá a cada sugestão histórico suficiente para investigar "por que o MRP sugeriu isso" sem precisar
re-rodar o cálculo.

### Validação de impacto no schema atual

100% aditivo. Nenhum campo ou model existente muda de tipo, obrigatoriedade ou nome. `Material`/`Product`/
`Supplier`/`ProductionOrder`/`User` ganham só relações inversas novas (`mrpSuggestions`,
`mrpSuggestionSources`, `mrpRuns`) — nenhum campo escalar novo neles. Nenhuma migration destrutiva.

### Validação da relação com BOM (ADR-005)

`MrpSuggestion` **não guarda FK direta para `BomRevision`/`BomLine`**. A ligação é só de leitura, dentro do
motor de cálculo (Subetapa 2): dado um `productId`, o motor consulta `BomRevisionRepository`/
`BomLineRepository` para decidir se o item é fabricável (tem `BomLine`s própria → candidato a sugestão de
produção) ou folha (sem `BomLine` → candidato a sugestão de compra). Guardar um FK direto na sugestão
duplicaria uma informação já derivável de `productId` (Princípio 5, Fonte Única da Verdade) e ficaria
desatualizado se a revisão ativa do produto mudar depois da sugestão ter sido gerada — o que é aceitável
aqui, já que a sugestão é uma fotografia de um momento, não uma referência viva.

### Validação da relação com Reserva de Material (ADR-006)

Mesma lógica: **sem FK direta para `MaterialReservation`**. A Reserva entra só como **dado de entrada** do
cálculo (`MaterialReservation.quantityShortfall` agregado, ver seção 3 acima) — nunca como referência
persistida na sugestão. Se no futuro alguém precisar navegar de uma sugestão até a reserva que a
originou, o caminho já existe via `MrpSuggestionSource.productionOrderId` →
`MaterialReservation.productionOrderId` (FK já existente desde a Fase 5) — não precisa de um atalho novo.

### Validação da relação futura com Requisição (Fase 7)

**Nenhum campo novo agora.** Mesma disciplina já validada e registrada no ADR-008 para `costCenterId`/
`financialReferenceId`: o consumidor futuro carrega a referência de volta, o produtor não antecipa um
campo sem uso. Quando a Fase 7 existir e alguém quiser gerar uma Requisição a partir de uma
`MrpSuggestion`, é a Fase 7 quem ganha um campo novo (ex: `RequisitionItem.originMrpSuggestionId`,
apontando para cá) — `MrpSuggestion.id` (cuid estável) já é uma âncora suficiente, sem precisar de nada
adicional nesta fase.

### Compras — confirmado fora do escopo

Nenhuma FK para `PurchaseOrder`/`PurchaseOrderItem`/`RequisitionItem`/`Requisition` em nenhuma entidade
desta fase. `supplierId` (abaixo) é só um dado informativo (fornecedor preferencial), nunca um gatilho de
criação de documento.

### Snapshot histórico mínimo — confirmado, 2 campos adicionados

O modelo original já cobria 2 dos 4 pontos pedidos (`suggestionType` e as quantidades já são gravados no
momento da execução, imutáveis depois). Faltavam os outros 2 — adicionados:

- **`productTypeSnapshot`** (`String?`, só relevante quando `itemType = "product"`): o motor de cálculo
  (Subetapa 2) decide "compra" vs. "produção" olhando se o produto tem `BomLine` própria — e isso é
  influenciado por `Product.productType`. Sem um snapshot, uma reclassificação futura do produto
  (`subassembly` → `finished`, por exemplo) tornaria uma sugestão histórica ilegível: o leitor veria o
  `productType` de HOJE, não o que motivou a decisão na hora.
- **`supplierNameSnapshot`** (`String?`): `supplierId` continua existindo como FK viva (útil para navegar
  até o cadastro atual), mas o NOME do fornecedor no momento da sugestão é gravado à parte — se o
  fornecedor for renomeado ou desativado depois, a sugestão histórica continua legível sem depender do
  cadastro atual.

Nomes/códigos de `Material`/`Product` não ganharam snapshot — o FK (`materialId`/`productId`) já é
suficiente ali: nenhuma fase deste roadmap permite excluir um Material/Product referenciado (mesmo padrão
de proteção que já existe para `BomRevision`), então o risco de "o registro sumir" não existe; o risco
real era só de **reinterpretação** (`productType`) e de **desatualização** (nome de fornecedor), os dois
já cobertos acima.

### Proposta de schema

```prisma
model MrpRun {
  id         String    @id @default(cuid())
  number     String    @unique // via NumberingService, novo documentType "mrp"
  executedAt DateTime  @default(now())
  horizonDate DateTime? // reservado para horizonte futuro — sem efeito no cálculo nesta fase
  userId     String
  user       User      @relation(fields: [userId], references: [id])

  // Resultado geral — denormalizado no momento da persistência (Subetapa 3), não uma consulta futura
  openOrdersConsidered       Int @default(0)
  totalSuggestions           Int @default(0)
  totalPurchaseSuggestions   Int @default(0)
  totalProductionSuggestions Int @default(0)

  suggestions MrpSuggestion[]

  @@index([executedAt])
}

model MrpSuggestion {
  id             String   @id @default(cuid())
  mrpRunId       String
  mrpRun         MrpRun   @relation(fields: [mrpRunId], references: [id], onDelete: Cascade)
  suggestionType String   // "purchase" | "production"
  itemType       String   // "material" | "product"
  materialId     String?
  material       Material? @relation(fields: [materialId], references: [id])
  productId      String?
  product        Product?  @relation(fields: [productId], references: [id])

  // Mesmo vocabulário de MaterialReservation (ADR-006) — needed/reserved/shortfall
  quantityNeeded    Float // demanda bruta acumulada deste item, neste nível, nesta execução
  quantityAvailable Float // stockQty + onOrderQty(calculado ao vivo) + inProductionQty, no momento do cálculo
  quantityReserved  Float @default(0) // informativo: soma do já reservado (MaterialReservation) embutido na demanda bruta acima — 0 para subconjuntos, que a Reserva não reserva hoje (ADR-006, ponto 2)
  quantityShortfall Float // = max(0, quantityNeeded - quantityAvailable) — a quantidade de fato sugerida

  supplierId   String?   // fornecedor preferencial, quando existir — null sinaliza lacuna de cadastro
  supplier     Supplier? @relation(fields: [supplierId], references: [id])
  neededByDate DateTime? // menor dueDate entre as OPs de origem — informativo nesta fase
  status       String    @default("pending") // "pending" | "accepted" | "dismissed" — só "pending" gravado nesta fase, sem fluxo de transição ainda
  createdAt    DateTime  @default(now())

  // Snapshot histórico mínimo — preserva a leitura da decisão mesmo se o cadastro mudar depois
  productTypeSnapshot  String? // Product.productType no momento da sugestão (só quando itemType = "product")
  supplierNameSnapshot String? // nome do fornecedor sugerido no momento (corporateName || tradeName)

  sources MrpSuggestionSource[]

  @@index([mrpRunId])
  @@index([materialId])
  @@index([productId])
  @@index([suggestionType])
}

// Rastreabilidade: quais OPs abertas contribuíram para esta sugestão (auditoria — "por que o MRP sugeriu isso?")
model MrpSuggestionSource {
  id                  String          @id @default(cuid())
  mrpSuggestionId     String
  mrpSuggestion       MrpSuggestion   @relation(fields: [mrpSuggestionId], references: [id], onDelete: Cascade)
  productionOrderId   String
  productionOrder     ProductionOrder @relation(fields: [productionOrderId], references: [id])
  contributedQuantity Float // quanto desta OP específica compõe quantityNeeded da sugestão

  @@index([mrpSuggestionId])
  @@index([productionOrderId])
}
```

## Impacto sobre módulos existentes

- **Produção**: nenhuma mudança de comportamento — `ProductionOrderService` não é tocado nesta fase (ao
  contrário da Fase 5, que alterou `create()`/`update()`). O MRP só **lê** OPs abertas, nunca escreve nelas.
- **Estoque**: nenhuma mudança de comportamento — `stockQty`/`reservedQty` só são lidos, nunca escritos
  pelo MRP. Nenhum `StockMovement` novo é gerado por uma execução de MRP (diferente da Reserva, que gera
  `RESERVE`/`RELEASE`) — o MRP não move estoque, só sugere.
- **Compras (Requisição/Cotação/Pedido de Compra)**: `PurchaseOrderItem` passa a ser **lido** (para
  `onOrderQty` calculado ao vivo), mas nada é escrito ali. `RequisitionService.suggestForProductionOrder()`
  continua existindo e funcionando exatamente como hoje, sem relação com o MRP.
- **Engenharia (BOM)**: só leitura, via os repositories existentes (`BomRevisionRepository`/
  `BomLineRepository`) — nenhum model de Engenharia muda.
- **Numeração**: novo `documentType` `"mrp"` para `NumberingService.getNextNumber()` — precisa de uma
  linha `NumberSequence` (mesma mecânica dos demais documentos, nenhuma mudança na service).

## Plano de implementação em subetapas

1. **Subetapa 1 — Schema**: `MrpRun`, `MrpSuggestion`, `MrpSuggestionSource`, relações inversas em
   `Material`/`Product`/`Supplier`/`ProductionOrder`. `prisma db push` em dev e teste. Testes de schema
   (criação/relações), sem nenhuma lógica de cálculo ainda — mesmo padrão da Subetapa 1 das Fases 4 e 5.
2. **Subetapa 2 — Motor de cálculo** (`mrp-explosion.service.ts`, função pura, nada persistido ainda):
   baixo nível de código; nivelamento; disponibilidade líquida (seção 4); geração das listas de
   necessidade de compra/produção em memória. Testes cobrindo: nível único; multinível com netting real
   contra estoque de subconjunto (o caso que `bom-explosion.service.ts` explicitamente NÃO cobre);
   agregação de demanda de múltiplas OPs abertas para o mesmo material; `onOrderQty` calculado ao vivo;
   material sem fornecedor (sugestão sinalizada, não bloqueada); ciclo detectado sem quebrar o cálculo dos
   demais ramos.
3. **Subetapa 3 — Execução e persistência** (`mrp-run.service.ts` + `MrpRunRepository`): orquestra uma
   execução completa, grava `MrpRun` + `MrpSuggestion` + `MrpSuggestionSource` numa única transação.
   Testes cobrindo: execução completa gerando sugestões corretas; execução sem nenhuma OP aberta (run
   vazio, sem erro); duas execuções sucessivas preservando o histórico da anterior (não sobrescreve, não
   deleta); rastreabilidade (`MrpSuggestionSource` aponta pras OPs certas com a quantidade certa).

Cada subetapa termina com testes, atualização deste ADR, `graphify update .` e validação do usuário antes
da próxima — mesma disciplina das Fases 4 e 5.

## Decisões validadas com o usuário (resumo)

| Decisão | Escolha |
|---|---|
| Demanda que alimenta o MRP | Só OPs abertas (`planned`/`in_progress`/`paused`) — sem Pedido de Venda sem OP |
| Netting de subconjunto intermediário | Líquido em cada nível (abate estoque do subconjunto antes de propagar) — não reaproveita a explosão "sempre completa" da Reserva |
| Persistência das sugestões | Persistida (`MrpRun`/`MrpSuggestion`/`MrpSuggestionSource`), com histórico entre execuções |
| Material sem fornecedor vinculado | Sugestão gerada mesmo assim, sinalizando a lacuna (`supplierId: null`) |

---

# Subetapa 2 — Motor de Cálculo (especificação, 2026-07-09)

**Nenhum código nesta rodada.** Especificação completa do algoritmo, aguardando aprovação antes de criar
`mrp-calculation.service.ts` ou qualquer teste.

## 1. Arquitetura do motor

### Dados que entram no cálculo (demanda real)
- `ProductionOrder` com `status IN ('planned', 'in_progress', 'paused')` — `productId`, `quantity`,
  `bomRevisionId` (pode ser `null`), `dueDate`. É a única fonte de demanda (decisão já validada:
  Pedido de Venda sem OP não entra).

### Dados só de consulta (nunca alterados, usados para calcular disponibilidade)
- `BomRevision`/`BomLine` — via `BomRevisionRepository`/`BomLineRepository`, exatamente como a Reserva
  já lê hoje.
- `Material.stockQty`/`reservedQty` e `Product.stockQty`/`reservedQty` — lidos diretamente (ver seção 4
  para o porquê de não precisar somar `MaterialReservation` linha a linha).
- `PurchaseOrderItem` (via `purchaseOrder.status NOT IN ('received', 'cancelled')`) — para calcular
  `onOrder` ao vivo. **Limitação estrutural, não uma escolha desta fase**: `PurchaseOrderItem.materialId`
  é obrigatório e só referencia `Material` — não existe hoje nenhum jeito de um `Product` estar "a
  caminho" via Pedido de Compra. Um componente do tipo `product` sem `BomLine` própria (comprado/
  terceirizado) nunca terá `onOrder` calculado nesta fase; fica `0` sempre. Registrado como ponto de
  decisão (seção 7, item 1).
- Outras `ProductionOrder` abertas — para calcular `inProduction` ao vivo de um item do tipo `product`
  (soma de `quantity` de toda OP aberta cujo `productId` seja esse mesmo item — ver seção 4).
- `SupplierMaterial`/`Supplier` — só para achar o fornecedor preferencial (enriquecimento da sugestão,
  nunca influencia a quantidade calculada).

### Dados que o motor NUNCA escreve
Absolutamente nada é gravado por este serviço: nenhum `StockMovement`, nenhuma alteração em
`Material`/`Product`/`ProductionOrder`/`MaterialReservation`/`PurchaseOrder`. O motor **retorna** uma
estrutura em memória; quem persiste é a Subetapa 3 (`mrp-run.service.ts`, ainda não especificado).

### Localização
`src/app/services/mrp-calculation.service.ts` — **um ajuste de nome em relação ao que este ADR
mencionava antes** (`mrp-explosion.service.ts`): o serviço faz mais do que explodir estrutura — nivela
por baixo nível de código, aplica disponibilidade e monta o resultado final. "Cálculo" descreve melhor o
que ele faz do que "explosão", que já é o nome usado pelo motor da Reserva.

### Integração futura com `MrpRun`/`MrpSuggestion`
O motor exporta uma função pura, algo como `calculate(): Promise<MrpCalculationResult>`, onde
`MrpCalculationResult` é uma lista de itens em memória (não instâncias de modelo Prisma) com exatamente
os campos que `MrpSuggestion` precisa (`itemType`, `materialId`/`productId`, `suggestionType`,
`quantityNeeded`/`quantityAvailable`/`quantityReserved`/`quantityShortfall`, `productTypeSnapshot`,
`supplierId`/`supplierNameSnapshot`, `neededByDate`, e a lista de fontes para `MrpSuggestionSource`). A
Subetapa 3 chama essa função, cria um `MrpRun` e insere as `MrpSuggestion`/`MrpSuggestionSource`
correspondentes numa transação — mesma separação pura/transacional já usada na Fase 5
(`bom-explosion.service.ts` puro + `material-reservation.repository.ts` transacional).

## 2. Algoritmo detalhado

O algoritmo tem duas fases distintas — importante não confundir uma com a outra:

**Fase A — Bootstrap (nível 0, uma vez por OP, respeitando a revisão congelada).** Cada OP aberta é
explodida **individualmente**, contra a **sua própria** `bomRevisionId` congelada (nunca a ativa do
produto agora) — porque duas OPs abertas para o MESMO produto podem ter congelado revisões DIFERENTES
(uma revisão nova pode ter sido liberada depois que a primeira OP foi criada). Por isso não existe
"explodir o produto X uma vez para a soma de todas as OPs" — cada OP contribui sua própria demanda
exploda separadamente para o nível 1, e é só a partir do nível 1 que os resultados de diferentes OPs se
juntam num acumulador compartilhado.

- Sem `productId`: OP não contribui nenhuma demanda (nada a explodir).
- Sem `bomRevisionId` (produto sem engenharia formal): comportamento herdado — usa `ProductMaterial`
  "ao vivo", um nível só, igual ao `RequisitionService.suggestForProductionOrder()` de hoje.
- Com `bomRevisionId`: lê as `BomLine` daquela revisão específica, gera a necessidade bruta de cada
  componente (`line.quantity × (1 + scrapPct/100) × op.quantity`) e acumula num mapa compartilhado
  `grossDemand` (chave = `material:<id>` ou `product:<id>`), junto com a origem (`op.id`, quantidade
  contribuída) para alimentar `MrpSuggestionSource` depois.

**Fase B — Nivelamento (nível 1 em diante, revisão ativa canônica).** A partir daqui, cada componente
usa a revisão `released` **atualmente ativa** do seu próprio produto (nunca uma congelada — só o
vínculo OP↔produto-raiz é congelado, ADR-006 e ADR-007 seção "Integração com Engenharia" já confirmam
isso). Como não existe mais divergência de revisão por branch a partir deste ponto, cada item tem uma
estrutura única e canônica — isso é o que permite processar por nível global em vez de por ramo.

Passo a passo:

1. **Descoberta das demandas**: já coberta pela Fase A (bootstrap) — o conjunto inicial de chaves em
   `grossDemand` é o ponto de partida.
2. **Baixo nível de código (ordenação por nível)**: antes de processar qualquer item, uma passada de
   descoberta (só profundidade, sem calcular quantidade) percorre a árvore de cada item já presente em
   `grossDemand`, usando a revisão ativa de cada componente, registrando a **profundidade MÁXIMA** em
   que cada item aparece em qualquer ramo (`levels: Map<itemKey, number>`). Detecção de ciclo nesta
   passada usa a mesma disciplina de `bom-explosion.service.ts` (um `path` por ramo de recursão — um
   item não pode reaparecer como seu próprio ancestral).
3. **Explosão multinível + cálculo de necessidade bruta**: os itens são processados em ordem crescente
   de nível. Ao processar um item, seu `grossDemand` já está **completo** — todo pai daquele item tem
   nível estritamente menor e já foi processado antes, então já depositou toda sua demanda dependente.
   Isso é a garantia central do baixo nível de código (ver explicação dedicada abaixo).
4. **Aplicação de estoque, reservas e compras em aberto**: para cada item, na ordem de nível, calcula
   disponibilidade (seção 4) e a necessidade líquida (`quantityShortfall`).
5. **Propagação**: se o item é fabricável (tem `BomLine` própria) e `quantityShortfall > 0`, essa
   quantidade é explodida pela revisão ativa do item, alimentando o `grossDemand` dos seus próprios
   componentes — que serão processados mais adiante, pois têm nível estritamente maior.
6. **Resultado**: uma lista de "necessidade líquida por item" (vira `MrpSuggestion` na Subetapa 3) mais
   o resumo geral (`openOrdersConsidered`, contagens por tipo) que vira `MrpRun`.

### Por que "baixo nível de código" evita cálculo incorreto

Sem essa ordenação, dois erros diferentes podem acontecer:
- **Processar cedo demais**: se um item aparece como componente direto de um produto (nível 1) mas
  TAMBÉM aparece, mais fundo, como componente de outro subconjunto (nível 3) — processá-lo já no nível
  1 significa nesse momento sua demanda ainda está incompleta (a contribuição do nível 3 ainda nem foi
  calculada). O resultado seria um `quantityShortfall` menor do que o real, ou uma segunda passagem
  duplicada e inconsistente pelo mesmo item.
- **Processar por ramo, não por nível** (o que a explosão da Reserva faz, corretamente, para o caso
  dela): cada ramo calcularia sua PRÓPRIA necessidade sem saber da necessidade de outro ramo pelo mesmo
  item, e nunca poderia decidir "quanto abater do estoque desse item" sem contar a demanda toda —
  abateria o estoque inteiro no primeiro ramo que passar por ali, deixando os ramos seguintes com uma
  leitura de disponibilidade zerada mesmo quando ainda haveria estoque de sobra se a demanda tivesse
  sido somada primeiro.

O baixo nível de código resolve os dois: ao garantir que cada item só é processado depois que TODOS os
pais possíveis (em qualquer ramo, em qualquer OP) já contribuíram sua demanda, a necessidade bruta usada
para nettar contra o estoque está sempre completa e correta, processada exatamente uma vez.

## 3. Netting multinível

Exemplo de referência (usado também nos casos de teste):

```
Produto Acabado "Mesa"        (OP: 10 unidades)
  └─ Subconjunto "Estrutura"   (1 por Mesa → necessidade bruta: 10)
       └─ Matéria-prima "Tubo de aço"  (4 por Estrutura → necessidade bruta SE explodida direto: 40)
```

**Quando o estoque do subconjunto é consumido**: no nível do próprio subconjunto (`Estrutura`), antes
de propagar qualquer coisa para `Tubo de aço`. Se `Estrutura` tem 6 unidades em estoque
(`stockQty = 6`, `reservedQty = 0`, nenhuma OP aberta produzindo mais dela): `quantityAvailable = 6`,
`quantityShortfall = max(0, 10 − 0 − 6) = 4`. Só essas **4** unidades faltantes de `Estrutura` são
explodidas para baixo.

**Quando o subconjunto deve ser explodido de novo**: só pela quantidade em falta (4), nunca pela
necessidade bruta original (10). `Tubo de aço` recebe `4 × 4 = 16` de necessidade bruta — não `40`.

**Como isso evita comprar matéria-prima que já existe como subconjunto pronto**: se o motor ignorasse o
estoque de `Estrutura` (como a explosão da Reserva faz, de propósito, para outro objetivo — ver
comparação abaixo), ele sugeriria comprar `Tubo de aço` suficiente para fabricar 10 Estruturas do zero,
mesmo havendo 6 já prontas em estoque — resultando em compra de matéria-prima redundante para produzir
componentes que, na prática, não precisam ser fabricados de novo.

### Comparação explícita com a explosão da Reserva (Fase 5)

| | Reserva (`bom-explosion.service.ts`) | MRP (`mrp-calculation.service.ts`) |
|---|---|---|
| Escopo | Uma OP por vez, sob demanda | Todas as OPs abertas de uma vez, numa execução |
| Estoque de subconjunto intermediário | **Ignorado** — sempre desce até matéria-prima | **Descontado** antes de propagar (netting por nível) |
| Por que o comportamento da Reserva está certo pra ela | A Reserva existe pra reservar contra o saldo FÍSICO de matéria-prima de UMA OP específica — não decide "produzir menos Estrutura", só reserva o que a OP vai consumir fisicamente quando a Estrutura for de fato fabricada a partir do zero (o sistema não assume hoje que uma OP vai "aproveitar" estoque de subconjunto pronto na sua receita viva) | O MRP decide o que comprar/fabricar de fato — ignorar o estoque de subconjunto aqui geraria sugestão de produção/compra redundante, o oposto do objetivo desta fase |
| Estrutura de percurso | Por ramo (`path: Set` por chamada recursiva) | Por nível (`levels: Map` global, processado em ordem crescente) |
| Reaproveita o mesmo código? | Não — motivo já registrado na seção "Netting multinível — por que uma trilha de explosão nova" deste ADR | — |

## 4. Tratamento de reservas

**Correção em relação ao texto original deste ADR** (seção "3. Integração com Reserva de Material"):
aquele texto sugeria somar `MaterialReservation.quantityShortfall` diretamente como base da demanda de
folhas. Numa análise mais profunda para esta especificação, isso se mostrou desnecessário e, pior,
poderia sub-contar a demanda em estruturas multinível (o `quantityShortfall` da Reserva reflete uma
explosão que NUNCA neta subconjunto, então não é diretamente comparável ao `grossDemand` que o MRP
calcula com netting próprio). A forma correta — e mais simples — é: **o MRP nunca lê `MaterialReservation`
diretamente**. Ele lê `Material.reservedQty`/`Product.reservedQty` (o campo global, já mantido
corretamente sincronizado pela Fase 5 a cada reserva/liberação) como a única fonte de "quanto já está
comprometido". `MaterialReservation` continua existindo e funcionando exatamente como está — o MRP só
não precisa dela como fonte de dados, porque o campo agregado já basta.

Fórmula usada para TODO item (folha ou subconjunto, sem distinção):

```
freeStock         = max(0, stockQty − reservedQty)          // estoque genuinamente livre, não comprometido com nenhuma OP
onOrder           = (só material) soma de PurchaseOrderItem aberto
inProduction      = (só product) soma de quantity de outras OPs abertas cujo productId = este item
quantityAvailable = freeStock + onOrder + inProduction
quantityShortfall = max(0, quantityNeeded − reservedQty − quantityAvailable)
```

Por que subtrair `reservedQty` de `quantityNeeded` E somar `freeStock` (que já descontou `reservedQty` do
`stockQty`) não é dupla contagem: `reservedQty` representa a fatia de `quantityNeeded` que **já está
garantida** (fisicamente reservada para as próprias OPs abertas que compõem essa demanda) — ela é
subtraída da necessidade uma vez (`− reservedQty`), e o estoque físico correspondente a essa fatia já foi
removido do cálculo de `freeStock` (que é `stockQty − reservedQty`, não `stockQty` puro) — então cada
unidade de estoque só entra na conta uma vez: ou como "já reservada" (explica parte do `needed`) ou como
"livre" (parte do `available`), nunca as duas.

### Exemplo exatamente como pedido

```
OP precisa:            100 unidades
Reserva existente:      30 unidades (Material.reservedQty = 30)
Estoque físico:         30 unidades (Material.stockQty = 30 → freeStock = max(0, 30−30) = 0)
Compras em aberto:       0
Em produção (produto):  não se aplica (é material)

quantityAvailable  = 0 + 0 + 0 = 0
quantityShortfall  = max(0, 100 − 30 − 0) = 70
```

Exatamente o resultado esperado: **70**, não `100 + 30 = 130` nem `100 − 30 = 70` por acaso — o resultado
bate com a subtração simples neste exemplo porque `freeStock = 0`, mas a fórmula completa continua
correta em cenários onde sobra estoque livre além do reservado (nesse caso, `quantityAvailable` cresce e
reduz o shortfall ainda mais).

## 5. Pseudocódigo

```
function calculateMRP(userId):
  openOrders = ProductionOrder.findMany({ status: in(['planned','in_progress','paused']) })

  grossDemand = {}        // itemKey -> number
  demandSources = {}      // itemKey -> [{ productionOrderId, quantity }]

  // ── Fase A: bootstrap, uma vez por OP, revisão congelada ──
  for op in openOrders:
    if op.productId is null: continue
    if op.bomRevisionId is null:
      for pm in liveProductMaterials(op.productId):
        addDemand(grossDemand, demandSources, key('material', pm.materialId), pm.quantity * (1+pm.scrapPct/100) * op.quantity, op.id)
      continue
    for line in BomLine.findMany({ bomRevisionId: op.bomRevisionId }):
      childKey = line.lineType == 'material' ? key('material', line.materialId) : key('product', line.componentProductId)
      addDemand(grossDemand, demandSources, childKey, line.quantity * (1+line.scrapPct/100) * op.quantity, op.id)

  // ── Passo 1: baixo nível de código ──
  levels = computeLowLevelCodes(keys(grossDemand))   // profundidade máxima por item, com detecção de ciclo por ramo

  // ── Passo 2: nivelar e explodir ──
  sortedItems = keys(grossDemand).sortBy(item => levels[item])
  results = []

  for itemKey in sortedItems:
    needed = grossDemand[itemKey]
    if needed <= 0: continue

    balances = readBalances(itemKey)   // stockQty, reservedQty
    freeStock = max(0, balances.stockQty - balances.reservedQty)
    onOrder = itemKey.type == 'material' ? calcOnOrderLive(itemKey.id) : 0
    inProduction = itemKey.type == 'product' ? sumOtherOpenOrdersProducing(itemKey.id) : 0
    available = freeStock + onOrder + inProduction
    shortfall = max(0, needed - balances.reservedQty - available)

    revision = itemKey.type == 'product' ? findActiveBomRevision(itemKey.id) : null
    isFabricable = revision != null

    results.push({
      itemKey, suggestionType: isFabricable ? 'production' : 'purchase',
      quantityNeeded: needed, quantityReserved: balances.reservedQty,
      quantityAvailable: available, quantityShortfall: shortfall,
      sources: demandSources[itemKey],
      productTypeSnapshot: itemKey.type == 'product' ? readProductType(itemKey.id) : null,
      preferredSupplier: itemKey.type == 'material' ? findPreferredSupplier(itemKey.id) : null,
    })

    if shortfall > 0 and isFabricable:
      for line in BomLine.findMany({ bomRevisionId: revision.id }):
        childKey = line.lineType == 'material' ? key('material', line.materialId) : key('product', line.componentProductId)
        addDemand(grossDemand, demandSources, childKey, line.quantity * (1+line.scrapPct/100) * shortfall, itemKey)

  return { suggestions: results.filter(r => r.quantityShortfall > 0), openOrdersConsidered: openOrders.length }
```

`addDemand()` só soma no acumulador e empilha a origem — não recalcula nada. `results` inclui só itens com
`quantityShortfall > 0` (item plenamente coberto não vira sugestão — não há por que sugerir nada quando a
necessidade líquida é zero).

## 6. Casos de teste obrigatórios (simulados)

1. **Produto simples com uma matéria-prima**: 1 OP, 1 `BomLine` tipo material, sem estoque nenhum →
   1 sugestão de compra, `quantityShortfall = quantityNeeded`.
2. **Produto multinível**: Mesa→Estrutura→Tubo de aço (seção 3) → 2 sugestões (produção de Estrutura,
   compra de Tubo de aço), com a quantidade de Tubo refletindo só o shortfall de Estrutura, não a bruta.
3. **Estoque suficiente**: `quantityAvailable >= quantityNeeded` em qualquer nível → nenhuma sugestão
   gerada para aquele item (e nada propaga para os componentes dele, se for subconjunto).
4. **Estoque parcial**: `quantityShortfall` positivo mas menor que `quantityNeeded` → sugestão com os 4
   campos preenchidos corretamente, propagação usa só o `quantityShortfall`.
5. **Sem estoque**: `stockQty = 0`, `reservedQty = 0` → `quantityShortfall = quantityNeeded` (caso
   degenerado da fórmula, sem tratamento especial).
6. **Material reservado**: exemplo exato da seção 4 (100/30/30 → shortfall 70).
7. **Duas OPs usando o mesmo material**: ambas contribuem para o mesmo `grossDemand[itemKey]` na Fase A
   (bootstrap) — nenhuma lógica extra necessária, a agregação já é natural por construção.
8. **Material sem fornecedor**: sugestão de compra gerada com `supplierId: null`,
   `supplierNameSnapshot: null` — nunca bloqueia o cálculo dos demais itens.
9. **Subconjunto com estoque próprio**: idêntico ao passo "quando o estoque do subconjunto é consumido"
   da seção 3 — cobre também o caso de uma OP aberta produzindo mais daquele subconjunto
   (`inProduction > 0` reduz o `quantityShortfall` do subconjunto).
10. **Alteração de BOM após OP criada**: criar OP congelando revisão A; liberar uma revisão B nova para o
    mesmo produto (A vira obsoleta); rodar o cálculo — a Fase A (bootstrap) deve continuar usando A (via
    `op.bomRevisionId`), nunca buscar "a ativa agora" (que seria B) para o nível 0. Comprova que o
    congelamento da Fase 5 é respeitado também pelo MRP.

## 7. Pontos de decisão (aguardando validação antes do código)

1. **Componente tipo `product` sem `BomLine` própria nunca terá `onOrder` calculado** — limitação
   estrutural (`PurchaseOrderItem` só referencia `Material`), não uma escolha de design. A sugestão de
   compra para esse tipo de item ainda é gerada corretamente (`quantityShortfall`), só sem o sinal de "já
   está a caminho via Pedido de Compra". Confirmar que isso é aceitável nesta fase (parece ser, dado que
   Compras está fora do escopo mesmo).
2. **Motor não lê `MaterialReservation` — só o campo `reservedQty` agregado** — correção/simplificação
   sobre o que este ADR dizia antes (ver seção 4). Confirmar que essa mudança de abordagem está aprovada.
3. **`inProductionQty` passa a ser CALCULADO ao vivo pelo motor** (soma de `quantity` de outras OPs
   abertas produzindo o mesmo `product`) — o campo persistido `Product.inProductionQty` continua sem
   gatilho automático (Fase 5), o motor só lê OPs abertas diretamente, o mesmo padrão já usado para
   `onOrderQty`. Confirmar que dar esse uso real a um conceito preparado desde a Fase 5 está dentro do
   escopo desta subetapa.
4. **Bootstrap por OP individual, não por produto agregado** — cada OP explode contra sua própria
   revisão congelada; só a partir do nível 1 os resultados de diferentes OPs (mesmo que para o mesmo
   produto, com revisões diferentes) se combinam num acumulador único. Confirmar que este ponto ficou
   claro e correto — é a peça mais sutil da arquitetura.
5. **Itens plenamente cobertos (`quantityShortfall = 0`) não geram `MrpSuggestion` nenhuma** — só itens
   com necessidade líquida positiva viram sugestão. Confirmar que "nenhuma sugestão" é o resultado
   esperado quando tudo está coberto (em vez de, por exemplo, gerar uma sugestão "informativa" com
   quantidade zero).

Todos os 5 pontos acima foram aprovados pelo usuário sem ressalva antes da implementação.

## Subetapa 2 — Implementação (2026-07-09)

**Concluída e verificada.** `src/app/services/mrp-calculation.service.ts` — função pura
(`calculate(): Promise<MrpCalculationResult>`), sem nenhuma escrita no banco. Repositories ganharam 3
métodos novos, puramente de leitura, sem lógica de negócio:
- `ProductionOrderRepository.findManyOpenForMrp()` — única fonte de demanda.
- `PurchaseOrderRepository.findOpenItemsByMaterials()` — base do `onOrder` ao vivo.
- `SupplierMaterialRepository.findPreferredForMaterial()` — enriquecimento da sugestão de compra.

**Nota de escopo, não coberta pelo pseudocódigo aprovado**: `MrpSuggestion.neededByDate` não é
preenchido pelo motor nesta versão. O campo `ProductionOrder.dueDate` é uma `String` livre (não
`DateTime`), sem parser confiável no projeto hoje — popular esse campo exigiria lógica de parsing de data
que não fazia parte do algoritmo detalhado na especificação aprovada. Fica `null`/ausente por enquanto,
sem efeito em nada (era só informativo desde a seção 8 deste ADR); pode ser endereçado numa fase futura
que precise de fato do horizonte de planejamento.

**Testes** (`tests/mrp-calculation.test.ts`, 11 casos — os 10 obrigatórios + um extra de fornecedor
preferencial): produto simples; multinível Mesa→Estrutura→Tubo (netting comprovado: Tubo recebe só o
shortfall da Estrutura, 16, nunca a bruta, 40); estoque suficiente (zero sugestões, nada propaga);
estoque parcial; sem estoque; material reservado (100/30/30 → shortfall 70, fórmula exata da seção 4);
duas OPs mesmo material (agregação natural, sem lógica extra); material sem fornecedor (sugestão gerada,
sinalizada); material com fornecedor (enriquecida); subconjunto com estoque próprio + outra OP produzindo
mais dele (`inProduction` reduz o shortfall corretamente); alteração de BOM após a OP (revisão congelada
respeitada, revisão nova nunca consultada para aquela OP). **58/58 testes passando no total do projeto.**
`tsc --noEmit` confirma o mesmo erro de ambiente pré-existente, não relacionado a este trabalho.

## Subetapa 3 — Execução e Persistência (decisões aprovadas, 2026-07-09)

### 1. Responsabilidade das camadas

```
mrp-calculation.service.ts   → cálculo puro. Nenhuma persistência, nenhuma alteração de estoque,
                                nenhuma criação de documento. Intocado desde a Subetapa 2.
mrp-execution.service.ts     → orquestração. Chama o cálculo UMA vez, controla o fluxo da execução,
                                não recalcula nada, não abre a transação diretamente.
mrp-run.repository.ts        → único responsável pela transação de persistência: cria MrpRun,
                                MrpSuggestion e MrpSuggestionSource, tudo atômico.
```

Confirmado: nesta fase o MRP **não cria** Requisição, Pedido de Compra nem Ordem de Produção — só
`MrpRun`/`MrpSuggestion`/`MrpSuggestionSource`.

### 2. Transação

Aprovado: o cálculo roda **fora** da transação (é leitura pura, evita segurar lock de escrita durante um
percurso de árvore potencialmente longo). A transação começa só na persistência —
`MrpRun` → `MrpSuggestion` → `MrpSuggestionSource`, tudo commitado ou desfeito junto, em
`mrp-run.repository.ts`.

### 3. Histórico das execuções

Aprovado: cada chamada de `mrpExecutionService.run(userId)` sempre cria um `MrpRun` novo — nunca
substitui, nunca reaproveita um anterior, mesmo com os mesmos dados de entrada. Não existe (nem faz
sentido existir) uma noção de "idempotência de execução" aqui — cada rodada é uma nova análise de
planejamento por definição, histórico e independente (ex.: MRP #001 na segunda, MRP #002 na terça, ambos
permanecem consultáveis para análise histórica).

### 4. Consolidação das sugestões

Confirmado: **uma `MrpSuggestion` por item**, nunca uma por OP de origem. Já resolvido inteiramente pela
Subetapa 2 (`mrp-calculation.service.ts` agrega toda a demanda por item antes de gerar qualquer
resultado) — a Subetapa 3 só persiste 1:1 o que o cálculo já entrega: 10 OPs precisando do mesmo aço inox
304 viram 1 `MrpSuggestion` + 10 `MrpSuggestionSource` (uma por OP contribuinte), nunca 10 sugestões
separadas.

### 5. Status do MrpRun

Aprovado NÃO criar campo de status. A existência do registro no banco já significa, por construção da
transação atômica, execução concluída com sucesso — não existe estado intermediário observável, e um
`MrpRun` "failed" nunca chega a existir (a transação desfaz o próprio `MrpRun` junto com o resto em caso
de erro). Se este processo virar assíncrono no futuro (fila, job em background), esta decisão é revisada
naquele momento — não antes.

### 6. Integração futura com o usuário — fluxo de aprovação humana

Ponto explicitamente registrado para não ser perdido de vista: o MRP desta fase é um motor de
**inteligência e análise**, nunca um executor automático. O fluxo esperado, hoje e nas próximas fases, é:

```
MRP gera sugestão
  ↓
Usuário analisa
  ↓
Usuário aprova
  ↓
Sistema gera Requisição de Produção ou Compra (fase futura — Fase 7 em diante)
```

Essa separação é deliberada e permanente — nunca deve ser colapsada num processo invisível sem controle
humano no meio. `MrpSuggestion.status` (`pending`/`accepted`/`dismissed`, já no schema desde a Subetapa 1)
existe exatamente para sustentar esse fluxo de aprovação quando ele for implementado; nesta fase, toda
sugestão nasce e permanece `pending` — nenhum código ainda transiciona esse campo.

### 7. Interface

Sem API/rota nesta subetapa — mesma disciplina das Subetapas 1 e 2 (domínio primeiro, interface depois).
Quando uma tela for construída (fase futura), o desenho já esperado é **Planejamento → MRP**, mostrando:
última execução, quantidade de sugestões, materiais faltantes, produções sugeridas, compras sugeridas, e
a origem da necessidade (as OPs, via `MrpSuggestionSource`). Registrado aqui como direção futura, não
como escopo desta subetapa.

## Subetapa 3 — Implementação (2026-07-09)

**Concluída e verificada — Fase 6 (MRP) completa.**

- `src/app/repositories/mrp-run.repository.ts` (novo) — `persist(number, userId, calculation)`: uma
  única `db.$transaction` cria o `MrpRun` já com o resumo completo (nenhum `update` posterior), depois
  uma `MrpSuggestion` por item do resultado e uma `MrpSuggestionSource` por fonte daquele item.
- `src/app/services/mrp-execution.service.ts` (novo) — `run(userId)`: chama
  `mrpCalculationService.calculate()` (fora da transação), gera o número via
  `numberingService.getNextNumber('mrp')` (fora da transação, mesmo padrão de todo outro documento do
  sistema), delega a gravação ao repository. `getById(id)` para consulta.
- `NumberSequence` ganhou o `documentType` `"mrp"` — pré-semeado em `vitest.setup.ts`, mesmo padrão dos
  demais documentos.

**Testes** (`tests/mrp-execution.test.ts`, 7 casos — exatamente os pedidos): execução sem necessidade
(`MrpRun` com `totalSuggestions: 0`); sugestão de compra (com `MrpSuggestionSource` correta); sugestão de
produção; múltiplas OPs consolidando em **uma** `MrpSuggestion` com 2 `MrpSuggestionSource` (nunca uma
sugestão por OP); rollback completo forçando uma FK inválida de propósito — confirmado que nem o
`MrpRun` nem nenhuma `MrpSuggestion` sobrevivem à falha; duas execuções independentes (números
diferentes, ambas consultáveis); reexecução com os mesmos dados de entrada gerando **dois** `MrpRun`
com sugestões em registros distintos, sem deduplicar entre execuções. **65/65 testes passando no total
do projeto.** `tsc --noEmit` confirma o mesmo erro de ambiente pré-existente, não relacionado a este
trabalho.

**Fase 6 (MRP) está completa**: Subetapa 1 (Schema) → Subetapa 2 (Motor de Cálculo) → Subetapa 3
(Execução e Persistência), cada uma com levantamento, proposta, validação do usuário, implementação,
testes, ADR e Graphify — mesma disciplina de todas as fases anteriores. O MRP nasceu, como planejado,
como motor de inteligência e recomendação — nunca um executor automático (nenhuma Requisição, Pedido de
Compra, OP ou movimentação de estoque criada por ele). Próxima fase do roadmap: Fase 7 (Requisição
corporativa), quando existir demanda do usuário para iniciá-la.
