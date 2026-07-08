#!/bin/bash
# ═══════════════════════════════════════════════════════════
#  COZISTEEL ERP v3.0 — Instalador Profissional
#  Compativel com: Ubuntu 20.04+, Debian 11+, CentOS 8+
#  Requer: Node.js 20 LTS, SQLite3
# ═══════════════════════════════════════════════════════════

set -e
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

echo ""
echo -e "${RED}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${RED}║        COZISTEEL ERP v3.0 — Instalador              ║${NC}"
echo -e "${RED}║        Sistema de Gestao Empresarial Profissional       ║${NC}"
echo -e "${RED}╚══════════════════════════════════════════════════════╝${NC}"
echo ""

# Detecta o usuario real (mesmo que rode com sudo)
REAL_USER="${SUDO_USER:-$USER}"
REAL_HOME=$(getent passwd "$REAL_USER" | cut -d: -f6)

if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}ERRO: Execute como root: sudo bash install.sh${NC}"
  exit 1
fi

# ── 1. Node.js ──
echo -e "${YELLOW}[1/9] Verificando Node.js 20+...${NC}"
if command -v node >/dev/null 2>&1; then
  VER=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
  if [ "$VER" -ge 20 ] && [ "$VER" -lt 24 ]; then
    echo -e "${GREEN}  Node.js $(node -v) OK${NC}"
  else
    echo -e "${YELLOW}  Node.js $(node -v) encontrado, mas v20-23 e necessario${NC}"
    echo -e "${CYAN}  Instalando Node.js 20 LTS...${NC}"
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
    echo -e "${GREEN}  Node.js $(node -v) instalado${NC}"
  fi
else
  echo -e "${CYAN}  Instalando Node.js 20 LTS...${NC}"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

# ── 2. Dependencias do sistema ──
echo -e "${YELLOW}[2/9] Instalando dependencias do sistema...${NC}"
apt-get update -qq 2>/dev/null || true
apt-get install -y build-essential python3 sqlite3 2>/dev/null || true
npm install -g pm2 tsx 2>/dev/null || true

# ── 3. Projeto ──
echo -e "${YELLOW}[3/9] Configurando projeto...${NC}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"
mkdir -p data storage/{clientes,produtos,orcamentos,pdf,logos,assinaturas,anexos,backups,temp,cache,logs} logs patches

if [ ! -f .env ]; then
  SECRET=$(openssl rand -base64 32)
  SERVER_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost")
  cat > .env << ENVEOF
DATABASE_URL=file:$SCRIPT_DIR/data/cozisteel.db
NEXTAUTH_SECRET=$SECRET
NEXTAUTH_URL=http://$SERVER_IP:3000
APP_VERSION=3.0.0
APP_ENV=production
STORAGE_PATH=$SCRIPT_DIR/storage
LOG_PATH=$SCRIPT_DIR/logs
BACKUP_PATH=$SCRIPT_DIR/storage/backups
ENVEOF
  echo -e "${GREEN}  .env criado com segredo unico e IP detectado ($SERVER_IP)${NC}"
else
  echo -e "${CYAN}  .env ja existe, mantendo...${NC}"
fi

# ── 4. NPM install (como usuario real para evitar permissao) ──
echo -e "${YELLOW}[4/9] Instalando dependencias npm...${NC}"
if [ "$REAL_USER" != "root" ]; then
  echo -e "${CYAN}  Instalando como usuario $REAL_USER...${NC}"
  chown -R "$REAL_USER:$REAL_USER" "$SCRIPT_DIR"
  su - "$REAL_USER" -c "cd '$SCRIPT_DIR' && npm install" 2>&1 | tail -5
else
  npm install 2>&1 | tail -5
fi

# ── 5. Prisma ──
echo -e "${YELLOW}[5/9] Configurando banco de dados...${NC}"
if [ "$REAL_USER" != "root" ]; then
  su - "$REAL_USER" -c "cd '$SCRIPT_DIR' && npx prisma generate" 2>&1 | tail -3
  su - "$REAL_USER" -c "cd '$SCRIPT_DIR' && npx prisma db push" 2>&1 | tail -3
  su - "$REAL_USER" -c "cd '$SCRIPT_DIR' && npx tsx prisma/seed.ts" 2>&1 | tail -5
