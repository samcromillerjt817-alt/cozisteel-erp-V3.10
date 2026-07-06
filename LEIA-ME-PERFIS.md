# Perfis de Permissão por Setor

## O que mudou

**5 novos perfis**, além dos 4 que já existiam (Administrador, Gerente, Usuário, Visualizador):

| Perfil | Acesso principal |
|---|---|
| **Comercial** | Orçamentos e Clientes completo; leitura de Produtos/Produção/Estoque/Relatórios |
| **Produção** | Ordens de Produção completo; cria/edita Requisições; leitura do resto |
| **Compras** | Fornecedores e Requisições completo; leitura/edição de Matéria-prima |
| **Estoque** | Estoque completo (ajustes, movimentações); leitura/edição de Matéria-prima |
| **Financeiro** | Relatórios completo (é o dono dos números); leitura de Orçamentos |

## Correção importante junto

Até agora, o **menu lateral mostrava todos os módulos pra todo mundo** (só Usuários e
Configurações eram bloqueados por perfil) — o controle fino de permissão existia no
backend (`rbac.ts`) mas nunca era realmente consultado pela tela. Agora o menu lateral
consulta a mesma tabela de permissões do backend: cada perfil só vê no menu os módulos
que tem permissão de leitura.

**Atenção**: isso é enforcement só na tela (esconder/mostrar menu). As APIs do backend
continuam usando `requireAuth()` simples na maioria das rotas (só a criação de usuário
já exigia `admin`) — ou seja, um usuário tecnicamente ainda consegue chamar a API
diretamente se souber o endpoint, mesmo sem o módulo aparecer pra ele no menu. Reforçar
isso em cada rota é um trabalho maior à parte, me avisa se quiser que eu faça isso a seguir.

## Aplicar

```bash
unzip -o cozisteel-perfis-setor.zip -d .
rm -rf .next
npm run build
rm -rf .next/standalone/.next/static .next/standalone/public
cp -r .next/static .next/standalone/.next/
cp -r public .next/standalone/
pm2 restart cozisteel-erp
```

## Testar

1. Cria um usuário novo com perfil "Compras"
2. Faz logout do admin, loga com esse usuário novo
3. Confere que o menu lateral mostra só: Dashboard, Fornecedores, Requisições, Matérias-primas (leitura), Estoque (leitura), Relatórios — e não mostra Usuários/Configurações
4. Repete com os outros perfis pra conferir
