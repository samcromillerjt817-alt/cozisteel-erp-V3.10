# ADR-027 — Segurança de Produção (Hardening Pré-Exposição Pública)

- **Status**: Implementado e verificado
- **Data**: 2026-07-29
- **Origem**: o ERP passou a ficar acessível pela internet (Tailscale Funnel, `https://cozisteel-erp.tailb28391.ts.net`)
  desde o ADR-025/026. O usuário pediu explicitamente um hardening completo antes disso virar exposição
  real de produção: "o ERP vai ficar em domínio público... vamos focar em fechar todos os requerimentos
  de segurança", citando por nome os riscos que mais preocupam — derrubar servidor (DoS), invasão bruta,
  múltiplas tentativas até o servidor cair, vazamento de dados, acessos via URL.

## Parte 1 — O que foi implementado

### 1.1 Bloqueio de conta por força bruta (`src/lib/auth.ts`)

Novo campos em `User`: `failedLoginAttempts Int @default(0)`, `lockedUntil DateTime?`. Lógica extraída
pra uma função exportada e testável, `authorizeCredentials()` (antes vivia só dentro do callback
`authorize` do `CredentialsProvider`, impossível de testar diretamente):

- 5 tentativas erradas consecutivas bloqueiam a CONTA (não o IP) por 15 minutos.
- Guardado no banco, não em memória — sobrevive a um restart do PM2 (diferente da decisão do ADR-026
  pro rate limit, que aceitou estado em memória; aqui achamos que login merece sobreviver a restart).
- Login com a conta bloqueada falha de forma **idêntica** a senha errada — nunca revela que a conta
  existe e está bloqueada (evita virar um oráculo de enumeração de username).
- Login correto zera `failedLoginAttempts`/`lockedUntil` automaticamente.

**Achado relacionado, corrigido na mesma função**: `ensureDefaultAdminUser()` criava automaticamente
um usuário "admin" com senha hardcoded (`"cozisteel2024"`) sempre que a tabela `User` estivesse vazia —
um bootstrap de primeira instalação legítimo, mas com uma senha bem conhecida/documentada, agora
alcançável por qualquer um na tela de login pública. Corrigido: exige `DEFAULT_ADMIN_PASSWORD`
explicitamente configurado no ambiente; sem essa variável, o bootstrap simplesmente não cria ninguém
em vez de cair num valor padrão adivinhável.

### 1.2 Rate limiting global (`src/middleware.ts`, novo)

Primeiro `middleware.ts` deste projeto — roda antes de qualquer rota, no mesmo processo Node único do
PM2 (não é deploy serverless multi-instância, então o estado em memória dos limitadores persiste
corretamente entre requisições, mesmo raciocínio já usado no rate limit do ADR-026).

- **Login** (`/api/auth/callback/credentials`): 8 tentativas/minuto por IP, bloqueio de 2 minutos ao
  estourar — o alvo nº1 de força bruta, limite bem mais apertado que o resto. Complementa (não
  substitui) o bloqueio de conta por username acima: um pega "muitas senhas na mesma conta", o outro
  pega "muitas contas do mesmo IP".
- **Resto da API autenticada**: 300 requisições/minuto por IP — generoso o bastante pra nunca afetar
  uso legítimo, mas contém um script/bot martelando o servidor. `/api/public/*` (Catálogo Digital,
  ADR-026; link de orçamento, ADR-025) mantém seus próprios limites mais específicos, já existentes,
  sem duplicação.

### 1.3 Cabeçalhos de segurança (mesmo `middleware.ts`)

