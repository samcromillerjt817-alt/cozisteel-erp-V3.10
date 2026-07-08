#!/bin/bash

echo "======================================="
echo "   Iniciando Cozisteel ERP..."
echo "======================================="

cd ~/cozisteel-erp-V3.10 || exit 1

# Mata qualquer processo usando a porta 3000
fuser -k 3000/tcp >/dev/null 2>&1

# Remove processo antigo do PM2 (se existir)
pm2 delete cozisteel-erp >/dev/null 2>&1

# Inicia o sistema
pm2 start npm --name cozisteel-erp -- start

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