# ADR-021 — Central de Administração do Sistema: Levantamento e Implementação

- **Status**: **Implementada e em produção — 2026-07-16.** As 4 subetapas da Parte 5 concluídas no
  mesmo dia do levantamento: conserto do sistema de patch, tela de Diagnóstico/Saúde, Console SQL
  somente-leitura, e biblioteca de receitas (3 iniciais). Verificado ao vivo contra o incidente real
  encontrado na auditoria (Parte 2.2): a tela de Diagnóstico detectou corretamente o `status.json`
  preso desde 2026-07-09 (~12.150 min), e a receita de reconciliação encontrou 2 backups órfãos reais
  em disco. Nenhuma correção foi aplicada de fato ainda sem confirmação explícita do usuário — só a
  ferramenta foi verificada funcionando.
- **Data**: 2026-07-16
- **Depende de**: nenhuma fase numerada do roadmap original (spec de 16 seções) — iniciativa nova,
  proposta diretamente pelo usuário após o roadmap original ser concluído (ver
  [ADR-020](./ADR-020-mao-de-obra-overhead-levantamento.md)). Toca infraestrutura já existente:
  `AuditLog` (Fase 3, ADR-003), `PatchLog`/`scripts/apply-patch.sh` (pré-existente ao roadmap V4), RBAC
  (`sistema`/`auditoria` já são módulos próprios desde o início do projeto).

---

## PARTE 1 — Contexto

O usuário observou que "Administração do Sistema" hoje é, na prática, só duas coisas — gerenciar
permissões de usuários e aplicar patches — e pediu uma auditoria real do mecanismo de patch, do qual
desconfiava. Pediu que essa área evolua para uma central completa de **operações, manutenção,
diagnóstico e recuperação**, incluindo a capacidade de intervir de forma controlada no banco de dados
para corrigir inconsistências, com auditoria/validação/segurança adequadas.

## PARTE 2 — O que existe hoje (auditoria)

### 2.1 Administração hoje, por tela

| Tela | O que faz | O que NÃO faz |
|---|---|---|
| Usuários | CRUD de usuário + papel (RBAC) | Nenhuma ação de sistema além de conta/permissão |
| Configurações → Sistema | Mostra versão/data de instalação (leitura); tabela de `AuditLog` com filtro por módulo/ação | Só leitura — nenhuma ação corretiva a partir daqui |
| Configurações → Atualizações | Upload de `.zip`, aplica via `scripts/apply-patch.sh`, histórico de `PatchLog` | Sem log de execução detalhado, sem diagnóstico de saúde do sistema, sem ferramenta de correção de dados |

Nada disponível hoje para: ver saúde do sistema (banco, disco, PM2), diagnosticar inconsistências de
dados, corrigir um registro problemático pela própria aplicação (a única via hoje é acesso direto ao
shell/sqlite3 do servidor — o que este agente vem fazendo o projeto inteiro por falta de alternativa
dentro da aplicação).

### 2.2 Auditoria do sistema de patch — achados reais, não hipotéticos

Encontrados investigando o código (`patch.service.ts`, `scripts/apply-patch.sh`) e os dados reais em
produção (`PatchLog`, `storage/patches/status.json`, `storage/patches/backups/`):

1. **`status.json` pode ficar travado num estado não-terminal para sempre, sem recuperação.**
   Confirmado ao vivo: o arquivo está congelado em `{"state":"rolling_back", ...}` desde
   **2026-07-09**, mais de uma semana atrás — o timestamp do arquivo bate exatamente com essa data. Não
   existe timeout, verificação de "processo ainda vivo", nem qualquer forma de o admin ver "isso está
   travado, não é um patch em andamento de verdade".

