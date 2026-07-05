# Cotação de Fornecedores (Compras — parte 2)

Fecha o ciclo de Compras: **Requisição → Cotação → Pedido de Compra → Recebimento → Estoque**.
As últimas três etapas já existiam via status da Requisição; esta entrega adiciona a Cotação.

## O que veio

- Novo model `RequisitionItemQuote` — cada linha é "fornecedor X cotou R$ Y, prazo Z dias" para um item específico da requisição
- Botão **"Cotar fornecedores"** (ícone de pessoas) na lista de Requisições
- Dialog de comparação: para cada matéria-prima do pedido, mostra todas as cotações recebidas ordenadas por preço, com botão **Selecionar** na melhor
- Ao selecionar, o fornecedor e o preço voltam automaticamente para o item da requisição — isso é o que vira o "Pedido de Compra" quando você avança o status pra "Pedido feito"

## Aplicar

```bash
unzip -o cozisteel-cotacao.zip -d .
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

1. Cria uma requisição com pelo menos 1 item
2. Clica no ícone de pessoas ("Cotar fornecedores") na lista
3. Adiciona 2 ou 3 cotações do mesmo item, com fornecedores e preços diferentes
4. Clica em "Selecionar" na mais barata
5. Confirma que aparece "★ Vencedora" e que fecha o dialog sem erro
6. Avança o status da requisição pra "Pedido feito" — o item já deve estar com o fornecedor/preço da cotação vencedora
