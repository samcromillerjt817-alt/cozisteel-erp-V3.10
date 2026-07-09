#!/usr/bin/env bash
#
# scripts/apply-patch.sh — aplica um pacote de atualização (.zip) no Cozisteel ERP.
#
# Uso:
#   ./scripts/apply-patch.sh caminho/para/patch.zip [--applied-via=terminal|upload] [--user-id=<id>]
#
# O que faz, em ordem, com segurança (para e reverte se algo falhar):
#   1. Lê o manifesto patch.json de dentro do zip (versão, título, se precisa
#      npm install / prisma migrate)
#   2. Faz backup do projeto atual + do banco de dados em storage/patches/backups/
#   3. Extrai o patch por cima dos arquivos do projeto
#   4. Roda npm install e/ou prisma generate+db push, se o patch pedir
#   5. Builda o projeto (rm -rf .next && npm run build)
#   6. Se o build falhar: RESTAURA o backup automaticamente e para (rollback)
#   7. Copia os arquivos estáticos pro standalone
#   8. Reinicia o PM2
#   9. Registra a atualização no banco (versão nova + histórico)
#
# Este script deve ser executado a partir da RAIZ do projeto:
#   cd /caminho/do/projeto && ./scripts/apply-patch.sh patch.zip

set -euo pipefail

# ── Argumentos ────────────────────────────────────────────
PATCH_ZIP=""
APPLIED_VIA="terminal"
USER_ID=""
for arg in "$@"; do
  case "$arg" in
    --applied-via=*) APPLIED_VIA="${arg#*=}" ;;
    --user-id=*) USER_ID="${arg#*=}" ;;
    *) PATCH_ZIP="$arg" ;;
  esac
done

if [ -z "$PATCH_ZIP" ] || [ ! -f "$PATCH_ZIP" ]; then
  echo "Uso: $0 caminho/para/patch.zip [--applied-via=terminal|upload] [--user-id=<id>]"
  exit 1
fi
PATCH_ZIP="$(cd "$(dirname "$PATCH_ZIP")" && pwd)/$(basename "$PATCH_ZIP")"

# Um "next dev" escreve na mesma pasta .next/ que o build de producao usa —
# rodando junto com o build do patch, corrompe o .next mesmo que o build "passe"
# (foi exatamente isso que derrubou o site em 2026-07-09). Aborta cedo se achar um.
if pgrep -f "next dev" > /dev/null 2>&1; then
  echo "ERRO: ha um servidor 'next dev' rodando nesta maquina."
  echo "  Pare o servidor de desenvolvimento antes de aplicar o patch (ele usa a mesma pasta .next/ da producao)."
  exit 1
fi

PROJECT_ROOT="$(pwd)"
if [ ! -f "$PROJECT_ROOT/package.json" ] || [ ! -f "$PROJECT_ROOT/ecosystem.config.cjs" ]; then
  echo "ERRO: rode este script a partir da raiz do projeto (onde ficam package.json e ecosystem.config.cjs)."
  exit 1
fi

# ── Detecta nome do app no PM2 (evita hardcode do nome do servidor) ──
PM2_APP_NAME=$(grep -oP "name:\s*'\K[^']+" ecosystem.config.cjs | head -1)
if [ -z "$PM2_APP_NAME" ]; then PM2_APP_NAME="cozisteel-erp"; fi

# ── Detecta o arquivo do banco a partir do DATABASE_URL do .env ──
DB_FILE=""
if [ -f .env ]; then
  DB_URL=$(grep -m1 '^DATABASE_URL=' .env | cut -d'=' -f2-)
  DB_FILE="${DB_URL#file:}"
fi

STORAGE_DIR="${STORAGE_PATH:-./storage}"
PATCH_BACKUP_DIR="$STORAGE_DIR/patches/backups"
STATUS_FILE="$STORAGE_DIR/patches/status.json"
mkdir -p "$PATCH_BACKUP_DIR"
mkdir -p "$(dirname "$STATUS_FILE")"

TS=$(date +%Y%m%d-%H%M%S)

write_status() {
  # $1=state  $2=message
  cat > "$STATUS_FILE" <<EOF
{"state":"$1","message":"$2","timestamp":"$(date -u +%Y-%m-%dT%H:%M:%SZ)"}
EOF
}