2. **O rollback automático pode falhar em registrar a si mesmo — confirmado, não teórico.** Existe um
   par de arquivos de backup (`pre-patch-20260709-013134.db`/`.tar.gz`) provando que um patch foi
   aplicado, falhou, e o rollback automático rodou nessa data. **Não existe NENHUMA linha em `PatchLog`
   para esse evento** — a tabela só tem 2 registros no total (um patch de 2026-07-08 e a correção de
   versão feita nesta sessão hoje). A tela "Histórico de Atualizações", que promete mostrar "todas as
   atualizações aplicadas", tem um buraco exatamente no caso em que o admin mais precisaria ver o que
   aconteceu. Causa provável no código: a função `rollback()` chama `record-patch.mjs` com
   `2>/dev/null || true` — qualquer falha nesse registro é silenciosamente engolida.

3. **Nenhum log de execução persistente do script.** `patch.service.ts` dispara
   `scripts/apply-patch.sh` via `spawn(..., { detached: true, stdio: 'ignore' })` — a saída inteira do
   script (todos os `echo`) vai para lugar nenhum. Fora dos checkpoints explícitos de `write_status`
   (que só registram um estado curto, não o motivo detalhado), não sobra rastro nenhum do que aconteceu
   dentro do script. Se um patch falhar de um jeito que o `trap ERR` não cobre bem, ou mesmo dentro dele,
   não há como diagnosticar depois — nem um arquivo de log, nem uma linha no `AuditLog` geral (que só
   registra ações de módulos de negócio, nunca eventos de patch/sistema).

4. **Parsing de manifesto por regex, não por parser JSON de verdade.** `TO_VERSION`/`TITLE`/
   `DESCRIPTION`/`NEEDS_NPM`/`NEEDS_PRISMA` são extraídos via `grep -oP` contra o texto bruto do
   `patch.json` — funciona para manifestos simples, mas quebra silenciosamente (extrai valor vazio ou
   errado, sem erro nenhum) diante de qualquer variação razoável de JSON (aspas escapadas, campos
   aninhados, quebra de linha dentro de uma string).

**Conclusão da auditoria**: a desconfiança do usuário era procedente. O mecanismo funciona no caminho
feliz (2026-07-08 é prova disso), mas tem lacunas reais de observabilidade e de integridade do próprio
histórico exatamente nos cenários de falha — que é justamente quando um admin mais precisa confiar
nele.

### 2.3 Infraestrutura reaproveitável

- `AuditLog` (Fase 3, ADR-003) já grava `beforeValue`/`afterValue`/IP/user-agent por ação — a base de
  auditoria que qualquer ferramenta de correção de dados precisaria, já existe e já é usada em outros
  módulos. Hoje só cobre ações de negócio (Orçamento, Pedido, etc.), nunca ações de sistema/patch.
- RBAC já trata `sistema` e `auditoria` como módulos **distintos** (não é preciso inventar uma
  permissão nova do zero) — hoje só `admin` tem qualquer acesso a ambos; `manager` tem `sistema: read`
  mas `auditoria: []`. Uma ferramenta de correção de dados poderia (decisão pendente) precisar de uma
  permissão ainda mais restrita que `sistema`/`manage` genérico.
- `scripts/apply-patch.sh` já tem uma disciplina de backup automático + rollback que uma ferramenta de
  correção de dados deveria imitar (nunca alterar sem um snapshot recuperável antes).

---

## PARTE 3 — Opções avaliadas para "intervenção controlada no banco de dados"

Esta é a peça de maior risco do pedido — dar a um humano, pela própria aplicação, o poder de alterar
dado de produção diretamente. Três posturas possíves, bem diferentes em risco/flexibilidade:

### (a) Console SQL genérico (livre, tipo "phpMyAdmin")

Executa qualquer `SELECT`/`UPDATE`/`DELETE` que o admin digitar.
- **Vantagem**: resolve qualquer problema, presente ou futuro, sem precisar prever o caso de uso.
- **Desvantagem**: risco máximo — um erro de digitação pode corromper dado de produção sem nenhuma
  rede de segurança; auditoria de "o que mudou" exigiria capturar o `SELECT` equivalente antes/depois
  de cada `UPDATE` livre, o que é possível mas não trivial de fazer de forma genérica e confiável.
  Prática de mercado geralmente desaconselha expor isso como funcionalidade de produto, mesmo só para
  admin.

### (b) Biblioteca de "receitas" curadas (operações pré-definidas, com preview)

