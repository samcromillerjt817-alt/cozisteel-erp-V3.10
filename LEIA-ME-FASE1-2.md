# Cozisteel ERP — Fase 1 + 2: Fornecedor, Matéria-Prima, Requisição e Automação OP

Este pacote contém **somente os arquivos novos/alterados**, com o mesmo caminho relativo
do projeto original. É só sobrepor na raiz do seu repositório.

## 1. Como aplicar

```bash
# na raiz do seu projeto cozisteel-erp-v3.0-1-
unzip -o cozisteel-erp-fase1-2.zip -d .
```

Isso vai:
- **Sobrescrever**: `prisma/schema.prisma`, `prisma/seed.ts`, `src/app/middleware/rbac.ts`,
  `src/app/dto/index.ts`, `src/app/services/pdf.service.ts`, `src/app/api/materials/route.ts`,
  `src/app/api/quotes/[id]/status/route.ts`, `src/app/api/products/[id]/route.ts`,
  `src/app/api/production-orders/[id]/route.ts`.
- **Criar** todas as rotas novas de Fornecedor, Matéria-Prima, Vínculo Produto↔Matéria-Prima
  e Requisição (lista completa abaixo).

## 2. Rodar a migração do banco

```bash
npx prisma migrate dev --name add-suppliers-materials-requisitions
npx prisma generate
```

Se estiver usando SQLite de desenvolvimento com dados de teste, isso apenas adiciona
tabelas/colunas novas — nada existente é apagado.

## 3. Reiniciar o servidor

```bash
npm run dev
```

## 4. O que foi implementado

### Modelos de dados (schema.prisma)
- `Material` ampliado: `internalCode`, `unit`, `stockQty`, `minStockQty`, `costPrice`, `notes`.
- `Supplier` — cadastro completo de fornecedor (razão social, CNPJ, contato, endereço, condições de pagamento, prazo médio).
- `SupplierMaterial` — vínculo N:N fornecedor↔matéria-prima (preço, código no fornecedor, prazo, fornecedor preferencial).
- `ProductMaterial` — "receita" de matéria-prima do produto (quantidade por unidade produzida + % de perda).
- `Requisition` / `RequisitionItem` — requisição de compra de matéria-prima, com fluxo de status e vínculo opcional a uma Ordem de Produção.

### Fluxo automatizado: Orçamento → Aprovação → OP/OF
`PATCH /api/quotes/[id]/status` — ao mudar o status para `approved`, o sistema agora
cria automaticamente uma Ordem de Produção para cada item do orçamento vinculado a um produto
cadastrado, usando a numeração `OP-000001` (via `NumberSequence`, tipo `op`).
A resposta inclui `generatedProductionOrders` com as OPs criadas.

### Endpoints novos

| Método | Rota | Descrição |
|---|---|---|
| GET/POST | `/api/suppliers` | Lista (com busca/paginação) e cria fornecedor |
| GET/PUT/DELETE | `/api/suppliers/[id]` | Detalhe, edição e exclusão de fornecedor |
| GET/POST | `/api/suppliers/[id]/materials` | Lista e vincula matérias-primas a um fornecedor (preço, prazo, preferencial) |
| DELETE | `/api/suppliers/[id]/materials/[materialId]` | Remove o vínculo |
| GET/POST | `/api/materials` | Lista (com busca/paginação/filtro de estoque baixo) e cria matéria-prima |
| GET/PUT/DELETE | `/api/materials/[id]` | Detalhe (com fornecedores e produtos vinculados), edição e exclusão |
| GET/POST | `/api/products/[id]/materials` | Lista e vincula matérias-primas ao produto, com quantidade e % de perda |
| DELETE | `/api/products/[id]/materials/[materialId]` | Remove o vínculo |
| GET/POST | `/api/requisitions` | Lista (filtros por status/OP) e cria requisição com itens |
| GET/PUT/DELETE | `/api/requisitions/[id]` | Detalhe, edição (somente rascunho) e exclusão |
| PATCH | `/api/requisitions/[id]/status` | Avança o fluxo: draft → sent → approved → ordered → partially_received/received → (dá entrada automática no estoque) |
| GET | `/api/requisitions/[id]/pdf` | PDF da requisição (pedido de compra) |
| POST | `/api/requisitions/suggest` | Recebe `{ productionOrderId }` e calcula a matéria-prima faltante, já sugerindo o fornecedor preferencial |
| GET | `/api/production-orders/[id]/pdf` | PDF da Ordem de Produção/Fabricação com a matéria-prima necessária |

### RBAC
Adicionados os módulos `fornecedores`, `requisicoes` e `producao` em
`src/app/middleware/rbac.ts`, com permissões por papel (admin/manager/user/viewer).

## 5. Exemplo de uso do ciclo completo

1. Cadastre matérias-primas: `POST /api/materials`
2. Cadastre fornecedores: `POST /api/suppliers`
3. Vincule fornecedor à matéria-prima: `POST /api/suppliers/[id]/materials`
4. Vincule matéria-prima ao produto (receita): `POST /api/products/[id]/materials`
5. Crie e aprove um orçamento normalmente → OP é gerada sozinha
6. Calcule a necessidade de compra: `POST /api/requisitions/suggest` com o `productionOrderId` da OP gerada
7. Crie a requisição com os itens sugeridos: `POST /api/requisitions`
8. Aprove e receba a requisição: `PATCH /api/requisitions/[id]/status` (`approved` → `ordered` → `received`) — o estoque da matéria-prima é atualizado automaticamente
9. Gere o PDF da requisição ou da OP quando precisar imprimir/enviar

## 6. O que ainda falta (próximas fases, não incluídas neste pacote)
- Telas (UI) para os módulos novos — hoje só o backend/API está pronto.
- Relatórios consolidados (estoque, produção, vendas) com exportação.
- PDF de relatório de posição de estoque.

Essas ficam para a Fase 5/6 do roadmap enviado anteriormente.