echo "═══════════════════════════════════════════════════════"
echo " Cozisteel ERP — Aplicador de Patch"
echo "═══════════════════════════════════════════════════════"

# ── 1. Lê o manifesto do patch ──
write_status "reading_manifest" "Lendo manifesto do patch..."
if ! unzip -p "$PATCH_ZIP" patch.json > /tmp/patch-manifest-$TS.json 2>/dev/null; then
  echo "ERRO: o arquivo não contém patch.json na raiz. Todo pacote de patch precisa desse manifesto."
  write_status "failed" "Patch inválido: patch.json não encontrado"
  exit 1
fi

TO_VERSION=$(grep -oP '"version"\s*:\s*"\K[^"]+' /tmp/patch-manifest-$TS.json || echo "")
TITLE=$(grep -oP '"title"\s*:\s*"\K[^"]+' /tmp/patch-manifest-$TS.json || echo "")
DESCRIPTION=$(grep -oP '"description"\s*:\s*"\K[^"]+' /tmp/patch-manifest-$TS.json || echo "")
NEEDS_NPM=$(grep -oP '"requiresNpmInstall"\s*:\s*\K(true|false)' /tmp/patch-manifest-$TS.json || echo "false")
NEEDS_PRISMA=$(grep -oP '"requiresPrismaMigrate"\s*:\s*\K(true|false)' /tmp/patch-manifest-$TS.json || echo "false")

if [ -z "$TO_VERSION" ]; then
  echo "ERRO: patch.json não tem o campo \"version\"."
  write_status "failed" "Patch inválido: version ausente no manifesto"
  exit 1
fi

CURRENT_VERSION=$(grep -oP '"version"\s*:\s*"\K[^"]+' version.json 2>/dev/null || echo "desconhecida")

echo "Versão atual:  $CURRENT_VERSION"
echo "Nova versão:   $TO_VERSION"
echo "Título:        ${TITLE:-(sem título)}"
echo "npm install:   $NEEDS_NPM"
echo "prisma migrate:$NEEDS_PRISMA"
echo ""

# ── 2. Backup ──
write_status "backing_up" "Fazendo backup antes de aplicar o patch..."
echo "→ Fazendo backup (código + banco)..."
BACKUP_FILE="$PATCH_BACKUP_DIR/pre-patch-$TS.tar.gz"
tar czf "$BACKUP_FILE" \
  --exclude='node_modules' --exclude='.next' --exclude='storage' \
  --exclude='.git' \
  prisma src public package.json package-lock.json next.config.ts version.json ecosystem.config.cjs 2>/dev/null || true

if [ -n "$DB_FILE" ] && [ -f "$DB_FILE" ]; then
  cp "$DB_FILE" "$PATCH_BACKUP_DIR/pre-patch-$TS.db"
  echo "  Banco de dados copiado para backup."
fi
echo "  Backup salvo em: $BACKUP_FILE"

rollback() {
  trap - ERR
  echo ""
  echo "⚠ Revertendo para o backup anterior (rollback automático)..."
  write_status "rolling_back" "Erro detectado — revertendo para a versão anterior..."
  tar xzf "$BACKUP_FILE" -C "$PROJECT_ROOT"
  if [ -n "$DB_FILE" ] && [ -f "$PATCH_BACKUP_DIR/pre-patch-$TS.db" ]; then
    cp "$PATCH_BACKUP_DIR/pre-patch-$TS.db" "$DB_FILE"
  fi
  rm -rf .next
  npm run build || true
  rm -rf .next/standalone/.next/static .next/standalone/public 2>/dev/null || true
  mkdir -p .next/standalone/.next
  cp -r .next/static .next/standalone/.next/ 2>/dev/null || true
  cp -r public .next/standalone/ 2>/dev/null || true
  pm2 restart "$PM2_APP_NAME" 2>/dev/null || true
  node scripts/record-patch.mjs --to="$CURRENT_VERSION" --from="$CURRENT_VERSION" \
    --title="Rollback automático de $TO_VERSION" --via="$APPLIED_VIA" --status=rolled_back \
    --error="Falha ao aplicar $TO_VERSION — revertido automaticamente" \
    ${USER_ID:+--user="$USER_ID"} 2>/dev/null || true
  write_status "failed" "Patch falhou e foi revertido automaticamente. Versão atual: $CURRENT_VERSION"
  echo "✓ Sistema revertido para $CURRENT_VERSION. Nenhuma alteração foi mantida."
}

