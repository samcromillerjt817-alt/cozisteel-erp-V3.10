# ADR-010 — Aprovação de Compras (Fase 8)

- **Status**: **Implementado e verificado — Fase 8 concluída.** Máquina de estados, `approvedBy`/
  `approvedAt` e testes completos (ver "Implementação" ao final).
- **Data**: 2026-07-09
- **Depende de**: [ADR-002 — Máquina de Estados](./ADR-002-maquina-de-estados.md) (`ALLOWED_TRANSITIONS`/
  `checkTransition()`/`StatusHistory`, reaproveitados sem mudança de motor); [ADR-009 — Requisição
  Corporativa](./ADR-009-requisicao-corporativa.md) (`createFromRequisition()` é o único ponto de
  criação de `PurchaseOrder` hoje, e é quem esta fase precisa não quebrar)
- **Escopo explicitamente fora desta fase** (por instrução do usuário): motor de aprovação genérico
  (múltiplos aprovadores, limite por valor, aprovação por departamento/centro de custo); qualquer
  integração com Financeiro (Contas a Pagar, compromissos, custos) — só mapeamento nesta fase; nenhuma
  rota/tela nova.

## Contexto

A Fase 7 tornou a Requisição um documento corporativo com um gate de aprovação já existente
(`draft→sent→approved→ordered`). O Pedido de Compra, por outro lado, ainda vai de `draft` direto para
`sent` — qualquer usuário com permissão de `compras` pode mandar um pedido ao fornecedor sem nenhuma
segunda validação. A Fase 8 fecha essa lacuna, aplicando ao Pedido de Compra o mesmo padrão de aprovação
que a Requisição já usa (ADR-002), sem inventar um motor novo.

## 1. Estado atual do Pedido de Compra — levantamento

