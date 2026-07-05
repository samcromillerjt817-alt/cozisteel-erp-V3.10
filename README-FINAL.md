# Cozisteel ERP — Pacote Final Consolidado

Este pacote junta **tudo** que fizemos: os módulos novos (Fornecedor, Matéria-Prima,
Requisição, automação Orçamento→OP) **+ todos os bugs corrigidos** ao longo do processo
(saveCategory/saveMaterial ausentes, validação de e-mail, campo `revenue` errado no dashboard).

## Passo a passo completo, do zero

```bash
cd /home/julio/cozisteel-erp

# 0. mata qualquer processo antigo preso (roda sempre que algo travar)
pm2 delete cozisteel-erp 2>/dev/null
sudo fuser -k 3000/tcp 2>/dev/null
ps aux | grep -i next | grep -v grep   # confirma que não sobrou nada; se sobrar: kill -9 <PID>

# 1. aplica os arquivos deste pacote (sobrescreve os 23 arquivos alterados/criados)
unzip -o cozisteel-erp-FINAL.zip -d .

# 2. IMPORTANTE: apaga a pasta "app/" duplicada da raiz (NÃO é "src/app" — não mexe nessa)
#    Ela conflita com src/app e faz o build de produção sumir com as rotas de API.
rm -rf app

# 3. instala dependências (se ainda não tiver feito nesta instalação)
npm install

# 4. sincroniza o banco com o schema novo (Fornecedor, Matéria-prima, Requisição etc.)
npx prisma generate
npx prisma db push

# 5. garante que o usuário admin existe
npx prisma db seed

# 6. build de produção
rm -rf .next
npm run build

# 7. copia estáticos pro standalone (obrigatório, senão a tela fica quebrada/sem estilo)
rm -rf .next/standalone/.next/static .next/standalone/public
cp -r .next/static .next/standalone/.next/
cp -r public .next/standalone/

# 8. sobe com PM2
pm2 start ecosystem.config.cjs
pm2 save
pm2 logs cozisteel-erp --lines 30
```

Confirma que o `npm run build` do passo 6 lista **dezenas de rotas** (`/api/users`,
`/api/clients`, `/api/suppliers`, `/api/requisitions` etc.) — se listar só 3 rotas,
o passo 2 (apagar a pasta `app/`) não foi feito.

## Login

- Usuário: `admin`
- Senha: `cozisteel2024`

## Acesso

Confere o IP atual da máquina (pode mudar a cada reboot se for DHCP):
```bash
hostname -I
```
E ajusta o `.env` se precisar:
```
NEXTAUTH_URL=http://SEU_IP_OU_LOCALHOST:3000
```
Depois de mudar o `.env`: `pm2 restart cozisteel-erp`.

## Bugs corrigidos neste pacote (histórico)

1. **`saveCategory`/`saveMaterial` não existiam** no `page.tsx` — botões "Salvar categoria"
   e "Salvar material" quebravam a tela inteira. Corrigido.
2. **Validação de e-mail rejeitava campo vazio** no cadastro de usuário — `.email().optional()`
   não aceita string vazia no Zod, só `undefined`. Corrigido em `src/app/dto/index.ts`.
3. **Dashboard lia `dashStats.revenue`**, mas a API retorna `totalRevenue` — causava tela em
   branco ("This page couldn't load") logo após o login. Corrigido, e `formatCurrency` agora
   é blindado contra `undefined`/`NaN`.
4. **Pasta `app/` duplicada na raiz do projeto** conflitava com `src/app/` e fazia o build de
   produção (com Turbopack, que agora é o padrão e não pode mais ser desativado por flag)
   sumir com todas as rotas de API. Solução: apagar a pasta `app/` da raiz (passo 2 acima).

## Módulos novos implementados (backend/API)

Ver `LEIA-ME-FASE1-2.md` (incluído neste pacote) para a lista completa de endpoints de
Fornecedor, Matéria-prima, Requisição e a automação Orçamento→OP.

## Operação do dia a dia

- **Parar o servidor**: sempre `Ctrl+C` (nunca `Ctrl+Z` — isso suspende o processo sem matar,
  e ele fica preso segurando a porta 3000, causando erro `EADDRINUSE` na próxima vez que subir).
- **Reiniciar depois de mudar código**: precisa rebuildar (`npm run build` + copiar estáticos)
  e depois `pm2 restart cozisteel-erp`. Só `pm2 restart` sem rebuildar não pega o código novo.
- **Ver o que está rodando**: `pm2 list`
- **Ver logs em tempo real**: `pm2 logs cozisteel-erp`
