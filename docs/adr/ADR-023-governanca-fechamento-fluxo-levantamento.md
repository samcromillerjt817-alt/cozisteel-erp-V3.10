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

## PARTE 4 — Roadmap em 4 fases (proposta original do usuário, mantida como referência de agrupamento temático — ver Parte 6 para a ordem real de implementação)

### Fase 1 — Segurança operacional
Backup automático antes de correção, bloqueio de autoaprovação, estorno, mensagens de erro
orientativas, alçada por valor.

### Fase 2 — Fechar o fluxo ponta a ponta
Faturamento, status automáticos, Expedição, revisão formal de Orçamento, fechamento mensal.

### Fase 3 — Inteligência operacional
"Meu trabalho hoje", linha do tempo cruzada, MRP automático, notificações externas.

### Fase 4 — Engenharia industrial
BOM formal, roteiros/capacidade de máquina, apontamento de mão de obra real, custeio real vs.
previsto.

## PARTE 5 — Decisões (RESOLVIDAS pelo usuário em 2026-07-27)

### 1. Estorno de produção com consumo a jusante

- **Decisão tomada**: recusar o estorno nesta fase quando o lote/produção já foi consumido a jusante.
  Não haverá estorno em cascata.
- **Justificativa**: o impacto de uma cascata atravessa várias OPs, lotes, custos e produtos acabados
  ao mesmo tempo — risco desproporcional ao ganho, numa primeira versão do mecanismo.
- **Consequência**: ao bloquear, o sistema deve informar explicitamente (1) qual lote foi consumido,
  (2) em quais OPs ele foi utilizado, (3) quais produtos foram gerados a partir dele, e (4) qual
  administrador pode analisar o caso — o bloqueio não pode ser um beco sem saída silencioso.
- **Fora de escopo agora**: reversão automática em cascata através de múltiplos níveis de consumo.
- **Evolução futura**: para os casos excepcionais que precisarem mesmo assim de reversão, criar uma
  **correção administrativa especializada** (Central de Administração — prévia, backup automático e
  auditoria, mesmo padrão já usado pelas receitas de `AdminRecipesService`) — nunca um "estorno comum".

### 2. Faturamento

- **Decisão tomada**: faturamento **total por padrão**, parcial permitido. A tela abre com todo o saldo
  faturável do Pedido pré-selecionado, mas as quantidades podem ser alteradas antes de confirmar. NF-e/
  integração fiscal fica fora do escopo — "Fatura" é, por enquanto, só o documento financeiro interno.
- **Justificativa**: cobre o caso comum (faturar tudo) sem exigir cliques extras, mas não impede o caso
  real de faturamento parcial que a Invoice já foi desenhada para suportar (`SalesOrder.invoices
  Invoice[]`, comentário original já previa "N faturas, faturamento parcial").
- **Consequência / regras mínimas obrigatórias**:
  - Nunca faturar quantidade acima do saldo restante do item.
  - Permitir várias faturas por Pedido de Venda (já é o desenho do schema).
  - A tela sempre mostra quantidade pedida, já faturada e restante, por item.
  - Impedir duplicidade por duplo clique ou reenvio de requisição (idempotência na criação).
  - A Conta a Receber continua sendo criada pelo handler de domínio já existente
    (`FATURA_EMITIDA` → `createReceivableFromInvoice`) — nenhuma mudança nessa ponta.
  - Exibir o vínculo Pedido → Fatura → Conta a Receber em todas as telas relevantes.
  - Cancelamento de fatura só é permitido enquanto não houver nenhum recebimento financeiro
    registrado contra ela; depois disso, cancelar exige passar pelo estorno financeiro (não pelo
    cancelamento simples).
- **Fora de escopo agora**: emissão de NF-e, qualquer integração fiscal.
- **Evolução futura**: anexar NF-e / integrar com emissor fiscal quando essa necessidade for real.

### 3. Expedição

- **Decisão tomada**: desenhar o modelo completo agora, mas **como duas máquinas de estado
  separadas** — o Pedido de Venda não ganha todos os status de expedição diretamente.
  - `SalesOrder.status`: `Aberto → Em produção → Pronto para expedição → Atendimento parcial →
    Concluído` (+ `Cancelado`).
  - Nova entidade **Expedição** (1:N com o Pedido — várias expedições por pedido): `Rascunho → Em
    separação → Pronta → Expedida → Entregue` (+ `Cancelada`).
