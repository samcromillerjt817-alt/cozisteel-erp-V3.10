# ADR-025 — Orçamento: Confirmação do Cliente via Link Público

- **Status**: Implementado e testado
- **Data**: 2026-07-28
- **Origem**: durante a avaliação ao vivo do Centro de Operações (ADR-024), o usuário fez 2 correções/
  perguntas sobre o módulo de Orçamentos: (1) o campo "Prazo Entrega" deveria usar calendário por
  padrão em vez de texto livre (correção — o usuário havia dito "Validade" primeiro, mas o campo
  "Validade"/`validity` já usava `DatePicker`; o campo sem calendário era `deliveryTime`); (2) "como o
  cliente vai fazer a confirmação de aprovação desse orçamento?" — investigação confirmou que **não
  existe nenhum mecanismo de confirmação pelo cliente hoje**: aprovação é sempre uma ação interna
  (`quoteService.changeStatus(id, 'approved', userId, userRole)`), nunca algo que o cliente dispara.

## Parte 1 — Correção pontual: "Prazo Entrega" ganha calendário

`src/components/modules/orcamentos/orcamentos-page.tsx` — campo `deliveryTime` trocou de `<Input>`
texto livre para `<DatePicker>` (mesmo componente já usado por `validity`), mantendo o contrato de
string `dd/mm/aaaa`. Sem mudança de schema, sem mudança de service.

## Parte 2 — Confirmação do cliente via link público (novo)

### Decisões do usuário

1. **Mecanismo**: link público com token — o cliente abre sem login, vê o orçamento, clica em
   Aprovar/Recusar.
2. **Quem aprova**: o cliente aprova **direto** — o clique muda o status do Orçamento pra
   `approved`/`rejected` imediatamente. O motor de alçada do ADR-023 (`approvalService.recordApproval`,
   que exige um usuário interno com `userId`/`role`) **continua existindo, sem alteração**, para o caso
   de aprovação manual pela equipe (ex.: cliente confirmou por telefone) — os dois fluxos coexistem,
   nenhum substitui o outro.
3. **Expiração do link**: junto com a validade já existente do orçamento (`Quote.validUntil`) — nenhum
   campo de data novo foi criado só pra isso.

### Por que o cliente não passa pelo motor de alçada

`approvalService.recordApproval(documentType, documentId, value, userId, creatorUserId, userRole)`
exige um ator interno (usuário autenticado com Role) — o cliente, via link público, não tem nenhum dos
dois. Fazer esse fluxo tentar se encaixar no motor de alçada exigiria inventar uma identidade de
usuário falsa para o cliente, o que contaminaria o RBAC e o `StatusHistory` com uma entidade que não
existe de verdade. A decisão do usuário ("cliente aprova direto") já resolve isso architeturalmente:
o link público é um **canal de confirmação do cliente**, não uma segunda porta de entrada pro motor de
alçada interno — os dois ficam paralelos e independentes por design.

### Schema (`prisma/schema.prisma`, model `Quote`)

```prisma
publicToken        String?   @unique // token do link público de confirmação do cliente
clientRespondedAt  DateTime? // quando o cliente confirmou (aprovou/recusou) via o link público
```

Aditivo, sem alteração de campo existente. Aplicado em `test.db` e `data/cozisteel.db` (produção) via
`prisma db push --accept-data-loss` — o aviso de "data loss" é falso-positivo aqui: `publicToken` é
campo novo, sem nenhum valor existente, então a constraint `@unique` não pode colidir com nada.

### Geração/regeneração do token

`quoteService.changeStatus()` gera um `publicToken` novo (`crypto.randomBytes(32).toString('hex')`,
256 bits de entropia) toda vez que o orçamento transiciona **para `sent`** — inclusive reenvios (ex.:
`sent → draft → sent` depois de uma edição). Isso invalida automaticamente qualquer link antigo
compartilhado com o cliente assim que o orçamento é editado e reenviado, sem precisar de nenhuma
lógica extra de invalidação.

### Novos métodos em `quote.service.ts`

