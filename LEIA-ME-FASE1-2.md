# Padronização de documentos + Pedido de Venda + CNPJ automático

## 1. Padronização dos documentos

- **Romaneio de Transporte** agora usa o mesmo cartão (Cliente/Empresa) dos demais documentos
- **Relatórios** ganharam uma linha com nome/CNPJ da empresa no topo
- Confirmado (e reforçado): os dados da empresa em **todos** os PDFs vêm de
  `Configurações → Empresa` (tabela `SystemSetting`, grupo `company`) — nunca fixos
  no código. Se você mudar o CNPJ/endereço/telefone lá, todos os documentos futuros
  já saem atualizados, sem precisar mexer em nada.
- Ícones do rodapé comercial (Qualidade/Excelência/Compromisso/Confiança) corrigidos
  — agora são desenhados em vetor, nunca mais aparecem corrompidos

## 2. Módulo novo: Pedido de Venda

Fluxo implementado exatamente como descrito: **Orçamento → Pedido de Venda → OP**.

- Orçamento aprovado ganha um botão de carrinho 🛒 na lista — converte em Pedido de
  Venda (ação manual, o orçamento continua existindo normalmente)
- O Pedido de Venda herda cliente, itens, valores, condições de pagamento/prazo do
  orçamento, e mantém o vínculo (`quoteId`) para rastreabilidade
- Nova aba **Pedidos de Venda**: lista, filtro por status, PDF, e mostra quantas OPs
  já foram geradas a partir de cada pedido
- Na tela de **Nova Ordem de Produção**, apareceu a opção "Gerar a partir do Pedido
  de Venda" — escolhe o pedido, escolhe o item/produto, e os campos são preenchidos
  sozinhos, já vinculando a OP ao pedido

## 3. Preenchimento automático pelo CNPJ

Em **Cliente** e **Fornecedor**: ao digitar o CNPJ e sair do campo, o sistema busca
na **BrasilAPI** (pública, gratuita, sem necessidade de chave/cadastro) e preenche
sozinho: Razão Social, Nome Fantasia, Endereço, Bairro, Cidade, Estado, CEP e
Telefone (quando disponível). Só funciona para CNPJ (14 dígitos) — CPF não tem
esse tipo de consulta pública.

## Aplicar

```bash
unzip -o cozisteel-padronizacao-pedido-venda-cnpj.zip -d .
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

1. **CNPJ automático**: cadastra um cliente novo, digita um CNPJ real (ex: `19131243000197` — Magazine Luiza, só de exemplo), sai do campo — deve preencher sozinho
2. **Pedido de Venda**: aprova um orçamento → clica no carrinho → confirma → vai na aba Pedidos de Venda e confere se apareceu
3. **OP a partir do Pedido**: em Produção → Nova OP → escolhe o Pedido de Venda → escolhe o item → confere se preencheu produto/quantidade sozinho
4. **PDF do Pedido de Venda**: clica no ícone de PDF na lista de Pedidos de Venda
5. **Dados da empresa**: muda algo em Configurações → Empresa (ex: telefone) e gera um PDF novo — confere se already reflete a mudança

## O que fica para as próximas fases (você mesmo definiu essa ordem)

- Imagens nos produtos
- Sistema de atualização por Patch (por último)