- **Justificativa**: produção e expedição são processos diferentes, com ritmos e responsáveis
  diferentes — misturar os dois num único enum forçaria estados artificiais (ex.: "expedido parcial")
  no lugar errado.
- **Consequência**: quem determina se o Pedido está parcial ou totalmente atendido são as
  **quantidades** somadas de todas as Expedições ligadas a ele, nunca um status escolhido manualmente
  — isso permite várias expedições parciais para o mesmo pedido sem inventar um estado novo a cada
  combinação. O schema (`Shipment`/`Expedicao` + itens com quantidade expedida, transportadora,
  veículo, motorista, datas prevista/efetiva, comprovante) já nasce completo mesmo que a primeira
  entrega implemente só até "Pronto para expedição".
- **Fora de escopo agora**: nenhum item da lista original foi cortado — só a ORDEM de entrega (ver
  Parte 6) empurra Expedição pro fim da sequência, por ser domínio genuinamente novo.
- **Evolução futura**: nenhuma — o modelo já nasce no formato final pretendido.

### 4. Alçada por valor

- **Decisão tomada**: os valores R$5k/R$20k eram **ilustrativos**, não a regra real da empresa — não
  devem virar valor hardcoded em lugar nenhum.
- **Justificativa**: inventar uma regra de negócio real sem os números verdadeiros seria pior do que
  não ter a funcionalidade.
- **Consequência**: construir um motor de alçada genuinamente configurável — tipo de documento, valor
  mínimo/máximo, perfil ou usuário aprovador, quantidade de aprovações necessárias, permitir ou não
  autoaprovação, vigência da regra, ordem das etapas. Enquanto os valores reais não forem definidos,
  ativar uma **política inicial simples que preserva o comportamento atual** (qualquer aprovador com
  permissão de módulo aprova, sem faixa de valor) — mas já passando pelo motor novo, não por um atalho
  paralelo. Isso valida o schema e a arquitetura sem inventar regra de negócio.
- **Fora de escopo agora**: qualquer valor de corte real — depende de dado que só a empresa tem.
- **Evolução futura**: quando os valores reais chegarem, é só cadastrar `ApprovalRule`s novas — nenhuma
  mudança de código deveria ser necessária nesse momento, se o motor for desenhado certo agora.

### 5. Fechamento mensal — competência

- **Decisão tomada**: criar um campo próprio de competência (`competenceDate`/`competencePeriod`) —
  não reaproveitar vencimento nem pagamento para isso.
- **Justificativa**: os três conceitos são diferentes e não podem ser confundidos — vencimento é
  obrigação prevista, pagamento é caixa realizado, competência é o período econômico/contábil do
  lançamento em si.
- **Consequência**: preenchimento automático pela origem do documento (Conta a Receber usa a data da
  fatura; Conta a Pagar usa a data do recebimento/documento do fornecedor); alteração manual só com
  permissão especial e justificativa obrigatória; o fechamento passa a bloquear inclusões, alterações,
  cancelamentos e baixas retroativas dentro daquela competência. O Fluxo de Caixa (já existente,
  `getProjectedCashFlow`) **continua usando vencimento/pagamento normalmente** — competência é um
  conceito contábil à parte, não substitui a visão de caixa.
- **Fora de escopo agora**: conciliação bancária (mencionada na proposta original como "futura").
- **Evolução futura**: conciliação bancária, quando isso virar prioridade.

### 6. Notificações externas

- **Decisão tomada**: SMTP da própria empresa como primeira implementação, mas por trás de uma
  interface desacoplada (`NotificationProvider` ou equivalente) desde o primeiro dia.
- **Justificativa**: trocar depois por SES/SendGrid/outro provedor não deve exigir alterar nenhuma
  regra de módulo — só trocar a implementação por trás da interface.
- **Consequência / desde o início**: fila/outbox de notificações, tentativas com reprocessamento,
  status (`enviado`/`falhou`/`pendente`) por envio, histórico registrado no próprio documento de
  origem, templates configuráveis por tipo de notificação. **Regra permanente**: uma falha de envio de
  e-mail nunca desfaz nem bloqueia a operação de negócio do ERP que a originou — o envio é sempre um
  efeito colateral registrado, nunca uma dependência crítica do fluxo principal.