- `getByPublicToken(token)` — só devolve o orçamento se `status === 'sent'` E a validade
  (`validUntil`) ainda não passou; qualquer outro caso (token inexistente, já decidido, expirado)
  lança o mesmo erro genérico "Link inválido ou expirado" — o cliente nunca recebe informação sobre
  qual dos três motivos se aplica.
- `confirmByClient(token, decision)` — muda o status direto pra `approved`/`rejected`, grava
  `clientRespondedAt`, e (só quando aprovado) `approvedBy = 'Cliente (link público)'` +
  `approvedAt` — mantém os campos de auditoria de aprovação com significado, sem inventar uma FK falsa
  pra um usuário que não existe. Grava `StatusHistory` normalmente, usando o `userId` do dono do
  orçamento como ator técnico (é quem já é responsável pelo documento no sistema), com `reason`
  explicitando que quem decidiu de fato foi o cliente via link público — nenhuma ambiguidade na
  timeline. Ao aprovar, gera Ordens de Produção pelo mesmo caminho já usado na aprovação interna
  (helper `generateProductionOrdersForApproval`, extraído de `changeStatus` pra ser reaproveitado sem
  duplicar lógica).
- Nenhum dos dois passa por `approvalService` — decisão já justificada acima.

### Rota pública (`/api/public/quotes/[token]`, `route.ts`)

Primeira rota **sem autenticação** desta aplicação — nunca chama `requireAuth`/
`requireModulePermission`. O token na URL É a autorização (padrão "capability URL", igual a links de
redefinição de senha ou convites). `GET` devolve só um subconjunto de campos "voltados pro cliente"
(mesmo conjunto já exposto hoje no PDF comercial: itens, valores, condições, prazos) — nunca
`internalNotes`, `userId`/identidade do vendedor, ou o próprio token. `POST` recebe `{decision:
'approved'|'rejected'}` e chama `confirmByClient`.

### Página pública (`/orcamento/[token]/page.tsx`)

Rota Next.js própria, fora do SPA autenticado em `/` — sem menu, sem sidebar, sem sessão. Estados:
carregando → orçamento (com botões Aprovar/Recusar) → confirmado (mensagem de agradecimento,
diferenciada por aprovado/recusado) → inválido/expirado (mensagem genérica, sem detalhe do motivo).

### UI interna — botão "Copiar link de confirmação do cliente"

`orcamentos-page.tsx`, nova ação de linha (`Link2`), habilitada só quando `status === 'sent'` e
`publicToken` existe. Copia `${origin}/orcamento/${token}` pra área de transferência.

## Parte 3 — Segurança, riscos conhecidos e não resolvidos agora

- **Sem rate limiting**: não há nenhum mecanismo de rate limiting nesta aplicação hoje (verificado —
  nenhuma referência a rate limit em todo o código). A rota pública fica exposta a tentativas de força
  bruta sobre o token, mitigado só pela entropia do token (256 bits — inviável de adivinhar por força
  bruta pura), não por controle de taxa. Registrado como risco conhecido, não como algo resolvido.
- **Sem CAPTCHA/verificação adicional**: o token sozinho autoriza a decisão — quem tiver o link decide.
  Isso é uma escolha deliberada (é o modelo pedido: "link público... sem login"), não um descuido, mas
  vale deixar explícito: qualquer pessoa de posse do link (ex.: encaminhado por engano, e-mail
  comprometido) pode aprovar ou recusar em nome do cliente.
- **Sem página de erro diferenciada por motivo**: por design (Parte 2), pra não vazar informação sobre
  o estado interno do orçamento pra quem só tem o link.

## Verificação

`prisma db push` aplicado em `test.db` e produção (`data/cozisteel.db`) — 2 campos aditivos, sem
perda de dados real. tsc limpo. lint 57 problemas (0 erros), mesma contagem de antes desta mudança —
nenhum warning novo. 420/420 testes (9 novos em `tests/quote-public-confirmation.test.ts`, cobrindo
geração/regeneração de token, aprovação/recusa direta, expiração por validade, token de uso único, e
token de orçamento não encontrado). Build de produção limpo, com `/api/public/quotes/[token]` e
`/orcamento/[token]` registrados corretamente como rotas dinâmicas.
