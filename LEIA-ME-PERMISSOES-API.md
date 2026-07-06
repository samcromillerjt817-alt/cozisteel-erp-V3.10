# Reforço de Permissão nas APIs (por trás do menu)

Fecha a lacuna documentada na entrega anterior: agora as rotas de escrita (criar,
editar, excluir, mudar status) checam de verdade a permissão do perfil do usuário,
não só escondem o botão na tela.

## Como funciona

Novo helper em `src/lib/api-utils.ts`:

```ts
export async function requireModulePermission(module: Module, action: Action): Promise<SessionUser>
```

Ele: (1) exige login, (2) consulta a mesma tabela de permissões do `rbac.ts`
(a que já define os 9 perfis), (3) devolve **403 Forbidden** com mensagem clara se o
perfil não tiver a permissão.

## Rotas protegidas nesta entrega

| Módulo | Rotas |
|---|---|
| Fornecedores | criar, editar, excluir |
| Requisições | criar, editar, excluir, mudar status |
| Matéria-prima | criar, editar, excluir |
| Estoque | ajuste manual |
| Produtos | criar, editar, excluir |
| Clientes | criar, editar, excluir |
| Orçamentos | criar, editar, excluir, mudar status |
| Ordens de Produção | criar, editar, excluir |

## O que ainda não foi coberto (fica pra uma próxima passada, se quiser)

- Categorias, Sequências numéricas, Configurações/Settings, Auditoria — rotas menos
  sensíveis, ainda usam só `requireAuth()` simples (qualquer usuário logado pode mexer)
- Vínculos (Produto↔Matéria-prima, Fornecedor↔Matéria-prima, itens de cotação) —
  ainda sem checagem de permissão própria, herdam o acesso de quem consegue entrar na tela
- Usuários — já tinha proteção própria (`admin`/`manager`) desde antes, não mexi

## Aplicar

```bash
unzip -o cozisteel-permissoes-api.zip -d .
rm -rf .next
npm run build
rm -rf .next/standalone/.next/static .next/standalone/public
cp -r .next/static .next/standalone/.next/
cp -r public .next/standalone/
pm2 restart cozisteel-erp
```

## Testar

1. Loga com um usuário de perfil **Financeiro** (que só tem leitura de Orçamentos, não criação)
2. Tenta criar um orçamento **direto pela API** (já que o menu nem mostra o botão pra esse perfil):
   ```bash
   curl -X POST http://localhost:3000/api/quotes -H "Content-Type: application/json" -b "SEU_COOKIE" -d '{}'
   ```
3. Deve voltar **403** com mensagem "Você não tem permissão para criar este recurso"
4. Repete o teste normal pela tela com um perfil que TEM permissão (ex: Comercial criando orçamento) — deve funcionar normal