- **Fora de escopo agora**: WhatsApp e qualquer canal além de e-mail, nesta primeira leva.
- **Evolução futura**: novos canais entram como novos `NotificationProvider`s, sem tocar na fila/outbox
  nem nas regras de disparo já existentes.

## PARTE 6 — Sequência de implementação (definida pelo usuário em 2026-07-27, após o levantamento)

Esta ordem **substitui** a leitura literal das 4 fases da Parte 4 — o agrupamento temático continua
válido como referência, mas a sequência real de entrega é esta, definida depois de ver o que já existe
pronto no código:

1. **Conectar o Faturamento já existente** — maior retorno pelo menor esforço de todo o levantamento
   (`Invoice`/`InvoiceService`/handler já prontos e testados; só falta `InvoiceItem` + status +
   primeira rota/tela).
2. **Estorno seguro com bloqueio de dependência a jusante** — a peça de segurança operacional mais
   importante, decisão #1 acima já fecha o comportamento esperado.
3. **Completar a exposição do MRP** — motor já pronto, só faltam as 3 lacunas de cálculo + rota/UI.
4. **Completar a BOM formal** — também já majoritariamente pronta.
5. **Criar o novo motor configurável de alçadas** — com a política inicial neutra da decisão #4 acima.
6. **Só então iniciar Expedição e Fechamento Mensal** — os dois domínios genuinamente novos, sem
   nenhuma engenharia prévia para reaproveitar, ficam por último de propósito.

Os itens restantes do levantamento original (mensagens de erro orientativas, "Meu trabalho hoje",
linha do tempo cruzada, revisão formal de Orçamento, notificações externas, roteiros/capacidade de
máquina, apontamento de mão de obra, custeio real vs. previsto) continuam no roadmap, sem uma posição
fixa ainda atribuída na sequência acima — a definir quando os 6 itens priorizados estiverem
encaminhados.

## PARTE 7 — Item 1 da sequência implementado: Faturamento ligado (2026-07-27)

