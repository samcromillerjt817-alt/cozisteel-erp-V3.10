#!/bin/bash

PROJECT="/home/julio/cozisteel-erp-V3.10"

echo "🔍 Monitorando Graphify..."

while true
do

inotifywait -e modify \
-e close_write \
"$PROJECT/graphify-out/graph.json"

echo "🔄 Graphify alterado. Atualizando Obsidian..."

python3 "$PROJECT/graphify_to_obsidian.py"

echo "✅ Obsidian atualizado!"

done
