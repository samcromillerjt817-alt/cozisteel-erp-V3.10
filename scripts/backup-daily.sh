#!/usr/bin/env bash
#
# scripts/backup-daily.sh — backup diário automático do Cozisteel ERP (ADR-028).
#
# O que faz, em ordem:
#   1. Backup a QUENTE do SQLite via API de backup do próprio SQLite (`.backup`), nunca `cp`
#      direto no arquivo — seguro mesmo com o PM2 escrevendo no banco ao mesmo tempo.
#   2. Verifica a integridade da cópia (`PRAGMA integrity_check`) — nunca promove/envia um
#      backup que falhar nessa checagem.
#   3. Empacota banco + uploads (storage, exceto cache/temp/patches/backups) + arquivos
#      necessários pra recuperação (schema, configs, versão) num único .tar.gz.
#   4. Calcula SHA-256 do pacote final.
#   5. Grava em 3 níveis de retenção (diário/semanal/mensal — GFS), local E numa cópia externa
#      ao ambiente WSL (unidade C: do Windows host — ver limitação documentada no ADR-028).
#   6. Registra o resultado (sucesso/falha, duração, tamanho, checksum) em log estruturado
#      (JSON-lines) e num status.json com o resultado mais recente.
#   7. Se falhar em qualquer etapa: alerta (mensagem do Windows pro usuário logado) e SAI COM
#      CÓDIGO DE ERRO — nunca promove um backup incompleto/corrompido pra retenção nem pra
#      cópia externa.
#
# Uso: ./scripts/backup-daily.sh
# Agendado via cron (ver ADR-028 pra como instalar o crontab).
#
# Este script deve ser executado a partir da RAIZ do projeto.

set -uo pipefail
# (Sem -e de propósito: cada etapa crítica checa o próprio código de saída explicitamente,
# pra sempre passar pelo tratamento de falha — log + alerta + limpeza — antes de sair.)

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT" || exit 1

TS="$(date +%Y%m%d-%H%M%S)"
DOW="$(date +%u)"   # 1=segunda ... 7=domingo
DOM="$(date +%d)"   # dia do mês
START_EPOCH="$(date +%s)"

# ── Configuração (lida do .env do projeto, com defaults sensatos) ──
DB_FILE="$(grep -m1 '^DATABASE_URL=' .env 2>/dev/null | sed -E 's/^DATABASE_URL=file://')"
STORAGE_DIR="$(grep -m1 '^STORAGE_PATH=' .env 2>/dev/null | sed -E 's/^STORAGE_PATH=//')"
STORAGE_DIR="${STORAGE_DIR:-$PROJECT_ROOT/storage}"
LOCAL_BACKUP_ROOT="$STORAGE_DIR/backups"
LOG_FILE="$PROJECT_ROOT/logs/backup.log"
STATUS_FILE="$LOCAL_BACKUP_ROOT/status.json"
# Cópia externa ao ambiente WSL (unidade C: do Windows host — volume físico/lógico diferente
# do disco virtual do WSL2, mas MESMA máquina física; ver limitação no ADR-028).
# Pode ser sobrescrito: EXTERNAL_BACKUP_PATH=/outro/caminho ./scripts/backup-daily.sh
EXTERNAL_BACKUP_ROOT="${EXTERNAL_BACKUP_PATH:-/mnt/c/Users/julio/CozisteelBackups}"

RETAIN_DAILY=7
RETAIN_WEEKLY=5
RETAIN_MONTHLY=12

mkdir -p "$LOCAL_BACKUP_ROOT/daily" "$LOCAL_BACKUP_ROOT/weekly" "$LOCAL_BACKUP_ROOT/monthly" "$(dirname "$LOG_FILE")"

STAGE="$(mktemp -d)"
cleanup() { rm -rf "$STAGE"; }
trap cleanup EXIT

log_json() {
  # Uma linha JSON por execução — nunca inclui conteúdo de arquivo nenhum, só metadados
  # (nome, tamanho, checksum, duração) — sem segredo nenhum no log.
  local status="$1" duration="$2" size="$3" checksum="$4" error="$5"
  printf '{"timestamp":"%s","status":"%s","duration_seconds":%s,"archive_size_bytes":%s,"sha256":"%s","tiers":"%s","error":"%s"}\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$status" "$duration" "$size" "$checksum" "$TIERS_APPLIED" "$error" >> "$LOG_FILE"
}

