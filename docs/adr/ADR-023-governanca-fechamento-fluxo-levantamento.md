# ADR-023 — Governança de Fluxo, Estorno, Faturamento/Expedição e Inteligência Operacional: Levantamento

- **Status**: Levantamento — aguardando aprovação do usuário antes de qualquer implementação
- **Data**: 2026-07-27
- **Origem**: proposta detalhada de 15 itens (+ melhorias visuais) trazida pelo usuário, junto com o
  mockup "Centro de Operações" (alertas com causa/sugestão/"Resolver agora"), pedindo que o ERP "deixe
  de ser apenas um lugar onde o usuário registra informações e passe a ser um sistema que diz
  claramente: o que está errado, por que está errado e o que precisa ser feito agora."

## PARTE 0 — Como este levantamento foi feito

7 agentes de pesquisa paralelos, cada um lendo o código real (services, repositories, `prisma/
schema.prisma`) — nunca assumindo pela memória do projeto — e reportando com citação de arquivo/linha.
Cada achado abaixo foi verificado contra o código, não contra a intenção original de cada fase
anterior. `graphify query` foi consultado primeiro em cada agente (regra permanente do projeto), mas —
como já diagnosticado e documentado no `CLAUDE.md` deste repositório — o grafo só faz extração de AST
de código, nunca indexação semântica de lógica de negócio; por isso todo achado real veio de leitura
direta de código-fonte, com o grafo servindo só para localizar em qual arquivo procurar.

## PARTE 1 — Decisão já tomada antes deste levantamento começar

