# Sistema de Atualização por Patch

## O que veio

### 1. `scripts/apply-patch.sh` — aplica uma atualização com segurança
```bash
./scripts/apply-patch.sh caminho/para/patch.zip
```
Faz, em ordem: lê o manifesto (`patch.json`) → **backup automático** do código e
do banco → extrai os arquivos novos → `npm install` / `prisma migrate` (só se o
patch pedir) → build → **se o build falhar, reverte tudo sozinho** (rollback) →
copia estáticos → reinicia o PM2 → registra a atualização no histórico.

### 2. `scripts/build-patch.sh` — empacota uma atualização no formato certo
```bash
./scripts/build-patch.sh --to=3.1.0 --title="Módulo X" \
  --prisma-migrate=true --output=patch-3.1.0.zip \
  prisma/schema.prisma src/app/page.tsx src/app/api/algo/route.ts
```
Isso é o que eu vou usar daqui pra frente pra empacotar as próximas atualizações
que te mandar — já no formato que o `apply-patch.sh` e a tela de upload entendem.

### 3. Tela "Configurações → Atualizações"
- Mostra a versão atual
- Upload de um patch `.zip` direto pela tela (só admin) — o sistema aplica sozinho
  em segundo plano (backup → build → restart), com uma barra de progresso simples
  que acompanha o andamento
- Histórico de todas as atualizações aplicadas (data, versão, título, se foi via
  terminal ou upload, se deu certo/falhou/foi revertido, quem aplicou)

## Formato do patch (`patch.json`, dentro do .zip)

```json
{
  "version": "3.1.0",
  "title": "Módulo de Estoque",
  "description": "Adiciona controle de estoque com histórico",
  "requiresNpmInstall": false,
  "requiresPrismaMigrate": true
}
```

## Aplicar ESTA atualização (o sistema de patch em si)

Como esta é a primeira vez, aplica manualmente pelo processo de sempre (as
próximas já virão como um `.zip` pronto pra usar o novo sistema):

```bash
unzip -o cozisteel-sistema-patch.zip -d .
chmod +x scripts/apply-patch.sh scripts/build-patch.sh
npx prisma generate
npx prisma db push
rm -rf .next
npm run build
rm -rf .next/standalone/.next/static .next/standalone/public
cp -r .next/static .next/standalone/.next/
cp -r public .next/standalone/
pm2 restart cozisteel-erp
```

## Avisos importantes de segurança (leia antes de usar em produção)

1. **Teste primeiro em um horário de baixo movimento.** Aplicar um patch reinicia
   o sistema — mesmo com backup automático, evite fazer isso no meio do expediente
   até se sentir confortável com o processo.
2. **O backup cobre código e banco, mas fica no mesmo servidor** (dentro de
   `storage/patches/backups/`). Isso não substitui um backup externo/externo de
   verdade — se o disco falhar, o backup falha junto. Recomendo combinar com uma
   rotina de backup externo (isso é um item futuro da sua lista, "backup
   automático" — ainda não implementado).
3. **O upload pela tela dispara um processo em segundo plano que reinicia o
   servidor.** Isso significa que a própria aba do navegador pode perder conexão
   por alguns segundos durante o restart — é esperado, só recarregar a página
   depois de 1-2 minutos.
4. **Teste primeiro pelo terminal** (`./scripts/apply-patch.sh`) antes de confiar
   no botão de upload em um ambiente de produção real — o terminal te dá
   visibilidade direta de cada passo, o que ajuda a pegar confiança no processo.
5. Como você mencionou instalar em outros servidores/clientes no futuro: o script
   detecta sozinho o nome do processo PM2 (lendo `ecosystem.config.cjs`) e o
   caminho do banco (lendo `.env`) — não tem nada fixo do seu servidor específico,
   deve funcionar em qualquer instalação que siga a mesma estrutura de pastas.

## Testar

1. Roda `./scripts/build-patch.sh --to=3.0.1 --title="Teste" --output=teste.zip README.md`
   (empacota um arquivo qualquer só pra testar o fluxo, sem mexer em nada real)
2. Aplica pelo terminal: `./scripts/apply-patch.sh teste.zip`
3. Confere se rodou sem erro e se a versão mudou em Configurações → Atualizações
4. Testa o upload pela tela com esse mesmo `teste.zip`