# A partir daqui, QUALQUER comando que falhar (não só os que a gente checa manualmente)
# aciona o rollback automático — isso pega casos inesperados (ex: avisos do unzip,
# variável de ambiente ausente, etc.) que antes derrubavam o script sem reverter nada.
trap 'rollback; exit 1' ERR

# ── 3. Extrai o patch ──
write_status "extracting" "Extraindo arquivos do patch..."
echo "→ Extraindo patch..."
unzip -o "$PATCH_ZIP" -d "$PROJECT_ROOT" > /dev/null

# ── 4. npm install / prisma ──
if [ "$NEEDS_NPM" = "true" ]; then
  write_status "installing" "Instalando dependências novas (npm install)..."
  echo "→ npm install..."
  if ! npm install; then
    echo "ERRO no npm install."
    rollback
    exit 1
  fi
fi

if [ "$NEEDS_PRISMA" = "true" ]; then
  write_status "migrating" "Sincronizando banco de dados..."
  echo "→ prisma generate + db push..."
  if ! npx prisma generate || ! npx prisma db push; then
    echo "ERRO ao sincronizar o banco de dados."
    rollback
    exit 1
  fi
fi

# ── 5. Build ──
write_status "building" "Compilando o sistema (isso pode levar 1-2 minutos)..."
echo "→ Buildando..."
rm -rf .next
if ! npm run build; then
  echo "ERRO no build."
  rollback
  exit 1
fi

# A build é o único ponto de risco real de deixar o sistema num estado quebrado —
# a partir daqui já existe um build novo e válido. Desliga o rollback automático:
# um solavanco em "copiar estáticos" ou "reiniciar o PM2" deve virar aviso e ser
# corrigido manualmente, NUNCA desfazer uma atualização cujo build já funcionou.
trap - ERR

# ── 6. Copia estáticos ──
write_status "finalizing" "Finalizando..."
echo "→ Copiando arquivos estáticos..."
if ! ( rm -rf .next/standalone/.next/static .next/standalone/public \
    && mkdir -p .next/standalone/.next \
    && cp -r .next/static .next/standalone/.next/ \
    && cp -r public .next/standalone/ ); then
  echo "⚠ AVISO: falha ao copiar arquivos estáticos. O build existe, mas pode faltar CSS/JS/imagens."
  echo "  Rode manualmente: rm -rf .next/standalone/.next/static .next/standalone/public && cp -r .next/static .next/standalone/.next/ && cp -r public .next/standalone/"
fi

# ── 7. Reinicia ──
echo "→ Reiniciando o sistema (PM2: $PM2_APP_NAME)..."
if pm2 describe "$PM2_APP_NAME" > /dev/null 2>&1; then
  pm2 restart "$PM2_APP_NAME" || echo "⚠ AVISO: 'pm2 restart' retornou erro — confira 'pm2 list' manualmente, o build em si está OK."
else
  pm2 start ecosystem.config.cjs || echo "⚠ AVISO: 'pm2 start' retornou erro — confira 'pm2 list' manualmente, o build em si está OK."
fi

# ── 8. Atualiza version.json local (histórico simples em arquivo, além do banco) ──
node -e "
const fs = require('fs');
const v = JSON.parse(fs.readFileSync('version.json', 'utf8'));
v.history = v.history || [];
v.history.unshift({ version: v.version, date: new Date().toISOString().slice(0,10) });
v.version = '$TO_VERSION';
v.buildDate = new Date().toISOString().slice(0,10);
fs.writeFileSync('version.json', JSON.stringify(v, null, 2));
"

# ── 9. Registra no banco ──
node scripts/record-patch.mjs --to="$TO_VERSION" --from="$CURRENT_VERSION" \
  --title="$TITLE" --description="$DESCRIPTION" --via="$APPLIED_VIA" --status=success \
  ${USER_ID:+--user="$USER_ID"} || echo "(aviso: não foi possível registrar no histórico do banco, mas o patch foi aplicado)"

write_status "done" "Atualizado para a versão $TO_VERSION com sucesso!"

echo ""
echo "═══════════════════════════════════════════════════════"
echo " ✓ Patch aplicado com sucesso!"
echo "   $CURRENT_VERSION → $TO_VERSION"
echo "═══════════════════════════════════════════════════════"
