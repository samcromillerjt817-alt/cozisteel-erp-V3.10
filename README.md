# 🚀 Cozisteel ERP

> Sistema de gestão empresarial para empresas do ramo de móveis planejados, marcenarias, serralherias e fabricantes sob medida.

![Version](https://img.shields.io/badge/version-v3.1.0-blue)
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
- **Requisições** — fluxo completo `Requisição → Cotação de Fornecedores → Pedido de Compra → Recebimento → Estoque`; a tela de cotação compara preços/prazos de múltiplos fornecedores por item e seleciona o vencedor automaticamente
- **Estoque** — saldo consolidado (matéria-prima + produto acabado), histórico de movimentações com motivo e origem (OP, requisição ou ajuste manual), ajuste manual de inventário

## Gestão
- **Relatórios** — Vendas, Produção, Compras e Estoque, com filtro de período/status, exportação em Excel/CSV e PDF

## Administração
- **Usuários** — autenticação, 9 perfis de acesso (Administrador, Gerente, Usuário, Visualizador, Comercial, Produção, Compras, Estoque, Financeiro), permissão aplicada tanto no menu quanto nas rotas de API (403 para quem não tem permissão)
- **Configurações** — dados da empresa (usados em todos os PDFs e relatórios gerados), numeração de documentos, atualizações do sistema

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