**Item #1 da proposta original (reordenar Orçamento → Pedido de Venda → OP) foi respondido pelo
usuário antes mesmo deste documento: manter como está.** Vale registrar o porquê, porque não é uma
recusa arbitrária: a geração automática da Ordem de Produção na aprovação do Orçamento (antes da
conversão em Pedido de Venda) é uma decisão já registrada como definitiva em
`ADR-001-principios-arquiteturais.md` (2026-07-09, seção "Separação Comercial/Industrial da Fase 4
original"): *"a geração automática da Ordem de Produção na aprovação do Orçamento/Pedido de Venda já é
o fluxo natural e definitivo do Cozisteel ERP — não será introduzida uma etapa intermediária de
'Liberação da Produção'"*. O próprio texto da decisão original já previa este exato cenário: *"se no
futuro surgir uma necessidade real de aprovação manual da produção, ela será tratada como uma
funcionalidade nova, avaliada por seus próprios méritos"*. Consultado explicitamente, o usuário optou
por não reabrir essa decisão agora. **Este ADR não inclui o item #1** — os outros 14 itens não
dependem dele.

## PARTE 2 — Auditoria item a item (o que já existe vs. o que falta, contra o código real)

### 2. Estorno (reversão controlada)

Nenhuma lógica de reversão existe hoje em nenhum lugar do código (`cancelPayable`/`cancelReceivable`
em `financial-account.service.ts` são os únicos métodos "cancel"-like do projeto, e só funcionam
quando **nada** foi feito ainda — o oposto do caso que o estorno precisa cobrir). Infraestrutura
parcialmente reaproveitável: `StockMovement.referenceType`/`referenceId` já rastreia a origem de toda
movimentação, e `AuditLog.beforeValue`/`afterValue` (Json) já registra estado antes/depois — ambos
diretamente úteis para o estorno, mas nenhum tem um campo de "isto é a reversão de X" ainda.

As 4 operações "irreversíveis" citadas, rankeadas por complexidade/risco real (não por importância):

1. **Recebimento de Pedido de Compra** (mais simples) — reverter significa decrementar
   `PurchaseOrderItem.quantityReceived`, `Material.stockQty`, `MaterialBatch.quantityAvailable`, criar
   `StockMovement` inverso e recalcular `PurchaseOrder.status` pra baixo. Risco real: se o lote já foi
   parcialmente consumido por uma produção depois do recebimento, `quantityAvailable` pode já ser menor
   que o recebido — o estorno precisa bloquear ou ser parcial, verificável direto comparando
   `quantityAvailable` contra o `quantityReceived` original daquele evento.
2. **Registrar produção numa OP** (mais complexo) — a transação `produceWithTx()` toca `stockQty`
   (consumo), `MaterialBatch` (FIFO, múltiplos lotes), `BatchConsumption`, `MaterialReservation`,
   `stockQty` de produto acabado, `ProductBatch`, mais `BatchConsumption`, `quantityCompleted`/`status`
   da OP. **Caso genuinamente difícil**: se o `ProductBatch` gerado por esta rodada já foi consumido
   como componente por OUTRA Ordem de Produção (via `BatchConsumption` apontando pra ele), o estorno
   precisa ser bloqueado — reverter corromperia a rastreabilidade da outra OP. Isso é exatamente o
   "etapas posteriores incompatíveis" que você pediu, e é detectável.
3. **Aprovação de Orçamento** — estruturalmente mais complicado que os dois acima porque
   `ProductionOrder` **não tem `quoteId`** (só `salesOrderId`) — não existe hoje um jeito de achar,
   programaticamente, quais OPs vieram de qual orçamento (só um texto livre em `description` e uma
   frase no `AuditLog`). Um estorno real aqui precisa de uma FK nova antes mesmo de localizar o que
   reverter, e depois cai no caso #2 para cada OP que já produziu.
4. **Excluir OP com produção registrada** — não é um caminho de escrita, é só uma trava que já existe
   (`production-order.service.ts`) — deixa de ser um problema assim que o #2 existir (virar "estornar a
   produção primeiro").

**Net**: precisa de campos novos (`StockMovement.reversalOf`, `ProductionOrder.quoteId`), uma camada de
permissão especial + captura de motivo, e checagens de "ainda é reversível?" por operação — construídas
sobre dado que majoritariamente já existe, mas nenhuma lógica de reversão pronta pra reaproveitar.

### 3 e 4. Faturamento e Expedição

**Faturamento — a descoberta mais importante deste levantamento inteiro**: o modelo `Invoice` e
`InvoiceService.createFromSalesOrder()` **já existem, já são testados, e o handler que gera a Conta a
Receber a partir da fatura (`FATURA_EMITIDA` → `financialAccountService.createReceivableFromInvoice`)
já está em produção e correto** — mas `invoiceService.createFromSalesOrder` **nunca é chamado de lugar
nenhum além dos testes**. Não existe rota de API (`src/app/api/**` não tem nenhuma pasta de invoice/
fatura), não existe UI. O "processo autorizado da empresa" que o manual do usuário menciona não existe
de fato — hoje é literalmente impossível emitir uma fatura pelo sistema, nem por um caminho escondido.
Faltando de verdade: `InvoiceItem` (Invoice hoje só tem um `total` agregado, sem linhas, sem
quantidade por item — impossível fazer faturamento parcial de verdade sem isso), um `status` na
própria Invoice (rascunho/emitida/cancelada — hoje não existe nenhum), e o primeiro
rota+tela reais. A parte que gera a Conta a Receber pode ser reaproveitada sem tocar.

**Expedição — 100% a construir.** `SalesOrder.status` só tem `open/in_production/completed/cancelled`
— não existe "pronto para expedição" nem qualquer estado intermediário. `SalesOrderItem` não tem
nenhum campo de quantidade expedida/faturada. O "Romaneio de Transporte (PDF)" que já existe é gerado
a partir do **Orçamento** (não do Pedido, não de um registro de expedição), é um documento estático sem
transportadora/veículo/motorista/data/status — não tem nenhum vínculo com expedição real. Este módulo
precisa nascer do zero: um modelo novo de expedição/romaneio, campos de quantidade expedida por item.

### 5. Sincronização automática de status

Auditado contra os 6 exemplos dados — só 2 de 6 já são automáticos:

| Exemplo | Situação real |
|---|---|
| OP iniciada → Pedido "Em produção" | **Não automático.** Infra de evento já existe (`ORDEM_PRODUCAO_CRIADA`), só falta um handler novo chamando `salesOrderService.changeStatus`. |
| Todas as OPs concluídas → "Pronto para expedição" | **Não existe nem o status.** `SalesOrder.status` não tem esse valor — precisa de mudança de schema antes de qualquer automação. |
| Entrega total → "Concluído" | **Não automático, e sem fonte de dado** — não existe modelo de entrega/expedição (ver item 4). |
| Compra parcialmente recebida → "Recebido parcialmente" | **Já é automático hoje**, confirmado em `purchase-order.repository.ts` — `changeStatus()` inclusive recusa esse valor manualmente, forçando o caminho automático. |
| Todas as parcelas pagas → "Pago" | **Já é automático hoje**, confirmado em `account-payable.repository.ts`/`account-receivable.repository.ts`. |
| Material recebido → recalcular falta da OP | **Não automático.** `materialReservationService.reserveForProductionOrder()` já é idempotente/delta-aware por desenho, mas só é chamado na criação da OP — o recebimento de compra nunca o chama de novo. |

Achado extra: `SalesOrderService` já bloqueia cancelar um Pedido com OPs ativas vinculadas — o
princípio "avisar sobre documentos derivados ainda ativos" já existe parcialmente aqui, só não em
Orçamento/Requisição.

### 6. Mensagens de erro orientativas

`handleRouteError()` é um único ponto de entrada já usado por toda rota — bom para uma migração
central. Mas as mensagens em si são strings simples interpoladas em **114+ pontos** de
`BadRequestException` espalhados por 24 arquivos de Service — dar causa/próxima ação/botão pra cada uma
é trabalho incremental real, não uma mudança central. **Achado importante**: o exemplo específico que
você deu ("Não foi possível iniciar a OP 10245. Faltam 12 kg...") descreve uma validação que **não
existe hoje** — iniciar uma OP (`planned → in_progress`) não é bloqueado por falta de material
nenhuma. Construir esse exemplo específico é regra de negócio nova, não só reformatação de mensagem.

### 7. "Meu trabalho hoje"

`getAllAlerts()` já existe e já agrega alertas de vários módulos (usado hoje no sino de notificações) —
mecanismo real e reaproveitável. Mas cobre só 7 categorias hoje (orçamentos vencidos, OPs atrasadas,
cobertura de reserva, sugestões de MRP, materiais em baixo estoque, lotes vencendo, aprovações
pendentes de compra). Faltam por completo: compras atrasadas, recebimentos esperados, títulos
vencendo, cadastros incompletos, documentos devolvidos — nenhuma dessas tem query hoje. Além disso todo
alerta hoje é uma contagem global ("12 requisições pendentes"), nunca escopado a uma pessoa —
"responsável" seria resolvido via RBAC (quem TEM permissão de agir), não por um campo de atribuição
que não existe.

### 8. Linha do tempo completa do documento

`StatusTimeline`/`statusHistoryService.list()` já mostram o histórico de status de **uma** entidade —
ótimo componente de detalhe por nó, já testado, já em produção. Mas a travessia cruzada (Orçamento →
Pedido → OP → Requisição → Compra → ... → Financeiro) não existe — seria um Service novo que percorre
as FKs reais entre módulos, chamando `statusHistoryService.list()` por nó e montando um DTO unificado.

### 9. Alçada de aprovação real

Bloquear autoaprovação é **trivial**: `Requisition.userId`/`PurchaseOrder.userId` (criador) já são FKs
reais, só falta comparar contra o `userId` de quem está aprovando em `changeStatus()` — nenhuma
mudança de schema. Já a alçada por valor é estruturalmente impossível no RBAC atual: `rbac.ts` é
`papel → módulo → ação`, sem noção de valor ou de instância do documento — precisa de tabelas novas
(algo como `ApprovalRule`: tipo de condição/faixa de valor/papel exigido, e `ApprovalDelegate` para
substituto temporário). Nenhum dos dois existe hoje.

### 10. Revisões formais de BOM

**A maior parte já existe.** `BomRevision` já tem código de revisão, `draft/released/obsolete`,
`createdBy`/`releasedBy`/`releasedAt` separados, `StatusHistory` registrando cada transição.
Confirmado o ponto mais importante: **`ProductionOrder.bomRevisionId` já congela a revisão exata usada
na fabricação** — o motor de MRP já explode contra a revisão congelada, nunca a atual. `ProductOperation`
já existe com tempo de setup/rodada e centro de trabalho. Faltando de verdade: um status "em
aprovação" distinto de rascunho, um campo de "motivo da alteração" (`StatusHistory` não tem campo de
texto livre hoje), comparação/diff entre revisões, e materiais substitutos (não existe o conceito em
nenhum lugar do schema).

