#!/bin/bash

echo "======================================="
echo "   Iniciando Cozisteel ERP..."
echo "======================================="

# Descobre a propria pasta em vez de assumir "~/cozisteel-erp-V3.10" - o install.sh ja
# faz isso (SCRIPT_DIR), evita quebrar se o repositorio for clonado com outro nome/caminho.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR" || exit 1

if [ ! -f ecosystem.config.cjs ]; then
  echo "ERRO: ecosystem.config.cjs nao encontrado. Rode 'sudo bash install.sh' primeiro."
  exit 1
fi

# Mata qualquer processo usando a porta 3000
fuser -k 3000/tcp >/dev/null 2>&1

# Remove processo antigo do PM2 (se existir)
pm2 delete cozisteel-erp >/dev/null 2>&1

# Inicia o sistema pelo mesmo ecosystem.config.cjs que o install.sh gera - garante os
# mesmos env vars (DATABASE_URL, NEXTAUTH_SECRET, etc.) em vez de depender do Next.js
# carregar o .env sozinho por fora do PM2.
pm2 start ecosystem.config.cjs

# Salva a configuração do PM2
pm2 save

# Garante que o PM2 religue o ERP sozinho quando o Linux (WSL) reiniciar.
# "pm2 save" só grava a lista de processos em disco — sem isso, nada chama
# "pm2 resurrect" no boot e o site fica fora do ar até rodar este script na mão.
if ! systemctl is-enabled "pm2-$USER" >/dev/null 2>&1; then
  echo
  echo "Configurando o PM2 para iniciar sozinho apos reiniciar o Linux..."
  sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u "$USER" --hp "$HOME" >/dev/null
  pm2 save
fi

echo
echo "ERP iniciado com sucesso!"
pm2 status