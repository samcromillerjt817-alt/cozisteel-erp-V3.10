# Módulo de Matéria-Prima dedicado

## O que mudou

- Matéria-prima agora tem **aba própria** no menu ("Materias-Primas"), separada de Produtos
- Adicionado **categoria** à matéria-prima (reaproveita o mesmo cadastro de categoria usado em Produtos)
- Cadastro completo na tela: código interno, nome, categoria, unidade, densidade, custo, estoque atual/mínimo, descrição, observações
- Ao editar uma matéria-prima, aparecem (somente leitura) os **fornecedores vinculados** e os **produtos que a consomem** — visão rápida de onde ela é usada
- Removido o mini-formulário antigo dentro de Produtos (que só tinha nome/densidade/descrição) — agora há um botão "Ir para Matérias-primas" no lugar

## Aplicar

```bash
unzip -o cozisteel-modulo-materiais.zip -d .
npx prisma generate
npx prisma db push
rm -rf .next
npm run build
rm -rf .next/standalone/.next/static .next/standalone/public
cp -r .next/static .next/standalone/.next/
cp -r public .next/standalone/
pm2 restart cozisteel-erp
```

## Testar

1. Vai em Materias-Primas → Nova
2. Preenche código, nome, categoria (pode criar uma nova categoria antes em Produtos, se quiser), unidade, custo, estoque
3. Salva, confere que aparece na lista com o filtro de categoria funcionando
4. Vincula essa matéria-prima a um Fornecedor e a um Produto (nas telas correspondentes)
5. Volta em Materias-Primas, edita o item, e confere se aparecem o fornecedor e o produto vinculados na parte de baixo do formulário
