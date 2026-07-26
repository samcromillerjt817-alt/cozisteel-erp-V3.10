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
PATCH_LOG_DIR="$STORAGE_DIR/patches/logs"
STATUS_FILE="$STORAGE_DIR/patches/status.json"
mkdir -p "$PATCH_BACKUP_DIR"
mkdir -p "$PATCH_LOG_DIR"
mkdir -p "$(dirname "$STATUS_FILE")"

TS=$(date +%Y%m%d-%H%M%S)

# ADR-021 (achado 2.2.3): antes disto, a saida inteira do script ia pro vazio quando
# disparado via upload (spawn com stdio:'ignore') - sem nenhum rastro do que aconteceu se
# algo falhasse fora dos checkpoints de write_status. "tee" mantem a saida visivel no
# terminal (uso manual) e grava tambem em arquivo (uso via upload/detached).
LOG_FILE="$PATCH_LOG_DIR/patch-$TS.log"
exec > >(tee -a "$LOG_FILE") 2>&1

write_status() {
  # $1=state  $2=message
  cat > "$STATUS_FILE" <<EOF
{"state":"$1","message":"$2","timestamp":"$(date -u +%Y-%m-%dT%H:%M:%SZ)","pid":$$,"logFile":"$(basename "$LOG_FILE")"}
EOF
}

echo "═══════════════════════════════════════════════════════"
echo " Cozisteel ERP — Aplicador de Patch"
echo "═══════════════════════════════════════════════════════"

# ── 1. Lê o manifesto do patch ──
write_status "reading_manifest" "Lendo manifesto do patch..."
MANIFEST_FILE="/tmp/patch-manifest-$TS.json"
if ! unzip -p "$PATCH_ZIP" patch.json > "$MANIFEST_FILE" 2>/dev/null; then
  echo "ERRO: o arquivo não contém patch.json na raiz. Todo pacote de patch precisa desse manifesto."
  write_status "failed" "Patch inválido: patch.json não encontrado"
  exit 1
fi