Um catálogo fixo de operações conhecidas e seguras — ex. "reprocessar um lote com status
inconsistente", "destravar um patch preso em estado intermediário", "recalcular custo de um lote
específico", "religar um `StockMovement` órfão ao seu documento de origem". Cada uma roda dentro de uma
transação, com uma tela de **preview** (mostra o antes/depois calculado antes de confirmar) e grava em
`AuditLog` com before/after reais.
- **Vantagem**: seguro por construção — impossível rodar algo fora do que foi pensado e testado;
  auditoria trivial (a receita já sabe o que está mudando); dá pra testar cada receita como qualquer
  Service do projeto.
- **Desvantagem**: só cobre o que foi antecipado — um problema novo, imprevisto, ainda exige
  intervenção manual via shell (como hoje).

### (c) Híbrido — receitas curadas + leitura ampla (sem escrita livre)

(b) para correção, mais uma tela de **consulta** ampla e somente-leitura (rodar qualquer `SELECT` para
diagnóstico, nunca `UPDATE`/`DELETE` livre) — cobre o "preciso entender o que está acontecendo" sem
abrir a porta pra escrita livre.

**Recomendação técnica preliminar**: (c). Resolve a maior fatia real da dor (visibilidade + as
correções mais comuns) sem herdar o risco de um console de escrita livre. Fica pendente como decisão
do usuário, não uma escolha já feita.

---

## PARTE 4 — Decisões (RESOLVIDAS pelo usuário em 2026-07-16)

1. **Postura de intervenção no banco**: **(c) híbrido** — receitas curadas com preview + auditoria,
   mais uma tela de consulta somente-leitura. Nunca escrita livre.
2. **Receitas da primeira leva** (propostas a partir da própria auditoria desta rodada, ver Parte 5.4):
   destravar `status.json` de patch preso; reconstruir uma linha de `PatchLog` ausente a partir de um
   backup órfão em disco; recalcular custo de um lote de produção (`materialCost`/`laborCost`/
   `overheadCost`, reaproveitando `CostingService` já existente do ADR-020).
3. **Permissão**: **reaproveitar `sistema`/`manage`**, já restrito a `admin` hoje — sem criar uma
   hierarquia nova.
4. **Backup automático antes de qualquer correção**: confirmado como obrigatório (assumido pela escolha
   de (c) acima, que já exige preview + auditoria antes de qualquer aplicação).
5. **Correção do próprio sistema de patch** (achados 2.2.1-2.2.4): **entram nesta mesma rodada**.
6. **Diagnóstico/saúde do sistema**: **entra nesta mesma rodada**.

**Resultado**: rodada única cobrindo as 4 subetapas da Parte 5 — conserto do patch, diagnóstico/saúde,
console de leitura, e biblioteca de receitas com as 3 iniciais acima.

---

## PARTE 5 — Plano de subetapas (proposto, dependente das decisões acima)

1. **Corrigir o sistema de patch** (achados 2.2): log persistente da execução do script (gravar stdout/
   stderr num arquivo em vez de `stdio: 'ignore'`), `record-patch.mjs` chamado de forma que uma falha
   sua NUNCA fique silenciosa (ao menos gravar em `status.json`/log mesmo se o `PatchLog` falhar),
   parsing de manifesto trocado de regex para um parser JSON real, detecção de `status.json` "preso"
   (estado não-terminal há mais de N minutos sem processo correspondente rodando).
2. **Tela de Diagnóstico/Saúde do Sistema**: novo card/aba em Administração — tamanho do banco, espaço
   em disco, status do PM2, alerta se `status.json` estiver preso.
3. **Console de consulta somente-leitura**: nova tela, RBAC próprio, roda `SELECT` livre contra o banco,
   nunca escrita.
4. **Biblioteca de receitas de correção** (se decisão #1 for (b)/(c)): infraestrutura genérica (preview
   + transação + `AuditLog` before/after) mais as receitas da decisão #2.
5. Testes + `graphify update .` + atualização do ADR-001, mesma disciplina de toda subetapa anterior.

Qualquer subetapa que altere schema exige autorização explícita e separada antes de rodar contra o
banco compartilhado — mesma regra permanente do projeto.

