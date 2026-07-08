#!/usr/bin/env bash
#
# scripts/build-patch.sh — empacota um conjunto de arquivos alterados num patch.zip
# pronto para ser aplicado via ./scripts/apply-patch.sh ou pela tela de Atualizações.
#
# Uso:
#   ./scripts/build-patch.sh \
#     --to=3.1.0 \
#     --title="Módulo de Estoque" \
#     --description="Adiciona controle de estoque com histórico" \
#     --npm-install=false \
#     --prisma-migrate=true \
#     --output=cozisteel-patch-3.1.0.zip \
#     arquivo1 arquivo2 pasta/ ...
#
# Os arquivos/pastas informados no final são copiados preservando o caminho
# relativo à raiz do projeto (rode a partir da raiz do projeto).

set -euo pipefail

TO_VERSION=""
TITLE=""
DESCRIPTION=""
NPM_INSTALL="false"
PRISMA_MIGRATE="false"
OUTPUT=""
FILES=()

for arg in "$@"; do
  case "$arg" in
    --to=*) TO_VERSION="${arg#*=}" ;;
    --title=*) TITLE="${arg#*=}" ;;
    --description=*) DESCRIPTION="${arg#*=}" ;;
    --npm-install=*) NPM_INSTALL="${arg#*=}" ;;
    --prisma-migrate=*) PRISMA_MIGRATE="${arg#*=}" ;;
    --output=*) OUTPUT="${arg#*=}" ;;
    *) FILES+=("$arg") ;;
  esac
done

if [ -z "$TO_VERSION" ] || [ ${#FILES[@]} -eq 0 ]; then
  echo "Uso: $0 --to=X.Y.Z --title=\"...\" [outras opções] arquivo1 arquivo2 pasta/ ..."
  exit 1
fi
if [ -z "$OUTPUT" ]; then OUTPUT="cozisteel-patch-$TO_VERSION.zip"; fi

WORKDIR=$(mktemp -d)
trap 'rm -rf "$WORKDIR"' EXIT

for f in "${FILES[@]}"; do
  if [ -d "$f" ]; then
    mkdir -p "$WORKDIR/$(dirname "$f")"
    cp -r "$f" "$WORKDIR/$f"
  elif [ -f "$f" ]; then
    mkdir -p "$WORKDIR/$(dirname "$f")"
    cp "$f" "$WORKDIR/$f"
  else
    echo "AVISO: '$f' não encontrado, pulando."
  fi
done

cat > "$WORKDIR/patch.json" <<EOF
{
  "version": "$TO_VERSION",
  "title": "$TITLE",
  "description": "$DESCRIPTION",
  "requiresNpmInstall": $NPM_INSTALL,
  "requiresPrismaMigrate": $PRISMA_MIGRATE,
  "createdAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

(cd "$WORKDIR" && zip -r "$OLDPWD/$OUTPUT" . -x ".*") > /dev/null
echo "✓ Patch criado: $OUTPUT"
