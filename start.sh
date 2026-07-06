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

echo
echo "ERP iniciado com sucesso!"
pm2 status