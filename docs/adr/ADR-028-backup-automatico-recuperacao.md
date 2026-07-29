# ADR-028 — Backup Automático e Política de Recuperação

- **Status**: Implementado e verificado (teste de restauração real executado)
- **Data**: 2026-07-29
- **Origem**: ao concordar em considerar o ERP pronto para produção (depois de 2 rodadas de
  auditoria de segurança, ver ADR-027), o usuário condicionou isso explicitamente a fechar uma
  lacuna encontrada durante a avaliação: só existia 1 backup manual do banco, de 20 dias atrás,
  sem nenhuma rotina automática. Pedido: "não quero manter o ambiente produtivo sem uma política
  real de recuperação."

## Parte 1 — Levantamento do estado atual (antes de implementar)

- **SQLite**: `journal_mode = delete` (padrão, não WAL), `busy_timeout = 0` na conexão do
  `sqlite3` CLI (a aplicação via Prisma configura o próprio timeout). Banco de produção com 1.3MB.
- **STORAGE_PATH**: `/home/julio/cozisteel-erp-V3.10/storage`, com subpastas de negócio
  (`products`, `clientes`, `anexos`, `assinaturas`, `orcamentos`, `logos`, `pdf`, `produtos`) e
  operacionais (`cache`, `temp`, `patches`, `logs`, `backups`).
- **PM2**: 1 instância fork única (`cozisteel-erp`), lendo `DATABASE_URL`/`STORAGE_PATH` de
  `ecosystem.config.cjs` — mesmo arquivo de banco usado o tempo todo, nunca para durante um
  backup.
- **Achado crítico durante o levantamento**: o mecanismo de backup **já existente** (backup manual
  sob demanda do Admin Center, `PatchService.createManualBackup`, e o backup automático
  pré-patch em `scripts/apply-patch.sh`) copiava o arquivo do banco com `cp`/`fs.copyFile` — uma
  cópia de arquivo bruta, sem nenhuma garantia de consistência se o PM2 estiver com o banco aberto
  e escrevendo no exato instante da cópia. Corrigido nesta mesma rodada (Parte 4).

## Parte 2 — Política de backup implementada

### Conteúdo e método (`scripts/backup-daily.sh`)

1. **Banco de dados**: cópia a quente via **API de backup do próprio SQLite** (`sqlite3 ORIGEM
   ".backup DESTINO"`, com `PRAGMA busy_timeout=10000` pra tolerar contenção breve) — nunca `cp`.
   Essa API foi desenhada especificamente pra copiar um banco em uso, produzindo um snapshot
   consistente independente de escrita concorrente.
2. **Verificação de integridade**: `PRAGMA integrity_check` rodado contra a **cópia**, nunca contra
   o banco original em produção. Se a checagem não devolver exatamente `"ok"`, o backup inteiro é
   marcado como falho — nunca promove uma cópia suspeita pra retenção nem pra fora do servidor.
3. **Uploads**: `storage/{anexos,assinaturas,clientes,logos,orcamentos,produtos,products,pdf}` —
   tudo que é dado de negócio real. Exclusão deliberada de `storage/cache` e `storage/temp`
   (regeneráveis por natureza) e de `storage/patches`/`storage/backups` (artefatos operacionais do
   próprio sistema de atualização/backup, não dado de negócio — evita backup-de-backup recursivo).
4. **Arquivos de recuperação**: `ecosystem.config.cjs`, `.env`, `prisma/schema.prisma`,
   `package.json`, `package-lock.json`, `version.json` — o necessário pra reconstruir o ambiente de
   execução exato de quando o backup foi tirado (versões de dependência, schema, configuração).
5. Tudo empacotado num único `.tar.gz` por execução.

### Checksum e log

- SHA-256 do pacote final, gravado ao lado (`<arquivo>.sha256`).
- Log estruturado em JSON-lines (`logs/backup.log`) — 1 linha por execução, com timestamp, status
  (`success`/`failed`), duração em segundos, tamanho do pacote, checksum e (se falhou) a mensagem
  de erro. **Nunca grava conteúdo de arquivo nenhum** — só metadados, nada de segredo no log.
- `storage/backups/status.json` — resultado da execução mais recente, pensado pra checagem rápida
  (script, dashboard futuro, ou o próprio Admin Center).

### Retenção (GFS — grandfather-father-son)

| Nível | Quando é gerado | Retenção |
|---|---|---|
| Diário | toda execução | 7 cópias |
| Semanal | toda execução de domingo (`date +%u` = 7) | 5 cópias |
| Mensal | toda execução no dia 1º do mês | 12 cópias |