---

## PARTE 7 — Resultado da implementação (2026-07-16)

- **Subetapa 1 (patch)**: `scripts/apply-patch.sh` ganhou log persistente (`exec > >(tee -a
  "$LOG_FILE") 2>&1`, grava em `storage/patches/logs/`), `write_status()` passou a incluir `pid`/
  `logFile`; as duas chamadas a `record-patch.mjs` (sucesso e rollback) não engolem mais erro/stderr
  silenciosamente — falha em registrar agora aparece no próprio `status.json` para o usuário ver;
  parsing de manifesto trocado de `grep -oP` para `JSON.parse` de verdade via `node -e`.
- **Subetapa 2**: `SystemDiagnosticsService` (tamanho do banco, `df` do disco, `pm2 jlist`, detecção de
  patch preso por `pid` vivo/morto + idade) + rota `GET /api/system/diagnostics` (`sistema:read`) + aba
  "Diagnóstico". **Verificado ao vivo**: detectou corretamente o incidente real de 2026-07-09 (~12.150
  min preso em "rolling_back", PID não vivo).
- **Subetapa 3**: `AdminQueryService` (só `SELECT`/`WITH`, bloqueia instrução empilhada, envolve em
  `LIMIT 501` para nunca puxar mais que isso do banco) + rota `POST /api/admin/query` (`sistema:manage`)
  + aba "Console SQL". **Bug real pego pelos próprios testes antes de chegar em produção**: SQLite via
  `$queryRawUnsafe` devolve inteiro literal como `BigInt`, que `NextResponse.json()` não serializa —
  corrigido convertendo para `Number` antes de devolver.
- **Subetapa 4**: `AdminRecipesService` com as 3 receitas da Parte 4 (destravar status, reconciliar
  `PatchLog`, recalcular custo de lote) + rotas `GET /api/admin/recipes`,
  `POST /api/admin/recipes/[id]/preview`, `POST /api/admin/recipes/[id]/apply` (`sistema:manage`) + aba
  "Correções". **Verificado ao vivo**: a receita de reconciliação encontrou 2 backups órfãos reais em
  disco (`pre-patch-20260708-193328.tar.gz` e `pre-patch-20260709-013134.tar.gz`, ambos versão 3.0.0 no
  backup) — nenhum aplicado ainda, aguardando decisão do usuário.
- **Permissão**: nenhum módulo RBAC novo — tudo sob `sistema` (`read` para diagnóstico, `manage` para
  console/receitas), decisão #3 da Parte 4. Abas de escrita (`Console SQL`/`Correções`) ficam ocultas
  para quem não é admin (`isAdmin` prop, mesmo padrão já usado por `AtualizacoesTab`).
- **Testes**: 3 arquivos novos (`admin-query.test.ts` 11 casos, `system-diagnostics.test.ts` 6 casos,
  `admin-recipes.test.ts` 9 casos) — 328/328 totais. `STORAGE_PATH` isolado em diretório temporário em
  todos os testes de filesystem, nunca toca `storage/patches/` real.
- tsc limpo, lint 32 (+1 sobre a baseline de 31 — mesmo padrão sistêmico de fetch-em-efeito já tolerado
  em outras abas de Configurações, não um problema novo), build limpo, `pm2 restart` + smoke test
  confirmados (com um reset do daemon do PM2 no meio, mesmo incidente recorrente já visto antes neste
  projeto — recuperado sem perda de dado).

---

## Conclusão

A auditoria confirma que a desconfiança do usuário sobre o sistema de patch tinha fundamento real:
existe um rollback que aconteceu e nunca foi registrado no histórico, e um `status.json` preso há mais
de uma semana sem nenhuma forma de detecção. Isso é evidência concreta, não suposição, de que
"Administração" hoje não sustenta operação/manutenção/diagnóstico/recuperação de verdade — exatamente o
que o usuário apontou. As 6 decisões da Parte 4 precisam de validação antes de qualquer código,
especialmente a Decisão #1 (postura de risco da intervenção em banco), que molda todo o resto.