write_status() {
  local status="$1" message="$2"
  cat > "$STATUS_FILE" <<EOF
{"lastRun":"$(date -u +%Y-%m-%dT%H:%M:%SZ)","status":"$status","message":"$message"}
EOF
}

alert_failure() {
  local message="$1"
  echo "ERRO: $message" >&2
  # Melhor esforço — mensagem pro usuário logado no Windows (auto-fecha em 30s, não trava o
  # script se ninguém estiver na máquina). Não é e-mail/SMS: é o alerta possível sem configurar
  # um canal externo novo (ver ADR-028, limitação documentada).
  /mnt/c/WINDOWS/system32/msg.exe "%username%" /TIME:30 "Cozisteel ERP — backup diario FALHOU: $message" >/dev/null 2>&1 || true
}

fail() {
  local message="$1"
  local duration=$(( $(date +%s) - START_EPOCH ))
  TIERS_APPLIED="none"
  log_json "failed" "$duration" "0" "" "$message"
  write_status "failed" "$message"
  alert_failure "$message"
  exit 1
}

TIERS_APPLIED="daily"

echo "→ Backup diário Cozisteel ERP — $TS"

# ── 1. Backup a quente do SQLite (API de backup do próprio SQLite, segura sob escrita concorrente) ──
if [ -z "$DB_FILE" ] || [ ! -f "$DB_FILE" ]; then
  fail "DATABASE_URL não encontrado ou arquivo do banco inexistente ($DB_FILE)"
fi

echo "  Copiando banco (hot backup via SQLite .backup)..."
if ! sqlite3 -cmd "PRAGMA busy_timeout=10000;" "$DB_FILE" ".backup '$STAGE/cozisteel.db'" >/dev/null 2>"$STAGE/sqlite-backup.err"; then
  fail "Falha no backup do SQLite: $(cat "$STAGE/sqlite-backup.err" 2>/dev/null | tr '\n' ' ')"
fi

# ── 2. Verifica integridade da CÓPIA (nunca do banco original, que continua em produção) ──
echo "  Verificando integridade da cópia..."
INTEGRITY="$(sqlite3 "$STAGE/cozisteel.db" "PRAGMA integrity_check;" 2>&1)"
if [ "$INTEGRITY" != "ok" ]; then
  fail "Cópia do banco reprovou PRAGMA integrity_check: $INTEGRITY"
fi

# ── 3. Uploads/arquivos de negócio (nunca cache/temp/patches/backups — patches e backups são
#      artefatos operacionais do próprio sistema de atualização, não dado de negócio; cache/temp
#      são regeneráveis por natureza) ──
echo "  Copiando uploads..."
mkdir -p "$STAGE/storage"
for sub in anexos assinaturas clientes logos orcamentos produtos products pdf; do
  if [ -d "$STORAGE_DIR/$sub" ]; then
    cp -r "$STORAGE_DIR/$sub" "$STAGE/storage/$sub" 2>/dev/null || true
  fi
done

# ── Arquivos necessários pra recuperação (schema, configs, versão) ──
echo "  Copiando arquivos de configuração/recuperação..."
mkdir -p "$STAGE/config"
for f in ecosystem.config.cjs .env prisma/schema.prisma package.json package-lock.json version.json; do
  if [ -f "$PROJECT_ROOT/$f" ]; then
    mkdir -p "$STAGE/config/$(dirname "$f")"
    cp "$PROJECT_ROOT/$f" "$STAGE/config/$f"
  fi
done

# ── 4. Empacota tudo num .tar.gz só ──
ARCHIVE_NAME="cozisteel-backup-$TS.tar.gz"
ARCHIVE_PATH="$STAGE/$ARCHIVE_NAME"
echo "  Compactando..."
if ! tar czf "$ARCHIVE_PATH" -C "$STAGE" cozisteel.db storage config 2>"$STAGE/tar.err"; then
  fail "Falha ao compactar o backup: $(cat "$STAGE/tar.err" 2>/dev/null | tr '\n' ' ')"
