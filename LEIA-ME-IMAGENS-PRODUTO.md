# Imagens de Produto

## O que veio

- Cada produto pode ter **várias fotos**, uma marcada como **principal**
- No cadastro de Produto (ao editar), nova seção "Imagens do produto": envia foto,
  passa o mouse pra ver os botões de "definir como principal" e "remover"
- A primeira foto enviada já vira principal automaticamente; se você apagar a
  principal, a próxima da lista assume sozinha
- A listagem de Produtos agora mostra uma miniatura (foto principal, ou um ícone
  cinza se não tiver nenhuma)
- Formatos aceitos: JPG, PNG, WEBP, GIF — até 8MB por arquivo

## Detalhe técnico importante (por que os arquivos não vão sumir no próximo rebuild)

As fotos **não** ficam em `public/` — ficam em `STORAGE_PATH` (a mesma pasta
`storage/` que já existe no seu `.env`), que fica **fora** de `.next`. Isso é
proposital: toda vez que você faz `rm -rf .next && npm run build`, a pasta
`public/` do projeto é recopiada por cima do `.next/standalone/public`, o que
apagaria qualquer foto que tivesse sido salva ali. Guardando em `storage/`
(fora do `.next`), as fotos sobrevivem a todos os seus rebuilds normais.

Um novo endpoint (`/api/uploads/...`) serve essas imagens diretamente da pasta
`storage/` — é por isso que as fotos aparecem com uma URL tipo
`/api/uploads/products/<id>/<arquivo>.jpg` em vez de `/uploads/...`.

**Atenção**: se você mudar o valor de `STORAGE_PATH` no `.env` depois de já ter
fotos salvas, as fotos antigas "somem" (o registro continua no banco, mas o
arquivo físico não é encontrado no novo caminho). Evite mudar esse valor depois
de começar a usar.

## Aplicar

```bash
unzip -o cozisteel-imagens-produto.zip -d .
npx prisma generate
npx prisma db push
rm -rf .next
npm run build
rm -rf .next/standalone/.next/static .next/standalone/public
cp -r .next/static .next/standalone/.next/
cp -r public .next/standalone/
pm2 restart cozisteel-erp
```

Confere que a pasta `storage/` existe e tem permissão de escrita para o usuário
que roda o PM2 (geralmente já existe, criada pelo `install.sh` original):
```bash
mkdir -p storage
chmod -R 755 storage
```

## Testar

1. Edita um produto existente → seção "Imagens do produto" → Enviar imagem
2. Confere que aparece a miniatura e a badge "Principal"
3. Envia uma segunda foto, clica em "definir como principal" nela
4. Remove uma foto e confere que some
5. Volta na listagem de Produtos → confere se a miniatura aparece na tabela
6. **Teste de persistência**: depois de subir as fotos, roda `rm -rf .next && npm run build` de novo (o ciclo normal de atualização) e confirma que as fotos continuam aparecendo