### 11. MRP automático

O motor já é sofisticado — netting multinível, considera reserva/estoque livre/em produção/em
compras, decide comprar vs. produzir, agrupa necessidade por várias OPs, e a aprovação humana antes de
gerar a Requisição já é uma decisão de desenho deliberada e documentada no próprio código. Mas hoje:
não considera `leadTimeDays` do fornecedor (o campo existe no schema, só nunca é lido pelo motor), não
considera estoque mínimo/segurança (`minStockQty` também existe e não é lido), não calcula NENHUMA data
de ruptura (motor é puramente de quantidade, sem dimensão de tempo), não sugere transferência. E — como
o MRP inteiro — **nenhuma rota de API existe**, nem scheduler. "Automático" aqui significa: completar 3
lacunas de cálculo + expor por rota/UI, não construir o motor.

### 12. Revisão formal de Orçamento convertido

`Quote.version` existe no schema mas é **vestigial**: todo caminho de criação grava `version: 1` fixo,
nada nunca incrementa, nada consulta por versão — `@@unique([number, version])` hoje se comporta
como um unique simples em `number`. `duplicate()` cria uma cópia totalmente desconectada (nem sequer
um campo tipo `duplicatedFromId`). A conversão em Pedido de Venda já faz o snapshot correto dos dados
(bom sinal para o desenho de revisão), mas editar um orçamento já convertido **não tem nenhuma trava
hoje** — ao contrário de excluir/cancelar/converter, que já bloqueiam corretamente. Construir isso é
efetivamente começar do zero: o campo `version` existe mas não ajuda de verdade.