**Estados hoje** (6): `draft`, `sent`, `confirmed`, `partially_received`, `received`, `cancelled`.
`ALLOWED_TRANSITIONS` (`PurchaseOrderService`):
```
draft: [sent, cancelled]
sent: [confirmed, cancelled]
confirmed: [cancelled]
partially_received: [cancelled]
received: []
cancelled: []
```
`partially_received`/`received` só são alcançados via `receive()` (rota dedicada `/receive`,
quantidade por item) — `changeStatus()` os rejeita explicitamente como destino (`VALID_STATUSES` exclui
os dois de propósito, comentário já existente no código: "eles só resultam do endpoint dedicado de
recebimento").

**Quem cria um Pedido de Compra**: **ninguém, manualmente** — confirmado por varredura completa das
rotas (`src/app/api/purchase-orders/`): existe `GET` (lista), `GET/PUT/DELETE /[id]`, `PATCH /[id]/status`,
`POST /[id]/receive` — **nenhuma rota `POST /` de criação**. O único ponto de criação no código inteiro é
`PurchaseOrderService.createFromRequisition()`.

**Quando nasce a partir de Requisição**: automaticamente, via evento de domínio
`requisicao.aprovada_para_compra` (ADR-003) — disparado quando uma Requisição avança para `"ordered"`
(ADR-009: hoje, só o `quantityToPurchase` de cada item vira linha de Pedido de Compra). Um Pedido de
Compra é criado **por fornecedor vencedor** (agrupamento), sempre com `status: "draft"`.

**Quando pode ser enviado ao fornecedor**: hoje, imediatamente — `draft → sent` é uma transição de mão
única, sem nenhuma validação além da máquina de estados genérica.

**Quando ocorre recebimento**: via `PurchaseOrderService.receive()` → `PurchaseOrderRepository.
receiveItems()` (transacional: atualiza quantidade recebida por item, dá entrada em
`Material.stockQty`, gera `StockMovement` tipo `IN`, recalcula o status do pedido para
`partially_received` ou `received` conforme a cobertura). **Só este caminho movimenta estoque** — nenhum
outro método do domínio de Compras toca `StockMovement`.

**Serviços e rotas que dependem dele**: `PurchaseOrderService` (list/getById/update/delete/changeStatus/
receive/createFromRequisition), `PurchaseOrderRepository`, as 5 rotas já citadas, e
`RequisitionService.changeStatus()` (produtor do evento que cria o pedido — ADR-009).

## 2. Máquina de estados proposta

### Semântica dos estados — registrado explicitamente por instrução do usuário

- **`approved`** significa **"o Pedido de Compra foi autorizado internamente"** — o fornecedor ainda não
  sabe de nada. É uma decisão que acontece inteiramente dentro do Cozisteel.
- **`sent`** significa **"o Pedido foi efetivamente enviado ao fornecedor"** — a ação externa de fato.

Essa separação é o motivo de existir de toda esta fase, e é permanente: `approved` e `sent` nunca devem
se confundir ou colapsar num só, mesmo em fases futuras (ex.: uma eventual integração de envio automático
por e-mail dispararia a partir de `approved → sent`, nunca pularia `approved`).

**Confirmado com o usuário**: a ação hoje existente para `draft → sent` é reaproveitada, só muda o
destino — `draft → pending_approval` (não há criação manual de Pedido de Compra hoje, então `draft`
nunca é "vivido" de fato: nasce em `draft` e a mesma ação que antes mandava ao fornecedor agora submete
para aprovação). Zero mudança na criação (`createFromRequisition` continua gravando `status: "draft"`,
confirmado novamente pelo usuário — **nenhum Pedido de Compra nasce aprovado**).

**Confirmado com o usuário**: `pending_approval` pode voltar para `draft` (rejeição = volta para edição,
não cancelamento obrigatório) — mesmo precedente já em produção na Requisição (`sent → draft`
reversível, ADR-002).

### Estados: o que já existe, o que é novo

| Estado | Situação |
|---|---|
| `draft` | Já existe — sem mudança |
| `pending_approval` | **Novo** |
| `approved` | **Novo** |
| `sent` | Já existe — agora só alcançável a partir de `approved`, nunca mais direto de `draft` |
| `confirmed` | Já existe — sem mudança |
| `partially_received` | Já existe — sem mudança (só via `/receive`) |
| `received` | Já existe — sem mudança (só via `/receive`) |
| `cancelled` | Já existe — sem mudança (terminal) |

### `ALLOWED_TRANSITIONS` proposto

```
draft:              [pending_approval, cancelled]
pending_approval:   [approved, draft, cancelled]   // draft = rejeitado, volta para edição
approved:            [sent, cancelled]              // sem volta — aprovado é aprovado; para mudar, cancela e a Requisição gera outro
sent:                [confirmed, cancelled]          // inalterado
confirmed:           [cancelled]                     // inalterado
partially_received:  [cancelled]                     // inalterado
received:            []                              // inalterado, terminal
cancelled:           []                               // inalterado, terminal
```

**Transição bloqueada que hoje é permitida**: `draft → sent` direto deixa de existir — é a mudança de
comportamento central desta fase (por design, não um bug). Qualquer PO em `draft` precisa passar por
`pending_approval → approved` antes de `sent`.

**Mantido, sem mudança**: `StatusHistory` (já grava toda transição desde a Fase 2.1, sem precisar de
nenhuma alteração — `entityType: "purchase_order"` já existe no discriminador); `checkTransition()`
reaproveitado como está; nenhuma regra de negócio nova nas transições que já existem
(`sent→confirmed→...→received`, recebimento parcial, cancelamento).

## 3. Regra de aprovação

**Confirmado, seguindo a tendência do usuário**: nenhum motor de aprovação genérico nesta fase. Só
`draft → pending_approval → approved`, um único aprovador (qualquer usuário com permissão de `compras`,
mesma granularidade de hoje — nenhuma restrição nova tipo "quem aprova não pode ser quem criou").
`PurchaseOrder` ganha `approvedBy`/`approvedAt` (`String?`/`DateTime?`), **mirror exato** do padrão já
usado por `Requisition` desde antes desta fase — gravados na transição para `approved`, mesmo formato,
mesma convenção.

**Achado que vale registrar, não decidir agora**: o Princípio 9 do ADR-001 ("Parametrização antes de
Código") já cita "aprovação obrigatória de compra" como exemplo de regra que deveria ser configurável via
`SystemSetting`, não fixa em código. Esta fase **fixa a aprovação como sempre obrigatória** (hardcoded),
seguindo a tendência explícita do usuário de não construir um motor genérico ainda — isso é consistente
com o Princípio 9 no sentido de que a parametrização fica para quando houver um caso de uso real (mais
de uma instalação/empresa com necessidades diferentes), não uma antecipação especulativa. Se esse
cenário aparecer, transformar em `SystemSetting` não exige mudar a máquina de estados — só teria que
decidir se a transição pending_approval→approved pode ser pulada quando o setting estiver desligado.

**Limite por valor, aprovação por departamento, centro de custo, múltiplos aprovadores**: fora do escopo,
confirmados como "fase futura" pelo usuário — **registrado explicitamente**: se algum dia isso for
necessário, será tratado como uma funcionalidade nova a ser especificada em seu próprio ADR, nunca como
uma alteração retroativa da arquitetura desta fase.

## 4. Integração com Requisição

Fluxo confirmado:
```
Requisição aprovada (status → "ordered", ADR-009)
  ↓
Pedido de Compra criado (status: "draft" — createFromRequisition(), sem mudança)
  ↓
[ação humana: submeter para aprovação]
  ↓
Aguardando aprovação (pending_approval)
  ↓
[ação humana: aprovar]
  ↓
Aprovado (approved)
  ↓
[ação humana: enviar]
  ↓
Enviado ao fornecedor (sent)
```
Confirmado: **nenhum Pedido de Compra nasce aprovado** — `createFromRequisition()` não muda (continua
`status: "draft"`), e a única forma de chegar a `approved` é passando pela transição explícita, nunca um
efeito colateral da criação.

## 5. Estoque — reconfirmado, sem mudança

- **Aprovação não movimenta estoque** — `approved` é só uma mudança de `status` + `approvedBy`/`approvedAt`.
- **Envio ao fornecedor não movimenta estoque** — `sent` continua só gravando `sentAt`, como hoje.
- **Confirmação também não movimenta estoque** — `confirmed` continua só gravando `confirmedAt`, como hoje.
- **Só recebimento gera entrada** — `receive()`/`receiveItems()` são os únicos pontos que tocam
  `Material.stockQty`/`StockMovement`, e esta fase não toca esse código de jeito nenhum. Verificado nos
  testes de implementação (seção "Implementação" abaixo): estoque confirmado intocado em `approved`,
  `sent` e `confirmed`, só mudando no `receive()` final.

## 6. Financeiro futuro — mapeamento (não implementar)

**Registrado explicitamente por instrução do usuário**: `approved` representa **só autorização
administrativa interna** — nenhum compromisso financeiro nasce nessa transição. O Financeiro (Fase 12,
quando existir) continuará reagindo exclusivamente aos eventos que já estavam mapeados para ele, nunca a
`approved` em si.

Pontos identificados onde o Pedido de Compra deverá futuramente alimentar o Financeiro (Fase 12), sem
nenhuma implementação agora:
- **`confirmed`**: o fornecedor confirmou o pedido — momento em que o compromisso financeiro se torna
  firme (análogo a um contrato assinado); candidato a gerar uma prévia/compromisso em Contas a Pagar no
  futuro.
- **`received`/`partially_received`**: recebimento fiscal é, na maioria dos ERPs, o gatilho real de
  Contas a Pagar (nota fiscal recebida = obrigação de pagar) — já é exatamente o "Pedido de Compra →
  Recebimento Fiscal → Contas a Pagar" citado no roadmap original da Fase 12.
- **Custo**: `PurchaseOrderItem.unitPrice`/`total` já alimentam `Material.costPrice` hoje (fora desta
  fase) — uma futura Fase de custeio real usaria o valor efetivamente recebido, não só o cotado.
- **`financialReferenceId`**: já catalogado no [ADR-008](./ADR-008-infraestrutura-financeira.md) como
  candidato para `PurchaseOrder`, condicionado a **dois** gatilhos simultâneos (domínio real de Centro de
  Custos existir **e** uma fase tocar a entidade). Esta fase satisfaz o segundo gatilho, mas não o
  primeiro (`CostCenter` ainda não existe) — **continua fora do escopo**, mesma decisão já tomada para
  `Requisition` na Fase 7.

## 7. Schema

### `PurchaseOrder`
- `status` — comentário atualizado para refletir os 8 valores; nenhuma migração de dado necessária
  (nenhum PO existente está em `draft` esperando virar `sent` no meio de uma migração — o valor de
  `status` de cada linha existente continua válido, já que todos os 6 estados atuais permanecem).
- `approvedBy String?`, `approvedAt DateTime?` — novos, mirror de `Requisition`.

### Nenhuma tabela nova necessária

Diferente da Fase 6 (MRP) e Fase 7 (Requisição), esta fase não introduz nenhuma entidade — só amplia o
mapa de transições de uma entidade já existente e acrescenta 2 campos, seguindo exatamente o padrão já
estabelecido por `Requisition.approvedBy`/`approvedAt`.

### Impacto

- **Baixo risco de schema**: 2 colunas opcionais novas, nenhuma mudança de tipo, nenhuma constraint
  relaxada ou apertada.
- **Mudança de comportamento real e deliberada**: a transição `draft → sent` direta deixa de ser aceita
  — qualquer código ou teste que dependa dela precisa ser atualizado (nenhum encontrado na varredura
  atual: nenhuma rota/serviço externo ao próprio `PurchaseOrderService` invoca `changeStatus` com esse
  salto).
- **Sem impacto em Estoque/Produção** — confirmado na seção 5.

## 8. API/UI

Confirmado: mesma disciplina de todas as fases anteriores — Schema → Repository → Service → Testes →
(API → UI em fase futura). Nenhuma rota nova, nenhuma tela nesta fase — a rota `PATCH /[id]/status` já
existente aceita os novos valores de destino sem precisar de nenhuma mudança de contrato (só o `body`
passa a poder conter `"pending_approval"`/`"approved"` como `status`, além dos já aceitos).

## Plano de implementação em subetapas

1. **Subetapa 1 — Schema e Máquina de Estados**: `PurchaseOrder.approvedBy`/`approvedAt`; novo
   `ALLOWED_TRANSITIONS` em `PurchaseOrderService` (`VALID_STATUSES` ganha `pending_approval`/`approved`).
   Testes cobrindo: transição bloqueada (`draft→sent` direto agora rejeitado); caminho completo
   `draft→pending_approval→approved→sent→confirmed→...`; rejeição (`pending_approval→draft`); nenhuma
   mudança observável em `receive()`/Estoque.
2. Nenhuma outra subetapa prevista — ao contrário das Fases 6/7, esta fase é pequena o suficiente (sem
   entidade nova, sem motor de cálculo) para caber numa única subetapa. Se a implementação revelar
   necessidade de dividir, o plano é revisado antes de codar.

## Implementação (2026-07-09)

**Concluída e verificada — Fase 8 completa**, numa única subetapa como previsto.

- `prisma/schema.prisma`: `PurchaseOrder.approvedBy`/`approvedAt` (novos); comentário de `status`
  atualizado para os 8 valores.
- `PurchaseOrderService`: `ALLOWED_TRANSITIONS` reescrito exatamente como especificado (seção 2);
  `VALID_STATUSES` ganha `pending_approval`/`approved`; `changeStatus()` grava `approvedBy`/`approvedAt`
  na transição para `approved`, mesmo padrão de `sentAt`/`confirmedAt`/`cancelledAt` já existentes.
  Nenhuma outra linha de código do domínio de Compras foi tocada — `receive()`/`receiveItems()`,
  `createFromRequisition()` e todo o resto permanecem exatamente como estavam.

**Testes** (`tests/purchase-order-approval.test.ts`, 10 casos, cobrindo exatamente a lista pedida):
criação sempre em `draft`; `draft→pending_approval`; `pending_approval→approved` (com `approvedBy`/
`approvedAt` gravados e `sentAt` confirmado `null` — aprovado ≠ enviado); `pending_approval→draft`
(rejeição); `approved→sent`; transições inválidas rejeitadas (`draft→sent` direto, `draft→approved`
direto, `approved→pending_approval`, `sent→approved`); cancelamento a partir de todo estado não-terminal
(4 cenários); `StatusHistory` gravando `fromStatus`/`toStatus` corretos; `AuditLog` com `beforeValue`/
`afterValue`; e um teste de ponta a ponta cobrindo compatibilidade total com Requisição (ADR-009) e
Recebimento — confirma estoque intocado em `approved`/`sent`/`confirmed`, e só alterado no `receive()`
final, com o `StockMovement` `IN` correto. **87/87 testes passando no total do projeto.** `tsc --noEmit`
confirma o mesmo erro de ambiente pré-existente, não relacionado a este trabalho.

## Decisões validadas com o usuário (resumo)

| Decisão | Escolha |
|---|---|
| Como alcançar `pending_approval` | Reaproveita a ação hoje existente (`draft→sent`), só muda o destino |
| Rejeição de `pending_approval` | Pode voltar para `draft` (mesmo precedente da Requisição) |
| Motor de aprovação | Mínimo — só `draft→pending_approval→approved`, sem múltiplos aprovadores/limite por valor/departamento |
| `SystemSetting` para aprovação opcional | Não implementado agora — hardcoded obrigatório, achado registrado para uma fase futura se necessário |
| Financeiro | Só mapeado (seção 6), nada implementado |