Schema (aditivo, `db push` autorizado separadamente pelo usuário, distinto da aprovação do
levantamento — mesma disciplina permanente do projeto): `Invoice` ganhou `status`
(`issued`/`cancelled`, default `issued`) e `cancelledAt`; novo modelo `InvoiceItem` (quantidade + preço
unitário **congelados** no momento da emissão — preço nunca editável na tela, só a quantidade,
conforme a Decisão #2).

`InvoiceService.createFromSalesOrder()` deixou de receber um `amount` agregado e passou a receber
`items: {salesOrderItemId, quantity}[]` — a checagem de saldo por item ("nunca faturar acima do saldo
restante") e a criação da fatura acontecem dentro da MESMA transação (`db.$transaction`), fechando a
janela de corrida que permitiria um clique duplo ou uma requisição repetida faturar mais do que o
pedido realmente tem disponível. `getInvoiceableBalance()` (nova) calcula pedido/faturado/restante por
item, somando só `InvoiceItem` de faturas **não canceladas** — uma fatura cancelada libera o saldo de
volta automaticamente para refaturamento, sem precisar de nenhum código extra (testado). `cancel()`
(nova) reaproveita a MESMA guarda que `financialAccountService.cancelReceivable()` já aplicava (só
permite cancelar enquanto a Conta a Receber está em `'open'`, sem nenhum recebimento) — em vez de
duplicar a regra, chama o método existente e propaga o mesmo erro de negócio, cumprindo a Decisão #1
("depois de um recebimento, exige estorno financeiro") com zero lógica nova de verificação.

2 rotas novas: `GET/POST /api/sales-orders/[id]/invoices` (GET sob `orcamentos:read` — mesma permissão
de quem já vê o Pedido; POST sob `financeiro:create`, já que fatura é documento financeiro, conforme a
Decisão #2) e `POST /api/invoices/[id]/cancel` (`financeiro:update`, mesmo padrão já usado pelo
cancelamento de Conta a Receber). UI: nova seção "Faturamento" dentro do `DetailDrawer` de Pedidos de
Venda (`invoicing-section.tsx`) — abre com o saldo restante de cada item já pré-preenchido por inteiro
(Decisão #2: "todo o saldo faturável selecionado, mas permitir alterar quantidades"), confirmação antes
de emitir (citando se é fatura total ou parcial), lista de faturas já emitidas com o vínculo explícito
para a Conta a Receber gerada, e ação de cancelar quando ainda `issued`.

4 testes de `Invoice` existentes precisaram de migração (assinatura mudou de `amount: number` para
`items: [...]`) — todos os casos antigos continuam cobertos, com o mesmo valor total resultante (ex.:
faturamento parcial 400+600 de um pedido de 1000 vira quantidade 0.4+0.6 do mesmo item, matematicamente
idêntico). 3 testes novos: quantidade acima do saldo é rejeitada, cancelar fatura sem/com recebimento
já registrado, e fatura cancelada libera o saldo do item para refaturar.

**Verificação**: tsc limpo, lint 47 (+1 real, mesmo padrão de fetch-em-efeito já aceito em toda a
aplicação — o novo componente `invoicing-section.tsx`), 354/354 testes (3 novos), build limpo (as 2
rotas novas confirmadas no manifesto).

## PARTE 8 — Item 2 da sequência implementado: Estorno seguro (2026-07-27)

Primeiro caso concreto, escolhido por ser o mais simples entre os 4 mapeados na Parte 2 (recebimento
de compra) — produção fica para uma rodada futura, dado o risco maior já documentado ali.

Schema (aditivo, `db push` autorizado separadamente): `StockMovement` ganha `reversedAt` (marca que
ESTE lançamento já foi estornado) e `reversalOfId`/`reversals` (auto-relação — marca que ESTE
lançamento É o estorno de outro). Os dois lados nunca se confundem: um lançamento não pode ser
estornado duas vezes, e um estorno não pode ser estornado.

`purchaseOrderService.reverseReceipt(movementId, reason, userId)` reverte UM lançamento específico
(não o pedido inteiro — motivo: "selecionar o lançamento incorreto", nas palavras originais do
usuário), dentro de uma única transação: decrementa `stockQty`, o `MaterialBatch` (quando
lotControlled) e `PurchaseOrderItem.quantityReceived`, recalcula o status do pedido pra baixo, marca o
movimento original como estornado e cria um novo movimento `OUT` ligado a ele — o lançamento original
nunca é editado ou apagado, continua existindo como registro histórico imutável.

**Bloqueio central da Decisão #1, implementado e testado**: se `MaterialBatch.quantityAvailable` já
caiu abaixo do que este recebimento contribuiu, produção já consumiu o lote — o estorno é recusado
com uma mensagem que nomeia o número do lote, a(s) Ordem(ns) de Produção que o consumiram e os
produtos gerados, apontando para uma futura correção administrativa especializada (Central de
Administração) em vez de um estorno comum. Sem cascata nesta rodada, exatamente como decidido.

1 rota nova: `POST /api/stock/movements/[id]/reverse` (`estoque:update`, mesma permissão de quem já
ajusta saldo em `/api/stock/adjust` — motivo obrigatório via schema Zod). UI: ação "Estornar
recebimento" na aba Movimentações do Estoque, habilitada só para lançamentos de entrada de compra
ainda não estornados e que não sejam eles mesmos um estorno — abre um diálogo pedindo o motivo
(campo obrigatório, mesma disciplina de `Ajustar Estoque`).

5 testes novos cobrindo exatamente os casos da decisão: reversão simples, reversão com lote
(MaterialBatch decrementado), bloqueio quando já consumido por produção (nomeando a OP no erro),
bloqueio ao tentar estornar de novo, bloqueio ao tentar estornar um estorno.

**Verificação**: tsc limpo, lint 47 (net zero — nenhum hook novo, a UI reaproveita o `loadMovements()`
já existente), 359/359 testes (5 novos), build limpo (rota nova confirmada no manifesto).

## PARTE 9 — Item 2 completo: Estorno de produção (2026-07-27, mesmo dia)

O caso mais arriscado dos 4 mapeados na Parte 2, implementado na mesma rodada em vez de deixado para
o futuro. Só suportado para produto `lotControlled` — única situação em que `ProductBatch` é criado, o
que já garante que só rodadas com rastreabilidade completa podem ser estornadas; para produto sem
controle de lote, não existe hoje como identificar com segurança o que uma rodada específica consumiu
(confirmado lendo `produceWithTx()`: sem lote no produto acabado, o `BatchConsumption` da rodada nunca
é persistido — mesmo que a matéria-prima consumida seja lotControlled).

Schema (aditivo): `ProductBatch` ganha `reversedAt`.

`productionOrderService.reverseProduction(productBatchId, reason, userId)` reverte a rodada inteira
numa transação: restaura `Product.stockQty` do produto acabado, restaura cada matéria-prima/
subconjunto consumido (via `consumedFrom`, incluindo o caso de subconjunto lotControlled testado
separadamente), apaga os registros de consumo desta rodada (o consumo em si deixou de existir — evita
que qualquer cálculo futuro de disponibilidade some uma consumição fantasma) e recua
`quantityCompleted`/`status` da OP.

**Bloqueio central, testado**: recusa quando o lote já foi consumido como componente de outra OP,
nomeando a(s) OP(s) e o(s) produto(s) gerados, apontando para a mesma correção administrativa
especializada futura da Parte 8. **Limitação conhecida e documentada de propósito, não escondida**:
não existe hoje rastreabilidade de que o produto acabado foi vendido/expedido por lote (Faturamento/
Expedição ainda não controlam quantidade por lote) — a única defesa possível além do bloqueio acima é
recusar quando o saldo agregado do produto já não comporta a reversão, o que pega o caso mais grave
(nada sobrou) mas não garante com certeza absoluta que o saldo suficiente pertence exatamente a esta
rodada. **Decisão deliberada de escopo**: reserva de material NÃO é restaurada nesta primeira versão —
é um construto de planejamento, não uma trilha de estoque físico, então deixá-la como está é uma
imprecisão de planejamento menor, nunca um risco de corrupção de dado.

Rota nova: `POST /api/production-orders/batches/[batchId]/reverse` (`producao:update`) + `GET /api/
production-orders/[id]/batches` (lista os lotes produzidos — existia desde o ADR-013, nunca exposta).
UI: nova seção "Lotes Produzidos" no detalhe da OP, com ação "Estornar" por rodada (motivo obrigatório)
— e o texto de confirmação de "Registrar produção" corrigido (dizia "não pode ser desfeito pelo
sistema", o que deixou de ser verdade a partir desta implementação).

5 testes novos: reversão simples, reversão com subconjunto lotControlled (o caminho mais complexo do
código), bloqueio quando consumido por outra OP (nomeando a OP no erro), bloqueio de estorno duplo,
bloqueio por saldo insuficiente.

**Verificação**: tsc limpo, lint 48 (+1 real, mesmo padrão de fetch-em-efeito já aceito — o novo
componente `production-batches-section.tsx`), 364/364 testes (5 novos), build limpo (2 rotas novas
confirmadas no manifesto). **Item 2 da sequência (estorno) agora completo — os dois casos mapeados no
levantamento (recebimento de compra e produção) estão implementados e testados.**

## PARTE 10 — Item 3 da sequência implementado: MRP exposto (2026-07-28)

Confirmando o diagnóstico da Parte 2 (item 11): o motor já era sofisticado (netting multinível,
reserva/estoque livre/em produção/em compras, decisão compra-vs-produção, aprovação humana já
desenhada) — faltavam só as 3 lacunas de cálculo e a exposição por rota/UI, nunca reconstruir o motor.

**As 3 lacunas de cálculo, em `mrp-calculation.service.ts`**:
1. **Estoque mínimo/segurança**: `minStockQty` (material e produto) agora soma à necessidade bruta
   antes do cálculo da falta — `shortfall = max(0, needed + minStockQty - reservedQty - available)`,
   em vez de ignorar o campo por completo.
2. **Prazo do fornecedor**: `leadTimeDays` — **achado real durante a implementação**: o campo não
   existe no model `Material` (só em `Supplier`, `SupplierMaterial` e `PurchaseOrderItem`); o motor
   originalmente escrito nesta rodada lia `material.leadTimeDays` via um cast `as {...}` que mascarava
   o erro de tipo — o campo vinha sempre `undefined` do Prisma, e `undefined > 0` é `false` em JS, então
   `leadTimeDays` silenciosamente virava `null` para todo material, nunca disparando o cálculo de
   `suggestedOrderByDate`. Corrigido antes de qualquer commit: o prazo agora vem do mesmo
   `SupplierMaterial` preferencial já consultado para `supplierId`/`supplierNameSnapshot` (`isPreferred:
   true`), de onde o campo realmente existe. Coberto por teste (cenário 12 de `mrp-calculation.test.ts`
   força `leadTimeDays: 10` no fornecedor preferencial e confirma que a sugestão o carrega).
3. **Data de ruptura**: `neededByDate` (a mais cedo entre as OPs de origem que já têm `dueDate`
   definido — nunca uma previsão estatística de consumo, que o sistema não tem dado para sustentar) e
   `suggestedOrderByDate` (`neededByDate - leadTimeDays`, só para sugestões de compra com ambos
   definidos), com `isLate` sinalizando quando essa data já passou e a sugestão ainda está pendente.

**Schema (aditivo)**: `MrpSuggestion` ganha `minStockQty`, `leadTimeDays`, `suggestedOrderByDate`,
`isLate` — e passa a **popular de verdade** `neededByDate`, coluna que já existia desde uma fase
anterior mas nunca era escrita por `mrp-run.repository.ts persist()` (mesmo padrão do achado de
Faturamento na Parte 7: campo pronto no schema, nunca conectado).

**Exposição** — primeira vez que o MRP tem qualquer rota de API:
- `POST /api/mrp/runs` (`producao:update`) — dispara uma execução via `mrpExecutionService.run()`.
- `GET /api/mrp/suggestions` (autenticado) — lista sugestões pendentes de TODAS as execuções já
  rodadas, não só a última (mesmo critério do widget `producao.sugestoes-mrp-por-status` do Dashboard).
- `POST /api/mrp/suggestions/[id]/approve` e `.../dismiss` (`producao:update`) — reexpõem
  `mrpSuggestionService.approve()`/`dismiss()`, que já existiam e já eram testados desde a Fase 7
  (ADR-009), só sem nenhuma forma de chamá-los.

**UI**: nova aba "MRP (Sugestões)" na página de Produção (`Tabs`, mesmo padrão já usado em
Estoque/Financeiro/Orçamentos), com botão "Rodar MRP" e tabela das sugestões pendentes — item, tipo
(comprar/produzir), necessário, disponível, estoque mínimo, falta, fornecedor, prazo, necessário até,
comprar até, e um badge "Atrasado" quando `isLate`. Ação "Aprovar" fica desabilitada para sugestões de
produção, refletindo o bloqueio já existente em `mrpSuggestionService.approve()` ("sugestões de
produção ainda não têm destino automatizado") em vez de esconder ou mentir sobre a capacidade real.

**Fora de escopo, deliberado** (mesmo diagnóstico da Parte 2): sugestão de transferência entre
depósitos (não existe o conceito de múltiplos depósitos no schema), scheduler automático (a aprovação
humana continua sendo a única forma de uma sugestão virar Requisição), destino automatizado para
sugestões de produção (segue exigindo criação manual da OP).

9 testes novos (4 em `mrp-calculation.test.ts` cobrindo `minStockQty`/`neededByDate`/
`suggestedOrderByDate`/`isLate` isoladamente na função pura, 1 em `mrp-execution.test.ts` confirmando
que os 5 campos realmente persistem via `mrpRunRepository.persist()`).

**Verificação**: tsc limpo, lint 48→49 (+1 real, mesmo padrão de fetch-em-efeito já aceito nas Partes
8/9 — o novo componente `mrp-section.tsx`), 369/369 testes (9 novos), build limpo (4 rotas novas
confirmadas no manifesto: `/api/mrp/runs`, `/api/mrp/suggestions`, `/api/mrp/suggestions/[id]/approve`,
`/api/mrp/suggestions/[id]/dismiss`). **Item 3 da sequência (MRP) completo.**

## Conclusão

Esta rodada mudou uma suposição importante: vários itens que pareciam "faltando" no pedido original já
têm boa parte da engenharia pronta e só nunca foram conectados — Faturamento foi o caso mais gritante
(existia, testado, zero rota), seguido por MRP (motor sofisticado, zero UI, Parte 10) e BOM formal
(quase completo). É exatamente por isso que a sequência de implementação real (Parte 6) prioriza esses
três primeiro, à frente inclusive de itens que apareciam mais cedo na proposta original. As 6 decisões
pendentes foram todas resolvidas (Parte 5), e os itens 1 (Faturamento, Parte 7), 2 (Estorno —
recebimento de compra e produção, Partes 8 e 9) e 3 (MRP exposto, Parte 10) da sequência já estão
completos e testados, incluindo o caso mais arriscado de todo o levantamento (estorno de produção) e um
bug real de tipo encontrado e corrigido antes do commit (`leadTimeDays` nunca lido de verdade). Próximo
passo: item 4 da Parte 6 — completar a BOM formal.