fi

ARCHIVE_SIZE="$(stat -c%s "$ARCHIVE_PATH" 2>/dev/null || echo 0)"
CHECKSUM="$(sha256sum "$ARCHIVE_PATH" | awk '{print $1}')"
echo "$CHECKSUM  $ARCHIVE_NAME" > "$ARCHIVE_PATH.sha256"

# ── 5. Grava no nível diário (sempre) + promove pra semanal/mensal quando aplicável ──
cp "$ARCHIVE_PATH" "$ARCHIVE_PATH.sha256" "$LOCAL_BACKUP_ROOT/daily/" || fail "Falha ao gravar backup diário local"

if [ "$DOW" = "7" ]; then
  cp "$ARCHIVE_PATH" "$ARCHIVE_PATH.sha256" "$LOCAL_BACKUP_ROOT/weekly/"
  TIERS_APPLIED="daily,weekly"
fi
if [ "$DOM" = "01" ]; then
  cp "$ARCHIVE_PATH" "$ARCHIVE_PATH.sha256" "$LOCAL_BACKUP_ROOT/monthly/"
  TIERS_APPLIED="$TIERS_APPLIED,monthly"
fi

# ── Rotação de retenção — mantém só as N cópias mais recentes de cada nível (ordenação por nome,
#    que já é cronológica pelo formato do timestamp) ──
prune() {
  local dir="$1" keep="$2"
  local count
  count=$(find "$dir" -maxdepth 1 -name '*.tar.gz' | wc -l)
  if [ "$count" -gt "$keep" ]; then
    find "$dir" -maxdepth 1 -name '*.tar.gz' | sort | head -n "$(( count - keep ))" | while read -r old; do
      rm -f "$old" "$old.sha256"
    done
  fi
}
prune "$LOCAL_BACKUP_ROOT/daily" "$RETAIN_DAILY"
prune "$LOCAL_BACKUP_ROOT/weekly" "$RETAIN_WEEKLY"
prune "$LOCAL_BACKUP_ROOT/monthly" "$RETAIN_MONTHLY"

# ── 6. Cópia externa ao ambiente WSL (unidade C: do Windows host) — espelha a retenção local ──
if mkdir -p "$EXTERNAL_BACKUP_ROOT/daily" "$EXTERNAL_BACKUP_ROOT/weekly" "$EXTERNAL_BACKUP_ROOT/monthly" 2>/dev/null; then
  rsync -a --delete "$LOCAL_BACKUP_ROOT/daily/" "$EXTERNAL_BACKUP_ROOT/daily/" 2>"$STAGE/rsync.err"
  rsync -a --delete "$LOCAL_BACKUP_ROOT/weekly/" "$EXTERNAL_BACKUP_ROOT/weekly/" 2>>"$STAGE/rsync.err"
  rsync -a --delete "$LOCAL_BACKUP_ROOT/monthly/" "$EXTERNAL_BACKUP_ROOT/monthly/" 2>>"$STAGE/rsync.err"
  if [ -s "$STAGE/rsync.err" ]; then
    echo "  AVISO: cópia externa com problemas (backup local OK): $(cat "$STAGE/rsync.err" | tr '\n' ' ')" >&2
  else
    echo "  Cópia externa sincronizada em: $EXTERNAL_BACKUP_ROOT"
  fi
else
  echo "  AVISO: destino externo ($EXTERNAL_BACKUP_ROOT) inacessível — backup local OK, mas sem cópia externa desta vez." >&2
fi

DURATION=$(( $(date +%s) - START_EPOCH ))
log_json "success" "$DURATION" "$ARCHIVE_SIZE" "$CHECKSUM" ""
write_status "success" "Backup concluído: $ARCHIVE_NAME ($ARCHIVE_SIZE bytes, ${DURATION}s)"

echo "✓ Backup concluído em ${DURATION}s — $ARCHIVE_NAME ($ARCHIVE_SIZE bytes)"
echo "  SHA-256: $CHECKSUM"