### 13. Fechamento financeiro mensal

100% novo — nenhum conceito de período/competência, nenhuma trava, em nenhum dos 4 métodos de mutação
do Financeiro (`registerPayment`/`registerReceipt`/`cancelPayable`/`cancelReceivable`). Ponto positivo:
`AuditLog` já é genérico o bastante pra registrar "quem fechou/reabriu quando" sem nenhuma mudança de
schema — só falta a trava em si, que precisa de um modelo novo (`PeriodClosing`) consultado antes de
cada uma das 4 mutações.

### 14. Backup automático antes de correções

Já existe o backup manual (`PatchService.createManualBackup`), testado e em produção — só falta
conectar. E a boa notícia: as 3 receitas de correção hoje passam **todas** por um único despachante
(`src/app/api/admin/recipes/[id]/apply/route.ts`) — inserir uma chamada de backup automático ali, antes
do `switch`, cobre as 3 receitas existentes e qualquer futura, sem tocar em `AdminRecipesService`. É a
mudança mais barata de todo este levantamento. Falta também validar o backup de verdade (hoje só
confere tamanho de arquivo, nunca integridade).

### 15. Notificações externas

100% infraestrutura nova. Nenhum SMTP, nenhum `nodemailer` real (só aparece como dependência opcional
de outro pacote, nunca instalado/usado), nenhuma integração de WhatsApp/API externa em lugar nenhum do
projeto — nem para algo não relacionado como recuperação de senha. Envio de e-mail teria que ser
construído do zero, escolhendo e configurando um transporte de e-mail antes de qualquer coisa.

### Melhorias visuais e de usabilidade (lista final da sua proposta)

Não auditadas com agente dedicado (são majoritariamente ajustes de componente, não descobertas de
arquitetura) — avaliação direta: formulários em etapas, autosave de rascunho, validação em tempo real,
prévia de impacto, tabelas com colunas configuráveis e filtros salvos são trabalho de UI genuíno, sem
achado de bloqueio arquitetural conhecido. "Indicadores de carregamento e prevenção de clique duplo" já
está parcialmente coberto — vários dos `pendingStatusIds`/`disabled` já implementados nas Fases UX-1/
UX-6 seguem exatamente esse princípio nos pontos mais sensíveis (aprovação de orçamento, produção,
recebimento). "Status com texto, ícone e cor" já é a regra hoje (`StatusBadge` sempre mostra rótulo,
nunca só cor). Essa lista fica melhor tratada como parte da Fase 2/3, item a item, não como frente
própria.

## PARTE 3 — Tabela consolidada (priorizada pela sua própria ordem de fases)

| # | Item | O que já existe | O que falta | Complexidade real |
|---|---|---|---|---|
| 14 | Backup automático antes de correção | Backup manual pronto, 1 ponto de entrada único | 1 chamada + validação de integridade | P (pequena) |
| 9a | Bloquear autoaprovação | `userId` do criador já é FK | 1 comparação por `changeStatus` | P |
| 2 | Estorno | `StockMovement.referenceType/Id`, `AuditLog` before/after | Campos novos, permissão especial, checagem de reversibilidade por operação | G (grande) — maior risco no caso de OP |
| 9b | Alçada por valor | Nada (RBAC não tem noção de valor) | `ApprovalRule`/`ApprovalDelegate` novos | M/G |
| 6 | Mensagens de erro orientativas | Choke point único (`handleRouteError`) | Populado incrementalmente em 114+ pontos | M, mas longo (incremental) |
| 3 | Faturamento | `Invoice`/`InvoiceService` prontos, nunca chamados; handler pra Conta a Receber já correto | `InvoiceItem`, status/cancelamento, 1ª rota+tela | M |
| 4 | Expedição | Nada (nem status intermediário) | Modelo novo, campos de quantidade expedida | G |
| 5 | Status automáticos | 2 de 6 já automáticos | 3 wirings de evento + 1 status novo no schema | P/M |
| 12 | Revisão formal de Orçamento | `version` vestigial | Semântica real, diff, trava pós-conversão | G |
| 13 | Fechamento mensal | `AuditLog` serve pro log | `PeriodClosing` novo + 4 pontos de trava | G |
| 7 | Meu trabalho hoje | `getAllAlerts()` reaproveitável | ~5 categorias novas de query + ranking pessoal | M |
| 8 | Linha do tempo cruzada | `StatusTimeline` por nó já pronto | Travessia entre módulos nova | M |
| 11 | MRP automático | Motor de netting sofisticado, aprovação humana já certa | Lead time, estoque mínimo, data de ruptura, rota/UI | M |
| 15 | Notificações externas | Nada | Tudo (transporte de e-mail, templates, gatilhos) | G |
| 10 | BOM formal | Quase tudo (revisão congelada, operações com tempo) | Status "em aprovação", motivo, diff, substitutos | P/M |