else
  npx prisma generate 2>&1 | tail -3
  npx prisma db push 2>&1 | tail -3
  npx tsx prisma/seed.ts 2>&1 | tail -5
fi
echo -e "${GREEN}  Banco de dados configurado${NC}"

# ── 6. Build (SEM Turbopack — standalone quebra com Turbopack) ──
echo -e "${YELLOW}[6/9] Compilando build de producao (Webpack) ...${NC}"
if [ "$REAL_USER" != "root" ]; then
  su - "$REAL_USER" -c "cd '$SCRIPT_DIR' && npx next build --no-turbopack" 2>&1 | tail -10
else
  npx next build --no-turbopack 2>&1 | tail -10
fi

# Corrigir estrutura standalone
STANDALONE_DIR=".next/standalone"

APP_DIR=$(find "$STANDALONE_DIR" -maxdepth 1 -mindepth 1 -type d | head -1)

echo "Standalone encontrado em: $APP_DIR"


rm -rf "$APP_DIR/.next/static"
rm -rf "$APP_DIR/public"


cp -r .next/static "$APP_DIR/.next/"
cp -r public "$APP_DIR/"


echo "Arquivos static copiados"

# ── 7. Corrige permissoes ──
echo -e "${YELLOW}[7/9] Corrigindo permissoes...${NC}"
if [ "$REAL_USER" != "root" ]; then
  chown -R "$REAL_USER:$REAL_USER" "$SCRIPT_DIR"
  echo -e "${GREEN}  Permissoes atribuidas a $REAL_USER${NC}"
fi

# ── 8. PM2 ──
echo -e "${YELLOW}[8/9] Configurando servico PM2...${NC}"
SERVER_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost")
SECRET_VAL=$(grep NEXTAUTH_SECRET .env | cut -d= -f2)

cat > ecosystem.config.cjs << PM2EOF
module.exports = {
  apps: [{
    name: 'cozisteel-erp',
    script: '.next/standalone/server.js',
    cwd: '$SCRIPT_DIR',
    env: {
      NODE_ENV: 'production',
      PORT: '3000',
      DATABASE_URL: 'file:$SCRIPT_DIR/data/cozisteel.db',
      NEXTAUTH_SECRET: '$SECRET_VAL',
      NEXTAUTH_URL: 'http://$SERVER_IP:3000',
      STORAGE_PATH: '$SCRIPT_DIR/storage',
      LOG_PATH: '$SCRIPT_DIR/logs',
      BACKUP_PATH: '$SCRIPT_DIR/storage/backups',
    },
    instances: 1,
    autorestart: true,
    max_memory_restart: '512M',
    watch: false,
  }]
}
PM2EOF

# Para servico antigo se existir
pm2 delete cozisteel-erp 2>/dev/null || true
pm2 start ecosystem.config.cjs 2>&1 | tail -3
pm2 save 2>/dev/null || true

# ── 9. Resumo ──
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║  COZISTEEL ERP v3.0 — Instalado com Sucesso!        ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${CYAN}  Acesso:   ${GREEN}http://$SERVER_IP:3000${NC}"
echo -e "${CYAN}  Usuario:  ${GREEN}admin${NC}"
echo -e "${CYAN}  Senha:    ${GREEN}cozisteel2024${NC}"
echo ""
echo -e "${YELLOW}  IMPORTANTE: Altere a senha apos o primeiro acesso!${NC}"
echo ""
echo -e "${CYAN}  Comandos uteis:${NC}"
echo -e "    pm2 restart cozisteel-erp   ${GREEN}Reiniciar${NC}"
echo -e "    pm2 stop cozisteel-erp      ${GREEN}Parar${NC}"
echo -e "    pm2 logs cozisteel-erp      ${GREEN}Ver logs${NC}"
echo -e "    pm2 monit                   ${GREEN}Monitorar${NC}"
echo ""