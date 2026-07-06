# Módulo de Relatórios

## O que veio

Nova aba **Relatorios** no menu, com 4 tipos:

- **Vendas** — orçamentos por período/status, com subtotal, desconto e total
- **Produção** — Ordens de Produção por período/status
- **Compras** — itens de requisição por período/status, com fornecedor e preço
- **Estoque** — posição atual (matéria-prima + produto acabado, sem filtro de data — é uma foto do momento)

Cada relatório tem:
- Filtro de período (De/Até, formato dd/mm/aaaa) e status
- Cartões de resumo (totais, quantidade, valor)
- Tabela com os dados
- **Exportar Excel/CSV** — gera um `.csv` com separador `;` (abre direto no Excel)
- **Exportar PDF** — gera PDF em paisagem com cabeçalho, resumo e tabela

## Detalhe técnico

Não usei nenhuma biblioteca nova — a exportação "Excel" é CSV (o Excel abre nativamente,
sem precisar instalar nada a mais no servidor). O PDF reaproveita o `jsPDF` que já
estava no projeto. Isso significa que **não precisa rodar `npm install` de novo**,
só o build normal.

## Aplicar

```bash
unzip -o cozisteel-relatorios.zip -d .
rm -rf .next
npm run build
rm -rf .next/standalone/.next/static .next/standalone/public
cp -r .next/static .next/standalone/.next/
cp -r public .next/standalone/
pm2 restart cozisteel-erp
```

## Testar

1. Vai em Relatorios
2. Escolhe "Vendas", deixa período em branco (traz tudo), clica em Gerar Relatório
3. Confere os cartões de resumo e a tabela
4. Clica em "Exportar Excel/CSV" — deve baixar um arquivo `.csv`
5. Clica em "Exportar PDF" — deve abrir um PDF em nova aba
6. Repete pra Produção, Compras e Estoque
