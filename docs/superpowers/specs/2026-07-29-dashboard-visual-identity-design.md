# Evolução visual do Dashboard — MOBSTEEL ERP

Data: 2026-07-29
Página-piloto: Dashboard (`src/app/page.tsx` branch `activeModule === 'dashboard'` + `src/components/dashboard/*`)
Escopo: tokens globais (aditivos, não destrutivos) + shell (sidebar/topbar) + Dashboard completo.

## Diagnóstico (resumo)

- Sem rota própria: o Dashboard é um branch dentro de `page.tsx`, um único componente cliente monolítico que também é o shell do app inteiro (sidebar + topbar hand-rolled, sem usar o `ui/sidebar.tsx` do shadcn, que está órfão/não importado em lugar nenhum).
- Tokens em `globals.css` (Tailwind v4, `@theme inline`): `--primary` (#b21118), `--destructive` (#dc2626, um vermelho diferente e próximo demais do primary), radius único (`--radius: 0.5rem`) via `calc()`, paleta de gráfico (`--chart-cat-1..8`) duplicada manualmente do arquivo `erp-chart-palette.ts`. **Não existem tokens semânticos de severidade** — cada componente usa classes Tailwind cruas (`text-red-600`, `bg-amber-500/10` etc.), um terceiro vermelho não relacionado aos outros dois.
- `.bg-app`/`.text-app`/`.card-app` (usadas no shell do app inteiro, login incluso) têm cor **hardcoded em hex**, duplicando valores que os tokens já têm.
- Tipografia: Inter (corpo) + Space Grotesk (títulos, `h1-h6`, já globalmente ativa) — a combinação já existe, só está subaproveitada (nenhum peso/tracking deliberado, lê como "quase Inter de novo").
- Dados reais confirmados (nada inventado): 3 severidades de alerta (`critical`/`warning`/`info`, nunca "resolvido" — esse estado não existe no domínio); pipeline de 6 etapas fixas (Orçamento→Pedido→Produção→Compra→Entrega→Financeiro) computadas a partir de Quote/SalesOrder/ProductionOrder/Requisition+PurchaseOrder/Shipment/AccountReceivable+Payable; 53 widgets reais catalogados em 6 domínios.
- `framer-motion` está no `package.json` mas **zero uso real** — livre para introduzir sem conflito.
- Achados de inconsistência a corrigir nesta mesma passada (fazem parte do "fundamento visual", não são scope creep): 2 componentes de KPI quase-duplicados (`dashboard-widget-card.tsx` + `dashboard-module-summary-card.tsx`), 3 blocos de skeleton copy-colados idênticos, `Badge`/`Tooltip` primitives existentes e não usados onde fariam sentido, valores arbitrários (`text-[11px]`, `text-[10px]`).

Capturas do estado atual: login, Centro de Operações (pipeline zerado + alerta crítico com borda vermelha grande), Comercial (gráfico vazio truncado "Taxa de conver...", estado "tudo em ordem").

## Conceito

**MOBSTEEL — Engenharia para Cozinhas Profissionais.** Traduzido em decisões concretas (não em texturas literais):
- **Frio × Quente como sistema semântico real**, não decoração: aço inox/refrigeração = os estados "bons" (sucesso), calor/cocção = os estados "críticos". Isso resolve o problema de "vermelho para tudo" com uma lógica que vem do próprio domínio da empresa, não de uma paleta genérica de dashboard.
- **Instrumentação, não ilustração**: números com `tabular-nums` (não tremem ao atualizar, como um mostrador de precisão), linhas finas como costura de painel de equipamento (não sombra-em-tudo), o already-existing "risco vermelho ao lado do título de seção" (convenção que eu mesmo usei nos PDFs) reaproveitado aqui pela primeira vez na tela — consistência entre os dois artefatos da marca.

## Paleta (aditiva — nenhum token existente é redefinido)

| Token novo | Valor | Papel |
|---|---|---|
| `--ms-critical` | `#C2410C` (laranja queimado) | Crítico — "calor/urgência", deliberadamente NÃO vermelho de marca, pra não competir com seleção/ação |
| `--ms-warning` | `#B45309` (âmbar) | Atenção |
| `--ms-success` | `#0F766E` (teal) | Sucesso/OK — lado "frio/inox/higiene" |
| `--ms-info` | `#33608A` (azul-aço) | Informativo — tom de linha de desenho técnico |
| `--ms-surface-2` | `#F4F5F6` | Superfície secundária (cards sobre fundo) |
| `--ms-radius-sm/md/lg` | 6/10/14px | Substituem o único `--radius` calc() por 3 valores explícitos |

`--primary` (#b21118) continua sendo A cor da marca: seleção, ação primária, número em destaque. `--destructive` (#dc2626) fica intocado (usado fora do Dashboard também, fora de escopo).

## Tipografia
Sem trocar fontes. Space Grotesk (já aplicada a `h1-h6`) passa a ser usada com intenção nos títulos/KPIs (peso/tracking definidos, não "Inter de novo"); `font-variant-numeric: tabular-nums` em todo número de indicador/KPI — o toque de "instrumento de precisão" que o número não pule de largura ao trocar de valor.

## Elemento-assinatura
**A esteira operacional (pipeline breadcrumb) redesenhada como painel de linha de produção real**: cada etapa vira uma "estação" com anel de estado colorido pela paleta semântica (nunca dado fake — a cor do anel é a `severity` que já vem do backend), conectadas por um traço horizontal contínuo com uma animação de fluxo sutil (dash-offset, ~600ms, dispara uma vez por carregamento de dado, nunca em loop) — sugere material se movendo pela linha, não decoração.

## Movimento
1. Entrada em stagger dos cards (uma vez, ao montar, ~40ms de defasagem).
2. Fluxo animado da esteira (uma vez por atualização de dado).
3. Elevação de 1-2px só em card **realmente clicável** (nunca em card puramente informativo — "clicável só quando há ação real" é regra, não sugestão).
4. Contagem dos números de 0 até o valor real, só no primeiro carregamento.
5. Tudo respeita `prefers-reduced-motion: reduce` (vira instantâneo).

## Componentes alterados
`globals.css` (tokens aditivos + fix de `.bg-app`/`.card-app` pra referenciar tokens em vez de hex) · sidebar/topbar (estado ativo com traço fino em vez de pílula preenchida, refino de hover/foco) · cabeçalho do Dashboard (novo, com período/última atualização reais) · `DashboardPipelineBreadcrumb` (redesenho completo) · `DashboardAlertCenter`/`DashboardAlertCard` (composição compacta, sem caixão colorido) · unificação de `DashboardWidgetCard`+`DashboardModuleSummaryCard` num só componente · skeleton compartilhado (elimina as 3 cópias) · estados vazio/erro.

## Riscos
1. `page.tsx` é um único client component monolítico — `framer-motion` usado ali carrega para o app inteiro, não só o Dashboard. Mitigação: animação da esteira em CSS puro (sem JS); `framer-motion` só nos componentes-folha do Dashboard, e considerar `next/dynamic` se o bundle pesar.
2. Tokens em `globals.css` são globais por natureza (só existe um arquivo) — exatamente o que foi pedido ("reutilizáveis depois"), mas por serem **aditivos** (não redefino `--primary`/`--destructive`), nenhuma outra tela muda visualmente nesta passada.
3. `ui/sidebar.tsx` continua órfão — decisão deliberada de NÃO reescrever a sidebar sobre esse primitive agora (é mudança estrutural, não visual); fica registrado como candidato a uma consolidação futura.
4. Validei a UI com dado semeado mínimo (banco de teste isolado) — volume real de produção não testado; componentes são desenhados para lidar tanto com poucos quanto muitos widgets/alertas.

Prosseguindo direto para o plano de implementação e execução, conforme instruído — sem pausar para aprovação, exceto se encontrar algo genuinamente bloqueante (nenhum encontrado até agora).