A rotação (`prune()`) remove as cópias mais antigas de cada nível quando o limite é excedido,
ordenando por nome do arquivo (cronológico, pelo formato do timestamp).

### Cópia externa ao servidor

Espelhada (via `rsync -a --delete`) pra `/mnt/c/Users/julio/CozisteelBackups/` — a unidade C: do
Windows host, um volume físico/lógico **diferente** do disco virtual do WSL2 onde o projeto roda.

**Limitação documentada, de propósito**: isso protege contra corrupção/perda de dado específica do
ambiente WSL/Linux (disco virtual corrompido, `rm -rf` acidental dentro do WSL, etc.), mas **não**
é backup verdadeiramente offsite — continua sendo a mesma máquina física. Verifiquei os outros
dispositivos Tailscale desta conta: todos offline (o mais recente, há 40 dias) — não há hoje uma
segunda máquina confiável pra replicar de verdade. Registrado como melhoria futura: assim que
houver uma segunda máquina online de forma consistente, ou um provedor de nuvem configurado
(rclone/S3/similar), estender a cópia externa pra lá também. `EXTERNAL_BACKUP_PATH` é
configurável via variável de ambiente exatamente pra facilitar essa evolução sem reescrever o
script.

### Alerta de falha

Sem SMTP/Slack/webhook configurado neste projeto (confirmado na auditoria de segurança anterior,
ADR-027) — implementar um canal novo estava fora do escopo deste pedido. O alerta possível sem
adicionar dependência externa nova: `msg.exe` (nativo do Windows) mostra uma mensagem pro usuário
logado na sessão do Windows, com timeout de 30s (não trava o script nem exige alguém estar
olhando). Combinado com `status.json`/`logs/backup.log` como registro durável — quem checar depois
sempre vê o resultado real, mesmo que a mensagem tenha fechado sozinha. **Limitação documentada**:
isso não alcança ninguém remotamente (sem e-mail/SMS) — se a máquina estiver desligada ou sem
ninguém logado no momento da falha, o alerta ativo não é visto (só o registro passivo).

### Agendamento

`cron` (systemd `cron.service`, já ativo nesta instância WSL) — `0 3 * * *`, todo dia às 3h da
manhã (horário de menor movimento). Saída redirecionada pra `logs/backup-cron.out`, além do próprio
`logs/backup.log` estruturado.

## Parte 3 — Correção relacionada: mecanismos de backup já existentes

Achado durante o levantamento (Parte 1): tanto `PatchService.createManualBackup()` (backup manual
do Admin Center) quanto `scripts/apply-patch.sh` (backup automático antes de aplicar um patch, e a
restauração de rollback se o patch falhar) copiavam o banco com `cp`/`fs.copyFile` — a mesma classe
de risco que motivou esta rodada inteira. Corrigido nos 2 lugares:

- **Backup** (`PatchService.createManualBackup`, `apply-patch.sh` passo 2): `cp`/`fs.copyFile` →
  `sqlite3 ORIGEM ".backup DESTINO"`.
- **Restauração/rollback** (`apply-patch.sh`, dentro de `rollback()`): `cp` → `sqlite3 DESTINO
  ".restore ORIGEM"` — o comando espelhado da API de backup, na direção contrária (escreve no
  banco que pode estar com o PM2 ainda de pé, já que o rollback acontece antes do restart).

`tests/manual-backup.test.ts` atualizado pra usar um SQLite de verdade como banco fake (antes usava
um arquivo de texto puro, incompatível com `.backup`, que exige uma origem válida) e validar
`PRAGMA integrity_check` + conteúdo via `SELECT`, em vez de comparação de bytes crus.

## Parte 4 — Procedimento de restauração (documentado e testado)

### Restauração completa (banco + uploads + configuração)

