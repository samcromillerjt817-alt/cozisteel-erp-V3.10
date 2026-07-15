# 🚀 Cozisteel ERP

> Sistema de gestão empresarial para empresas do ramo de móveis planejados, marcenarias, serralherias e fabricantes sob medida.

![Version](https://img.shields.io/badge/version-v4.0.0-blue)
![Status](https://img.shields.io/badge/status-Em%20Produção-success)
![License](https://img.shields.io/badge/license-MIT-green)

---

# 📖 Sobre o Projeto

O **Cozisteel ERP** centraliza os processos da empresa numa única plataforma, eliminando controles em planilhas: comercial, produção, compras, estoque, relatórios e gestão de usuários.

---

# ✨ Módulos

O menu é organizado por área de negócio:

## Comercial
- **Orçamentos** — criação rápida, cálculo automático (subtotal/desconto/frete), preenchimento automático de dados do cliente por **CNPJ** e **CEP**, PDF profissional, controle de status
- **Pedidos de Venda** — gerados a partir de um orçamento aprovado (fluxo `Orçamento → Pedido de Venda → OP`), mantendo o vínculo com o orçamento de origem
- **Clientes** — cadastro completo (CPF/CNPJ com preenchimento automático via BrasilAPI, endereço com preenchimento automático via ViaCEP, contatos, histórico)

## Produção
- **Produção** — Ordens de Produção, geradas manualmente ou a partir de um Pedido de Venda; ao concluir, dá baixa automática na matéria-prima (conforme a receita do produto) e entrada no estoque do produto acabado
- **Produtos** — cadastro completo, categoria, unidade, código interno, valores de custo/venda, múltiplas imagens por produto (uma marcada como principal)

## Suprimentos
- **Matérias-Primas** — cadastro dedicado (código, categoria, unidade, densidade, custo, estoque atual/mínimo), com visão de fornecedores vinculados e produtos que a consomem
- **Fornecedores** — cadastro completo com preenchimento automático por CNPJ, dados fiscais, histórico de compras
- **Requisições** — cotação de fornecedores por item, com seleção da cotação vencedora; ao aprovar e avançar para "Pedido feito", gera automaticamente um **Pedido de Compra** formal por fornecedor vencedor
- **Compras** — Pedidos de Compra gerados a partir da Requisição (numerados, com PDF ao fornecedor), com fluxo próprio `Rascunho → Enviado → Confirmado` e recebimento de mercadoria parcial ou total por item, dando entrada automática no estoque de matéria-prima
- **Estoque** — saldo consolidado (matéria-prima + produto acabado), histórico de movimentações com motivo e origem (OP, Pedido de Compra ou ajuste manual), ajuste manual de inventário

## Gestão
- **Relatórios** — Vendas, Produção, Compras e Estoque, com filtro de período/status, exportação em Excel/CSV e PDF

## Administração
- **Usuários** — autenticação, 9 perfis de acesso (Administrador, Gerente, Usuário, Visualizador, Comercial, Produção, Compras, Estoque, Financeiro), permissão aplicada tanto no menu quanto nas rotas de API (403 para quem não tem permissão)
- **Configurações** — dados da empresa (usados em todos os PDFs e relatórios gerados), numeração de documentos, atualizações do sistema

---

# 🔗 Como os Módulos se Conectam (fluxo de ponta a ponta)

O núcleo do sistema é um ciclo automatizado que liga Comercial → Produção → Suprimentos → Estoque.
Isso não é só documentação de intenção — cada seta abaixo é uma transição de status que dispara
código real (não é passo manual em vários módulos diferentes):

```
ORÇAMENTO
  │
  ├─ aprovado ──────► gera 1 Ordem de Produção por item vinculado a produto
  │                    (generateProductionOrdersFromQuote, quotes/[id]/status)
  │
  └─ "converter em pedido" (ação manual) ──► PEDIDO DE VENDA
                        registro comercial da venda; NÃO mexe em estoque —
                        quem baixa estoque é a Ordem de Produção, não o Pedido de Venda

ORDEM DE PRODUÇÃO
  │
  ├─ pode ser sugerida a partir de uma Requisição em aberto
  │   (calcula o que falta de matéria-prima pela receita/BOM do produto)
  │
  └─ concluída ──────► baixa matéria-prima (conforme a receita do produto)
                        + entrada do produto acabado no estoque
                        (production-orders/[id])

REQUISIÇÃO DE MATÉRIA-PRIMA
  │
  ├─ cotação de fornecedores por item → seleciona o vencedor
  │
  └─ "Pedido feito" (bloqueado se algum item não tiver vencedor) ──►
       gera 1 PEDIDO DE COMPRA por fornecedor vencedor, agrupando os itens
       (generatePurchaseOrdersFromRequisition, requisitions/[id]/status)

PEDIDO DE COMPRA
  │
  ├─ Rascunho → Enviado → Confirmado
  │
  └─ Recebimento (parcial ou total, por item) ──► entrada no estoque de
       matéria-prima + histórico de movimentação, e o próprio status do
       pedido é recalculado automaticamente (parcial/recebido)
```

**Pontos que valem atenção ao mexer nesse fluxo:**
- O Pedido de Venda é só o registro comercial — ele referencia as Ordens de Produção correspondentes só para exibição, não para disparar nada.
- Avançar uma Requisição para "Pedido feito" é bloqueado até todo item ter uma cotação vencedora selecionada — isso evita perder material da compra silenciosamente.
- Todo estoque de matéria-prima tem duas portas de entrada automáticas (conclusão de OP e recebimento de Pedido de Compra) e uma manual (ajuste de inventário); todas passam por `StockMovement` com motivo e origem, nunca só um número mudando sem rastro.

---

# 📄 Geração de PDF

Todos os documentos (proposta comercial, romaneio de transporte, requisição de compra, ordem de produção, relatórios) compartilham a mesma identidade visual: logo da empresa, cor institucional `#B21119`, cabeçalho e rodapé padronizados. Os dados da empresa exibidos vêm sempre de **Configurações → Empresa** — nunca fixos no código.

---

# 🛠️ Tecnologias

- Next.js + React + TypeScript
- Prisma ORM + SQLite
- TailwindCSS
- PM2 (produção)

---

# ⚙️ Instalação

```bash
git clone https://github.com/samcromillerjt817-alt/cozisteel-erp-V3.10.git
cd cozisteel-erp-V3.10
chmod +x install.sh
sudo bash install.sh
```

O `install.sh` instala o Node.js 20 LTS e o PM2 se necessário, cria o `.env` com segredo único, instala dependências, sincroniza o banco (`prisma db push`), builda em produção, sobe o processo no PM2 e registra a inicialização automática após reiniciar o Linux (`pm2 startup`).

Login padrão após a instalação: usuário `admin`, senha `cozisteel2024` (altere no primeiro acesso).

## Desenvolvimento local

```bash
npm install
npx prisma generate
npx prisma db push
npm run dev
```

**Ambiente Windows/WSL (acesso via caminho UNC, ex. `\\wsl.localhost\Ubuntu\...`)**: comandos `npx`/
`npm` (`prisma db push`, `tsc`, `lint`, `build`, `test`) falham quando executados diretamente a partir
de um shell Windows apontando para esse caminho — `npx.cmd`/`npm.cmd` disparam `cmd.exe`, que não
suporta caminho UNC como diretório de trabalho ("Não há suporte para caminhos UNC"). Execute sempre
através do WSL de verdade:

```bash
wsl.exe -e bash -lc "cd /home/julio/cozisteel-erp-V3.10 && <comando>"
```

Comandos puramente de shell (`git`, `ls`, leitura/edição de arquivo) funcionam normalmente a partir do
caminho UNC — a limitação é só dos wrappers `.cmd` do Node no Windows.

## Operação do dia a dia

```bash
pm2 restart cozisteel-erp   # reiniciar (precisa de build novo se o código mudou)
pm2 stop cozisteel-erp      # parar
pm2 logs cozisteel-erp      # ver logs
pm2 status                  # ver se está online
```

Se o site não subir sozinho após reiniciar o servidor, rode `bash start.sh` — ele mata qualquer processo preso na porta 3000, recria o processo no PM2 e garante que o `pm2 startup` esteja registrado.

---

# 🔄 Sistema de Atualização por Patch

Além do `install.sh` (setup completo do zero), o sistema tem um mecanismo próprio para aplicar atualizações incrementais sem reinstalar tudo:

```bash
./scripts/apply-patch.sh caminho/para/patch.zip
```

Faz backup automático (código + banco) antes de aplicar, builda, e **reverte sozinho** se o build falhar. Também pode ser aplicado direto pela tela **Configurações → Atualizações** (upload do `.zip`, restrito a admin), que mostra o progresso e mantém histórico de todas as atualizações aplicadas.

---

# 📌 Roadmap

- [ ] Financeiro completo (contas a pagar/receber, fluxo de caixa)
- [ ] Emissão de NF-e
- [ ] CRM
- [ ] Permissão por rota nas áreas ainda cobertas só por login simples (categorias, sequências numéricas, configurações, auditoria)
- [ ] Backup automático externo (hoje o backup de patch fica no mesmo servidor, em `storage/patches/backups/`)
- [ ] Multiempresa
- [ ] Aplicativo mobile

---

# 🔒 Segurança

- Autenticação por sessão
- Controle de permissões por perfil, reforçado tanto no menu quanto nas rotas de API sensíveis (criar/editar/excluir/mudar status)
- Validação de dados de entrada (Zod)
- Backup automático antes de cada atualização, com rollback em caso de falha

---

# 👨‍💻 Desenvolvedor

**Julio Augusto** — Cozisteel ERP, desenvolvido sob medida para as necessidades da empresa.
