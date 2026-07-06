# 🚀 Cozisteel ERP v3.10

> Sistema ERP moderno desenvolvido para empresas do ramo de móveis planejados, marcenarias, serralherias e fabricantes sob medida.

![Version](https://img.shields.io/badge/version-v3.10-blue)
![Status](https://img.shields.io/badge/status-Em%20Desenvolvimento-success)
![License](https://img.shields.io/badge/license-MIT-green)

---

# 📖 Sobre o Projeto

O **Cozisteel ERP** é um sistema de gestão empresarial desenvolvido para centralizar todos os processos da empresa em uma única plataforma.

O objetivo do projeto é eliminar controles em planilhas, reduzir retrabalho e automatizar processos como:

- Cadastro de clientes
- Cadastro de produtos
- Controle de fornecedores
- Orçamentos
- Geração de PDF profissional
- Compras
- Estoque
- Financeiro
- Gestão de usuários
- Dashboard com indicadores

O sistema está sendo desenvolvido com foco em **performance**, **usabilidade**, **segurança** e **facilidade de implantação**.

---

# 🎯 Objetivos

O Cozisteel ERP busca oferecer uma solução completa para empresas que precisam controlar:

- Comercial
- Produção
- Compras
- Estoque
- Financeiro
- Clientes
- Fornecedores
- Usuários

Tudo em um único sistema.

---

# ✨ Principais Funcionalidades

## 👥 Clientes

- Cadastro completo
- CPF/CNPJ
- Endereços
- Contatos
- Histórico
- Situação do cliente

---

## 🏭 Fornecedores

- Cadastro completo
- Dados fiscais
- Contatos
- Histórico de compras

---

## 📦 Produtos

- Cadastro de produtos
- Categoria
- Unidade
- Código interno
- Código de barras
- Controle de estoque
- Valor de custo
- Valor de venda

---

## 📄 Orçamentos

Um dos principais módulos do sistema.

Permite:

- Criar orçamentos rapidamente
- Inserir produtos
- Calcular automaticamente
- Aplicar descontos
- Inserir observações
- Alterar status

Além disso, o sistema gera um **PDF profissional** para envio ao cliente.

---

## 🖼️ PDF Inteligente

O sistema possui geração automática de PDF.

Entre as melhorias planejadas:

- PDF com imagens dos produtos
- PDF sem imagens (modo compacto)
- Logotipo da empresa
- Layout profissional
- Assinatura
- Observações
- Condições comerciais

---

## 🛒 Requisição de Compra

Módulo desenvolvido para facilitar o processo de compras.

Permite:

- Criar requisições
- Informar prioridade
- Centro de custo
- Solicitante
- Justificativa
- Aprovação
- Controle de status

---

## 📊 Dashboard

Painel com indicadores da empresa.

Exemplos:

- Total de clientes
- Total de produtos
- Total de vendas
- Pedidos pendentes
- Estoque
- Financeiro

---

## 🔐 Controle de Usuários

Sistema de autenticação.

Controle de:

- Login
- Senha
- Perfis
- Permissões
- Auditoria

---

## 📈 Futuras Implementações

Planejamento da versão 3.x

- CRM
- Agenda
- Controle financeiro completo
- Fluxo de caixa
- Contas a pagar
- Contas a receber
- Emissão de NF-e
- Integração com APIs
- Integração por CNPJ (preenchimento automático de empresa)
- Backup automático
- Logs do sistema
- Multiempresa
- Multiusuário
- Relatórios inteligentes
- Indicadores em tempo real

---

# 🛠️ Tecnologias

O projeto utiliza tecnologias modernas para garantir desempenho e escalabilidade.

Exemplos:

- Next.js
- React
- TypeScript
- Node.js
- Prisma
- PostgreSQL
- TailwindCSS
- PM2
- Docker (planejado)

---

# 📁 Estrutura do Projeto

```
cozisteel-erp/

├── app/
├── components/
├── prisma/
├── public/
├── lib/
├── scripts/
├── styles/
├── docs/
├── package.json
└── README.md
```

---

# ⚙️ Instalação

Clone o projeto

```bash
git clone https://github.com/seu-usuario/cozisteel-erp.git
```

Entre na pasta

```bash
cd cozisteel-erp
```

Instale as dependências

```bash
npm install
```

Configure o banco de dados.

Execute as migrations

```bash
npx prisma migrate deploy
```

Inicie o sistema

```bash
npm run dev
```

Ou utilize o script de instalação:

```bash
chmod +x install.sh

./install.sh
```

---

# 🚀 Produção

Build

```bash
npm run build
```

Executar

```bash
npm start
```

Ou utilizando PM2

```bash
pm2 start ecosystem.config.js
```

---

# 📌 Roadmap

- [x] Cadastro de clientes
- [x] Cadastro de produtos
- [x] Cadastro de fornecedores
- [x] Orçamentos
- [x] Geração de PDF
- [x] Dashboard
- [x] Sistema de login
- [x] Controle de usuários
- [ ] Financeiro
- [ ] Compras completas
- [ ] CRM
- [ ] NF-e
- [ ] API pública
- [ ] Aplicativo Mobile

---

# 🔒 Segurança

O sistema foi desenvolvido seguindo boas práticas de segurança:

- Autenticação
- Controle de permissões
- Proteção de rotas
- Validação de dados
- Tratamento de erros

---

# 🤝 Contribuições

Contribuições são bem-vindas.

Caso encontre algum problema ou tenha sugestões, abra uma Issue ou envie um Pull Request.

---

# 👨‍💻 Desenvolvedor

**Julio Augusto**

Projeto desenvolvido com foco em criar um ERP moderno, rápido e escalável para empresas brasileiras.

---

# ⭐ Apoie o Projeto

Se este projeto foi útil para você, deixe uma ⭐ no repositório.

Isso ajuda bastante no crescimento do projeto.