```bash
# 1. Escolher o backup (mais recente primeiro, dentro de cada nível):
ls -t storage/backups/daily/*.tar.gz | head -5
# ou, se for restaurar de um ponto mais antigo:
ls -t storage/backups/weekly/*.tar.gz storage/backups/monthly/*.tar.gz

# 2. Verificar o checksum ANTES de restaurar (nunca restaurar um arquivo cujo hash não bate):
sha256sum -c storage/backups/daily/cozisteel-backup-<TIMESTAMP>.tar.gz.sha256

# 3. Extrair em um diretório TEMPORÁRIO — nunca direto por cima do ambiente em produção:
mkdir -p /tmp/restore-cozisteel
tar xzf storage/backups/daily/cozisteel-backup-<TIMESTAMP>.tar.gz -C /tmp/restore-cozisteel

# 4. Validar a integridade do banco extraído ANTES de promovê-lo:
sqlite3 /tmp/restore-cozisteel/cozisteel.db "PRAGMA integrity_check;"
# deve devolver exatamente "ok" — se não devolver, ESTE backup está comprometido, tente o anterior.

# 5. Parar o PM2 (evita qualquer escrita concorrente durante a promoção):
pm2 stop cozisteel-erp

# 6. Promover o banco e os uploads restaurados por cima do ambiente real:
cp /tmp/restore-cozisteel/cozisteel.db data/cozisteel.db
cp -r /tmp/restore-cozisteel/storage/* storage/
# (arquivos de configuração — ecosystem.config.cjs, .env, prisma/schema.prisma — só se o ambiente
# atual também tiver sido perdido/corrompido; normalmente NÃO se restaura configuração por cima de
# um ambiente que já está correto, só o dado.)

# 7. Reiniciar:
pm2 restart ecosystem.config.cjs --update-env

# 8. Validar pós-restauração (contagens básicas, sem confiar cegamente):
sqlite3 data/cozisteel.db "SELECT count(*) FROM Quote; SELECT count(*) FROM User;"
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/api/public/catalog
```

### Restauração seletiva (só consultar/recuperar 1 registro, sem promover o backup inteiro)

Extrair o `.tar.gz` num diretório temporário (passos 1-4 acima) e consultar o
`cozisteel.db` extraído diretamente com `sqlite3` (leitura), ou apontar uma instância descartável
do Prisma Client pra ele (`DATABASE_URL=file:/tmp/.../cozisteel.db`) — sem tocar o ambiente real.
Foi exatamente esse o método usado no teste de restauração desta seção.

### Teste de restauração real executado (evidência)

Executado nesta mesma sessão, contra o backup real gerado (`cozisteel-backup-20260729-140214.tar.gz`,
281.901 bytes, SHA-256 `4f6997173798fff565d5c51f7c3fcfccf9f2e2561610566e8912b3719598f3d0`):

1. Extraído em `/tmp/cozisteel-restore-test/` (isolado, nunca tocou produção).
2. `PRAGMA integrity_check` no banco extraído → **`ok`**.
3. Contagem de linhas nas tabelas-chave, restaurado vs. produção ao vivo: `User` 1/1, `Quote` 9/9,
   `Product` 1/1, `Client` 2/2, `SalesOrder` 5/5, `ProductionOrder` 5/5, `AuditLog` 235/235 —
   **idênticas** (esperado, dado o backup ter sido tirado minutos antes).
4. Checksum SHA-256 de um upload real (`products/.../1783558640017-o61skp.jpg`) comparado entre
   produção e o extraído do backup — **idêntico**.
5. Consulta real via Prisma Client apontado pro banco restaurado (`db.quote.findMany(...)`) —
   devolveu 3 orçamentos reais (`ORC-000028`, `ORC-000025`, `ORC-000022`) com dado consistente —
   prova que o backup não é só um arquivo estruturalmente válido, é **utilizável pela aplicação de
   verdade**.

Artefatos de teste (`/tmp/cozisteel-restore-test/`, script auxiliar) removidos ao final — nenhum
dado de teste ficou no ambiente.

## Parte 5 — O que fica pendente/fora do escopo desta rodada

- Backup verdadeiramente offsite (fora desta máquina física) — sem destino confiável disponível
  hoje (ver Parte 2). Revisitar se/quando uma segunda máquina ou um provedor de nuvem entrar em
  cena.
- Alerta de falha por canal remoto (e-mail/SMS/Slack) — exigiria configurar um serviço externo
  novo, fora do escopo deste pedido pontual.
- Criptografia do pacote de backup em repouso — os arquivos de configuração incluídos
  (`.env`, `ecosystem.config.cjs`) contêm segredos (`NEXTAUTH_SECRET`); o backup local fica dentro
  de `storage/backups/` (já com as mesmas permissões do resto do storage do servidor) e a cópia
  externa fica no perfil do próprio usuário no Windows host — aceitável pro modelo de ameaça atual
  (single-admin, mesma pessoa controla as duas máquinas), mas seria a próxima camada de defesa se
  o acesso a qualquer uma das duas máquinas deixar de ser exclusivamente do administrador.

## Verificação

tsc limpo, lint 59 problemas (mesma contagem, 0 novos), 487/487 testes (`manual-backup.test.ts`
atualizado pra validar via SQLite real). Build limpo. Backup real executado com sucesso contra o
banco de produção (operação somente-leitura na origem — `.backup` nunca escreve no banco original).
Cron instalado e verificado (`crontab -l`). Teste de restauração real executado e documentado
acima, com evidência de banco + upload + consulta via Prisma todos íntegros.