## PARTE 4 — Roadmap em 4 fases (sua ordem, sem mudança)

### Fase 1 — Segurança operacional
Backup automático antes de correção (item mais barato de todo o levantamento) → bloqueio de
autoaprovação (também barato) → estorno (o mais arriscado da fase, começar pelo caso mais simples —
recebimento de compra — antes de produção) → mensagens de erro orientativas nos pontos mais sensíveis
(reaproveitando o mesmo conjunto de 6 módulos já tratado nas Fases UX-1/UX-5) → alçada por valor como
última subetapa da fase, já que exige schema novo.

### Fase 2 — Fechar o fluxo ponta a ponta
Faturamento (reaproveita infraestrutura já pronta, é o item de maior alavancagem da fase) → status
automáticos (os 3 wirings que faltam) → Expedição (a mais estrutural, depende de decidir o novo status
de Pedido de Venda) → revisão formal de Orçamento → fechamento mensal.

### Fase 3 — Inteligência operacional
"Meu trabalho hoje" (reaproveita `getAllAlerts()`) → linha do tempo cruzada → MRP automático (completar
as 3 lacunas de cálculo do motor já existente + expor) → notificações externas (a mais isolada, pode
andar em paralelo).

### Fase 4 — Engenharia industrial
BOM formal (menor esforço da fase, já que a base já existe) → roteiros/capacidade de máquina →
apontamento de mão de obra real → custeio real vs. previsto (comparação nova sobre o que
`CostingService` já calcula).

## PARTE 5 — Decisões pendentes (precisam da sua resposta antes de cada fase começar a codar)

1. **Estorno**: quando um lote/produção já foi consumido a jusante, o sistema deve **recusar** o
   estorno (erro claro) ou permitir um **estorno parcial/em cascata** (reverter também o que consumiu)?
   Recusar é mais simples e mais seguro; cascata é mais poderoso e mais arriscado.
2. **Faturamento**: total ou parcial por padrão? E a NF-e/integração fiscal — fica fora de escopo desta
   rodada (só o registro interno da fatura) ou você já quer desenhar o ponto de integração agora?
3. **Expedição**: qual o novo status intermediário exato do Pedido de Venda — "Pronto para expedição"
   como você sugeriu, ou aproveitar para desenhar o modelo de status mais completo de uma vez (aberto →
   em produção → pronto para expedição → expedido parcial → expedido total → concluído)?
4. **Alçada por valor**: a tabela de exemplo que você deu (Comprador até 5k, Gerente até 20k, Diretoria
   acima) é a regra real da empresa hoje, ou é ilustrativa? Preciso dos valores/papéis reais antes de
   desenhar `ApprovalRule`.
5. **Fechamento mensal**: pode haver lançamento com `dueDate` de um mês mas pago em outro — o período
   de competência é definido pela data de vencimento, pela data do pagamento/recebimento, ou por um
   campo novo que o usuário escolhe manualmente ao lançar?
6. **Notificações externas**: e-mail via SMTP da própria empresa (precisa das credenciais) ou um
   serviço terceirizado (SendGrid/SES/etc, mais simples de operar mas com custo recorrente)?

## Conclusão

Esta rodada mudou uma suposição importante: vários itens que pareciam "faltando" no seu pedido original
já têm boa parte da engenharia pronta e só nunca foram conectados — Faturamento é o caso mais gritante
(existe, testado, zero rota), seguido por MRP (motor sofisticado, zero UI) e BOM formal (quase
completo). Isso muda a ordem de esforço real dentro de cada fase: dentro da Fase 2, por exemplo,
Faturamento é bem mais barato que Expedição, mesmo os dois aparecendo juntos na sua proposta. Nenhuma
implementação foi feita. Aguardando sua aprovação para começar pela Fase 1.
