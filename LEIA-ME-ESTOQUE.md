# Módulo de Estoque — novo

Este pacote adiciona o módulo de Estoque de verdade, com histórico de movimentação.

## O que veio

### Schema (precisa rodar `npx prisma db push` depois de aplicar)
- `Product` ganhou `stockQty` e `minStockQty` (estoque de produto acabado)
- Novo model `StockMovement` — histórico oficial de toda entrada/saída/ajuste, com motivo, referência (qual OP ou requisição gerou) e usuário responsável

### Automação
- **OP concluída** (`status: completed`) → dá baixa automática na matéria-prima (conforme a receita do produto) **e** dá entrada no estoque do produto acabado. Cada baixa/entrada gera um registro em `StockMovement`.
- **Requisição recebida** → continua dando entrada na matéria-prima como antes, mas agora também registra o histórico em `StockMovement` (antes só mudava o número, sem rastro).

### Endpoints novos
- `GET /api/stock/summary?type=all|material|product&search=&lowStockOnly=true` — saldo atual combinado
- `GET /api/stock/movements?itemType=&materialId=&productId=` — histórico
- `POST /api/stock/adjust` — ajuste manual de inventário (contagem física), com motivo obrigatório

### Tela nova — aba "Estoque"
- **Saldo Atual**: lista matéria-prima + produto acabado juntos, com filtro por tipo, busca, e toggle "só estoque baixo". Cada linha tem botão de Ajustar e de Ver histórico.
- **Movimentações**: histórico completo, filtrável por item (ao clicar em "Ver histórico" de um item específico)
- Modal de ajuste mostra o saldo atual, pede o novo saldo e o motivo, e calcula a diferença antes de confirmar

### Correção adicional
- Removida a seta nativa de campos numéricos (`type="number"`) em **todo o sistema** — ela estava cobrindo o número digitado nos campos mais estreitos (Qtd, Valor Unit., etc.)

## Como aplicar

```bash
unzip -o cozisteel-modulo-estoque.zip -d .

npx prisma generate
npx prisma db push

rm -rf .next
npm run build
rm -rf .next/standalone/.next/static .next/standalone/public
cp -r .next/static .next/standalone/.next/
cp -r public .next/standalone/

pm2 restart cozisteel-erp
```

## Como testar o ciclo completo

1. Cadastra uma matéria-prima com estoque atual e mínimo
2. Vincula essa matéria-prima a um produto (receita)
3. Vai em Estoque → confere que a matéria-prima aparece com o saldo certo
4. Cria uma OP para esse produto e muda o status pra "Concluída"
5. Volta em Estoque → a matéria-prima deve ter baixado, e o produto acabado deve ter saldo novo
6. Clica em "Ver histórico" em qualquer um dos dois — deve aparecer o movimento com o motivo "Consumo na OP..." ou "Produção concluída..."
7. Testa também o ajuste manual: clica em "Ajustar", muda o número, escreve um motivo, confirma