# ADR-021 (achado 2.2.4): antes disto, os campos eram extraídos por regex (grep -oP) contra
# o texto bruto do JSON — funcionava só pro caso simples, quebrava silenciosamente (valor
# vazio/errado, sem erro) diante de qualquer variação razoável (aspas escapadas, campos
# aninhados). Node com JSON.parse de verdade valida e falha alto em vez de seguir com dado
# errado.
if ! MANIFEST_PARSED=$(node -e "
const fs = require('fs')
try {
  const m = JSON.parse(fs.readFileSync('$MANIFEST_FILE', 'utf8'))
  if (!m.version) { console.error('campo \\\"version\\\" ausente no manifesto'); process.exit(1) }
  console.log(m.version)
  console.log((m.title || '').replace(/\n/g, ' '))
  console.log((m.description || '').replace(/\n/g, ' '))
  console.log(m.requiresNpmInstall === true ? 'true' : 'false')
  console.log(m.requiresPrismaMigrate === true ? 'true' : 'false')
} catch (e) {
  console.error('patch.json inválido: ' + e.message)
  process.exit(1)
}
" 2>&1); then
  echo "ERRO: manifesto do patch inválido: $MANIFEST_PARSED"
  write_status "failed" "Patch inválido: manifesto malformado ou sem o campo \"version\""
  exit 1
fi

TO_VERSION=$(sed -n '1p' <<< "$MANIFEST_PARSED")
TITLE=$(sed -n '2p' <<< "$MANIFEST_PARSED")
DESCRIPTION=$(sed -n '3p' <<< "$MANIFEST_PARSED")
NEEDS_NPM=$(sed -n '4p' <<< "$MANIFEST_PARSED")
NEEDS_PRISMA=$(sed -n '5p' <<< "$MANIFEST_PARSED")

CURRENT_VERSION=$(node -e "
try { console.log(JSON.parse(require('fs').readFileSync('version.json','utf8')).version || 'desconhecida') }
catch { console.log('desconhecida') }
" 2>/dev/null || echo "desconhecida")

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

  # Achado real (relatado pelo usuário — patches que "quebravam de vez" em vez de reverter):
  # se o patch que falhou já tinha rodado "npm install", node_modules fica incompatível com o
  # package.json restaurado acima (o backup nunca incluiu node_modules, só o package.json) —
  # causa plausível do PRÓPRIO build do rollback falhar.
  if [ "$NEEDS_NPM" = "true" ]; then
    echo "→ Reinstalando dependências para bater com o package.json restaurado..."
    npm install || echo "⚠ AVISO: npm install do rollback falhou — o rebuild abaixo pode falhar por causa disso."
  fi

  rm -rf .next
  if ! npm run build; then
    # Achado real e mais grave: aqui o código antigo já estava restaurado, e o build FALHOU —
    # ou seja, nem o patch nem o rollback produziram um build funcional. Antes, o script
    # ignorava essa falha ("npm run build || true") e seguia direto pro "pm2 restart" mesmo
    # assim — só que o processo do PM2 ATÉ ENTÃO ainda estava rodando o código anterior ao
    # patch, intacto e funcionando (nenhum restart tinha acontecido ainda). Forçar o restart
    # nesse ponto troca "site funcionando com código antigo" por "site fora do ar" — é
    # exatamente o "quebrava de vez" relatado. Never reiniciar o PM2 quando o rebuild do
    # rollback falha: melhor deixar rodando o que já estava no ar do que garantir a quebra.
    echo ""
    echo "═══════════════════════════════════════════════════════"
    echo "  ERRO CRÍTICO: o build do ROLLBACK também falhou."
    echo "  O sistema NÃO será reiniciado — o processo atual continua rodando"
    echo "  com o código anterior ao patch, intacto."
    echo "  Intervenção manual necessária: revise $LOG_FILE, rode 'npm install'"
    echo "  e 'npm run build' manualmente na raiz do projeto antes de reiniciar o PM2."
    echo "═══════════════════════════════════════════════════════"
    write_status "failed" "Patch falhou E o rebuild do rollback também falhou — o sistema NÃO foi reiniciado, continua rodando a versão anterior ao patch. Intervenção manual necessária (ver log $(basename "$LOG_FILE"))."
    node scripts/record-patch.mjs --to="$CURRENT_VERSION" --from="$CURRENT_VERSION" \
      --title="Rollback automático de $TO_VERSION (build do rollback falhou)" --via="$APPLIED_VIA" --status=failed \
      --error="Build do rollback falhou — sistema mantido rodando a versão anterior sem reiniciar" \
      ${USER_ID:+--user="$USER_ID"} || echo "⚠ AVISO: não foi possível registrar em PatchLog — ver $LOG_FILE."
    return 1
  fi

  rm -rf .next/standalone/.next/static .next/standalone/public 2>/dev/null || true
  mkdir -p .next/standalone/.next
  cp -r .next/static .next/standalone/.next/ 2>/dev/null || true
  cp -r public .next/standalone/ 2>/dev/null || true
  pm2 restart "$PM2_APP_NAME" || echo "⚠ AVISO: 'pm2 restart' falhou durante o rollback — confira 'pm2 list' manualmente."
  # ADR-021 (achado 2.2.2): antes disto, "2>/dev/null || true" engolia erro E stderr desta
  # chamada — foi exatamente assim que um rollback real (2026-07-09) aconteceu sem deixar
  # NENHUM registro em PatchLog. Agora, se falhar, o erro aparece no log (ja capturado pelo
  # "tee" acima) e o proprio status.json avisa explicitamente que o registro pode estar
  # incompleto, em vez de reportar sucesso silencioso na gravacao.
  if ! node scripts/record-patch.mjs --to="$CURRENT_VERSION" --from="$CURRENT_VERSION" \
    --title="Rollback automático de $TO_VERSION" --via="$APPLIED_VIA" --status=rolled_back \
    --error="Falha ao aplicar $TO_VERSION — revertido automaticamente" \
    ${USER_ID:+--user="$USER_ID"}; then
    echo "⚠ AVISO: não foi possível registrar o rollback em PatchLog — ver $LOG_FILE para detalhes."
    write_status "failed" "Patch falhou e foi revertido automaticamente. Versão atual: $CURRENT_VERSION. ATENÇÃO: o registro deste rollback no histórico falhou — ver log $(basename "$LOG_FILE")."
  else
    write_status "failed" "Patch falhou e foi revertido automaticamente. Versão atual: $CURRENT_VERSION"
  fi
  echo "✓ Sistema revertido para $CURRENT_VERSION. Nenhuma alteração foi mantida."
}

# A partir daqui, QUALQUER comando que falhar (não só os que a gente checa manualmente)
# aciona o rollback automático — isso pega casos inesperados (ex: avisos do unzip,
# variável de ambiente ausente, etc.) que antes derrubavam o script sem reverter nada.
#
# "trap - ERR" logo no início do handler (repetido antes de toda chamada manual de
# rollback abaixo) é essencial, não cosmético: bash decide se a trap ERR deve disparar
# com base em se ela estava armada no INÍCIO do comando, não no fim — então rollback()
# poder retornar 1 (desde que passou a checar se o build do PRÓPRIO rollback falha) fazia
# a trap disparar de novo mesmo já tendo sido desarmada como primeira linha de rollback(),
# rodando a função inteira duas vezes (incluindo um registro DUPLICADO no PatchLog).
# Reproduzido isoladamente antes de corrigir; ver docs/adr/ADR-021 para o teste.
trap 'trap - ERR; rollback; exit 1' ERR

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
    trap - ERR
    rollback
    exit 1
  fi
fi

if [ "$NEEDS_PRISMA" = "true" ]; then
  write_status "migrating" "Sincronizando banco de dados..."
  echo "→ prisma generate + db push..."
  if ! npx prisma generate || ! npx prisma db push; then
    echo "ERRO ao sincronizar o banco de dados."
    trap - ERR
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
  trap - ERR
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
if node scripts/record-patch.mjs --to="$TO_VERSION" --from="$CURRENT_VERSION" \
  --title="$TITLE" --description="$DESCRIPTION" --via="$APPLIED_VIA" --status=success \
  ${USER_ID:+--user="$USER_ID"}; then
  write_status "done" "Atualizado para a versão $TO_VERSION com sucesso!"
else
  echo "⚠ AVISO: patch aplicado com sucesso, mas não foi possível registrar no histórico (PatchLog) — ver $LOG_FILE."
  write_status "done" "Atualizado para a versão $TO_VERSION com sucesso! ATENÇÃO: o registro no histórico falhou — ver log $(basename "$LOG_FILE")."
fi

echo ""
echo "═══════════════════════════════════════════════════════"
echo " ✓ Patch aplicado com sucesso!"
echo "   $CURRENT_VERSION → $TO_VERSION"
echo "═══════════════════════════════════════════════════════"