Aplicados a toda resposta: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
`Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (bloqueia câmera/microfone/
geolocalização/pagamento — nenhum desses é usado por este ERP), `X-DNS-Prefetch-Control: off`, e um
`Content-Security-Policy` (`default-src 'self'`, com `'unsafe-inline'` em script/style — necessário
pro próprio hydration do Next.js — e bloqueio de `object-src`, `frame-ancestors`, `base-uri` restrito
a `'self'`). `next/font/google` (Inter, Space Grotesk) já é auto-hospedado no build do Next.js — nenhum
recurso externo de verdade é carregado, então `'self'` cobre tudo sem quebrar nada. Testado ao vivo:
página principal e catálogo público renderizam normalmente com o CSP ativo.

### 1.4 Rotas de desenvolvimento bloqueadas em produção (mesmo `middleware.ts`)

`/dev/command-palette`, `/dev/datatable`, `/dev/exemplo-pagina` — páginas de validação isolada de
componente (dado fixo, "zero módulo real conectado", conforme os próprios comentários no código),
sem razão nenhuma de existir numa instância pública. Agora devolvem 404 quando `APP_ENV=production`.

## Parte 2 — Auditado e confirmado seguro (sem mudança necessária)

- **Vazamento de erro**: `handleRouteError`/`handleError` (existentes) já tratam qualquer erro
  desconhecido (não-`AppError`) devolvendo só uma mensagem genérica ao cliente e logando o detalhe
  completo só no servidor (`console.error`) — nenhum stack trace ou erro interno chega no cliente.
- **Cobertura de autenticação por rota**: varredura em toda `src/app/api/**/route.ts` (exceto `/public/*`
  e `/auth/*`) confirmando que TODO handler exportado (GET/POST/PUT/PATCH/DELETE) chama
  `requireAuth`/`requireModulePermission`/`requireRole` pelo menos uma vez — nenhuma rota totalmente
  desprotegida encontrada.
- **Console SQL administrativo** (`/api/admin/query`, ADR-021): exige `requireModulePermission('sistema',
  'manage')` — só `admin` tem essa combinação (`manager` só tem `sistema: ['read']`). Já é somente-
  leitura por design (só `SELECT`/`WITH`), bloqueia múltiplas instruções empilhadas, limita 500 linhas
  no próprio banco (não em memória), e audita toda consulta executada.
- **API de usuários**: `user.repository.ts` usa `select` explícito em toda leitura (`LIST_SELECT`/
  `DETAIL_SELECT`/`MUTATION_SELECT`) — o hash de senha nunca é incluído em nenhuma resposta.

## Parte 3 — Riscos conhecidos, não resolvidos agora (fora de escopo desta rodada)

- **CAPTCHA**: ainda não implementado em nenhum lugar (decisão já registrada no ADR-026 — condicional
  a evidência real de abuso, não implementado especulativamente).
- **CSP com `'unsafe-inline'`**: reduz a proteção contra XSS que um CSP mais estrito (nonce-based)
  daria — escolha pragmática pra não arriscar quebrar o hydration do Next.js sem uma bateria de testes
  visuais mais extensa. Revisitar se uma auditoria futura apontar necessidade de reforçar.
- **Rate limiting em memória** (tanto o global quanto o do ADR-026): não sobrevive a restart do PM2 nem
  escala pra múltiplas instâncias — adequado ao deploy atual (instância única), mesma decisão já tomada
  no ADR-026.

## Verificação

tsc limpo, lint 59 problemas (mesma contagem, 0 novos), 468/468 testes (16 novos: 8 em
`tests/auth-lockout.test.ts` cobrindo bloqueio/desbloqueio/expiração/conta inativa/campos ausentes, 8
já cobertos por testes anteriores desta sessão). Build limpo com `middleware.ts` reconhecido pelo
Next.js (`ƒ Proxy (Middleware)`). Testado ao vivo: rate limit de login bloqueia corretamente na 9ª
tentativa em 60s, `/dev/*` devolve 404 em produção, cabeçalhos de segurança presentes em toda resposta,
CSP não quebra o carregamento das páginas testadas. `prisma db push` aplicado em `test.db` e produção
(2 campos aditivos em `User`). PM2 reconstruído e reiniciado.
