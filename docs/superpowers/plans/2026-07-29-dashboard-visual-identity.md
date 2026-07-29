# Evolução Visual do Dashboard (MOBSTEEL ERP) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Dashboard (pilot page) a distinct MOBSTEEL visual identity — semantic tokens, refined shell (sidebar/topbar), redesigned pipeline/alerts/indicators, deliberate motion, and solid loading/empty/error/a11y states — without breaking any existing behavior or visually re-skinning other pages.

**Architecture:** Additive CSS tokens in `globals.css` (never redefine `--primary`/`--destructive`) consumed by refactored dashboard components. Two components (`DashboardWidgetCard` + `DashboardModuleSummaryCard`) merge into one with a `variant` prop, preserving both existing documented anatomies exactly. `framer-motion` (already installed, unused) powers one-shot mount animations; the pipeline's flow effect is pure CSS (`stroke-dashoffset`/`background-position` transition) so it never depends on JS bundle size. Nothing outside `src/app/globals.css` (tokens), `src/app/page.tsx` (shell), and `src/components/dashboard/*` is touched.

**Tech Stack:** Next.js 16 (App Router, client components), Tailwind v4 (CSS `@theme`), shadcn/ui primitives, `lucide-react`, `framer-motion`, TypeScript, Vitest.

**Testing approach (adapted for this codebase):** This is a visual/CSS-heavy change to React components with almost no new business logic, so most tasks are verified via `npx tsc --noEmit` + `npx eslint .` + the existing `npx vitest run` suite (505 tests must stay green — zero visual component currently has dedicated tests, so none should start failing) + a real screenshot taken with `agent-browser` against the isolated preview server (`localhost:3011`, test DB) compared against the "before" screenshots already captured. Where a task extracts real logic (the merged indicator card's shared trend/format helper), a Vitest unit test is written per the standard TDD step structure.

## Global Constraints

- Never redefine `--primary` (`#b21118`) or `--destructive` (`#dc2626`) — only add new tokens. (design spec, Riscos §2)
- Never invent data: no fake trend/percentage, no "resolvido" alert state (doesn't exist in the domain — only `critical`/`warning`/`info`). (user brief; design spec Conceito/Componentes)
- Preserve every existing sidebar nav item, route, and click target — this is a visual refinement, not an IA change. (user brief §Menu lateral)
- A card only gets hover/click affordance if it already navigates/acts — never add hover-lift to a purely informational card. (user brief §Central de Alertas / §Indicadores)
- All motion must respect `prefers-reduced-motion: reduce`. (design spec §Movimento)
- Do not touch `src/components/ui/sidebar.tsx` (orphaned shadcn primitive) — out of scope this pass. (design spec Riscos §5)
- Do not implement dark mode — `.dark {}` stays empty, out of scope this pass.
- Quality gate before AND after: `npx tsc --noEmit`, `npx eslint .` (baseline: 59 warnings, 0 errors — must stay ≤59 warnings, 0 errors), `npx vitest run` (baseline: 505/505 passing).
- Never run destructive DB operations against the production SQLite file (`data/cozisteel.db`) — all live verification happens against the isolated preview server on port 3011 (`prisma/test.db`).

---

## File Structure

**Modify:**
- `src/app/globals.css` — new semantic/radius/motion tokens (additive), fix `.bg-app`/`.text-app`/`.card-app` to reference tokens, add `@keyframes` for the pipeline flow effect and count-up-safe reduced-motion guard.
- `src/app/page.tsx` — sidebar active-state marker, topbar polish (lines ~553-702), hardcoded `border-slate-200`/`bg-white` → tokens.
- `src/components/dashboard/dashboard-pipeline-breadcrumb.tsx` — signature redesign (station rings + connecting rail + flow animation).
- `src/components/dashboard/dashboard-alert-card.tsx` — swap raw Tailwind severity colors for new semantic tokens.
- `src/components/dashboard/dashboard-alert-center.tsx` — swap header severity colors for tokens; tighten empty-state.
- `src/components/dashboard/dashboard-widget-card.tsx` — becomes a thin wrapper around the new shared component (or deleted, see Task 5).
- `src/components/dashboard/dashboard-module-summary-card.tsx` — same.
- `src/components/dashboard/dashboard-profile-view.tsx`, `dashboard-diretoria-view.tsx`, `dashboard-centro-operacoes-view.tsx` — use new shared skeleton component instead of the copy-pasted block; render new `DashboardHeader`.
- `src/components/dashboard/dashboard-tabs.tsx` — active/hover/focus refinement, keyboard/overflow check.

**Create:**
- `src/components/dashboard/dashboard-indicator-card.tsx` — merged `DashboardWidgetCard`/`DashboardModuleSummaryCard`, `variant: 'wide' | 'compact'`.
- `src/components/dashboard/dashboard-skeleton-grid.tsx` — the shared skeleton block (extracted verbatim from the 3 duplicates).
- `src/components/dashboard/dashboard-header.tsx` — new Dashboard page header (title, active-profile subtitle, last-updated, period when available).
- `src/lib/dashboard-trend.ts` — shared `TREND_STYLE` map + `formatIndicatorValue()` helper (currently duplicated verbatim in the two card components).
- `tests/dashboard-trend.test.ts` — unit tests for the extracted helper.

---

### Task 1: Semantic + radius + motion tokens in `globals.css`

**Files:**
- Modify: `src/app/globals.css:15-107` (add inside existing `@theme inline` and `:root` blocks), `:133-145` (fix `.bg-app`/`.text-app`/`.card-app`)

**Interfaces:**
- Produces: CSS custom properties `--ms-critical`, `--ms-warning`, `--ms-success`, `--ms-info`, `--ms-surface-2`, `--ms-radius-sm`, `--ms-radius-md`, `--ms-radius-lg`, `--ms-motion-fast` (150ms), `--ms-motion-base` (250ms), `--ms-motion-ease` (`cubic-bezier(0.22, 1, 0.36, 1)`) and matching Tailwind utility classes `bg-ms-critical`/`text-ms-critical`/etc. (via `@theme inline` mapping, same pattern already used for `--color-primary`). Every later task consumes these exact class names — never raw `red-600`/`amber-500`/`emerald-600` again in the files this plan touches.

- [ ] **Step 1: Add the new CSS custom properties to `:root`**

In `src/app/globals.css`, inside the existing `:root { ... }` block (right after the `--chart-cat-8` line), add:

```css
  /* Tokens semânticos MOBSTEEL (evolução visual do Dashboard, 2026-07-29) — aditivos, nunca
   * redefinem --primary/--destructive. "Crítico" é laranja (calor), não vermelho de marca: o
   * vermelho fica reservado para seleção/ação/identidade (ver docs/superpowers/specs/2026-07-29-
   * dashboard-visual-identity-design.md). "Sucesso" é teal (frio/inox/higiene), contraste
   * deliberado com o laranja "quente" do crítico. */
  --ms-critical: #c2410c;
  --ms-warning: #b45309;
  --ms-success: #0f766e;
  --ms-info: #33608a;
  --ms-surface-2: #f4f5f6;

  --ms-radius-sm: 6px;
  --ms-radius-md: 10px;
  --ms-radius-lg: 14px;

  --ms-motion-fast: 150ms;
  --ms-motion-base: 250ms;
  --ms-motion-ease: cubic-bezier(0.22, 1, 0.36, 1);
```

- [ ] **Step 2: Map the new tokens into the `@theme inline` block**

In the existing `@theme inline { ... }` block, add (following the exact pattern of `--color-primary: var(--primary);` already there):

```css
  --color-ms-critical: var(--ms-critical);
  --color-ms-warning: var(--ms-warning);
  --color-ms-success: var(--ms-success);
  --color-ms-info: var(--ms-info);
  --color-ms-surface-2: var(--ms-surface-2);
  --radius-ms-sm: var(--ms-radius-sm);
  --radius-ms-md: var(--ms-radius-md);
  --radius-ms-lg: var(--ms-radius-lg);
```

This makes `bg-ms-critical`, `text-ms-critical`, `border-ms-critical`, `bg-ms-critical/10` (opacity modifier), `rounded-ms-lg`, etc. available as real Tailwind utilities — same mechanism Tailwind v4 already uses for `bg-primary`.

- [ ] **Step 3: Fix `.bg-app`/`.text-app`/`.card-app` to reference tokens instead of hex**

Replace the `@layer utilities` block (`globals.css:133-145`):

```css
@layer utilities {
  .bg-app {
    @apply bg-background;
  }
  .text-app {
    @apply text-foreground;
  }
  .card-app {
    @apply bg-card border border-border shadow-sm;
  }
}
```

- [ ] **Step 4: Add the pipeline flow keyframe and reduced-motion guard**

Append to `globals.css` (after the existing `@keyframes fadeUp` — leave `fadeUp` alone, it's flagged as dead CSS but removing unrelated code is out of scope for this task):

```css
@keyframes ms-flow {
  from { stroke-dashoffset: 24; }
  to { stroke-dashoffset: 0; }
}

@media (prefers-reduced-motion: reduce) {
  .ms-motion-safe {
    animation: none !important;
    transition: none !important;
  }
}
```

- [ ] **Step 5: Typecheck and lint (no component changes yet, just confirming the CSS parses and nothing references removed hex values elsewhere)**

Run: `npx tsc --noEmit && npx eslint .`
Expected: same baseline (0 errors, 59 warnings) — CSS changes don't affect TS/ESLint, this just confirms Step 3's class swap didn't silently break a consumer.

Run: `grep -rn "bg-app\|text-app\|card-app" src/ --include='*.tsx'`
Expected: only the same 3 call sites found during diagnosis (`src/app/page.tsx:516,517,656`) — confirms no new consumer appeared mid-edit.

- [ ] **Step 6: Commit**

```bash
git add src/app/globals.css
git commit -m "Adiciona tokens semanticos (critico/atencao/sucesso/info) e corrige .bg-app/.card-app para referenciar tokens"
```

---

### Task 2: Extract shared trend/format helper + tests

**Files:**
- Create: `src/lib/dashboard-trend.ts`
- Test: `tests/dashboard-trend.test.ts`

**Interfaces:**
- Consumes: `DashboardCardData['trend']` (`'up' | 'down' | 'stable' | undefined`) and `DashboardCardData['format']`/`value` from `src/app/services/dashboard-types.ts` (already exists, not modified).
- Produces: `TREND_STYLE: Record<'up'|'down'|'stable', { icon: LucideIcon; colorClass: string }>` and `formatIndicatorValue(data: DashboardCardData): string | number` — both later consumed by Task 5's `dashboard-indicator-card.tsx`.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/dashboard-trend.test.ts
import { describe, it, expect } from 'vitest'
import { formatIndicatorValue, TREND_STYLE } from '@/lib/dashboard-trend'

describe('dashboard-trend', () => {
  it('formats currency values via formatCurrency', () => {
    const result = formatIndicatorValue({ value: 1500.5, format: 'currency' })
    expect(result).toBe('R$ 1.500,50')
  })

  it('passes through non-currency values unchanged', () => {
    expect(formatIndicatorValue({ value: 42, format: 'number' })).toBe(42)
    expect(formatIndicatorValue({ value: '3 de 10', format: 'text' })).toBe('3 de 10')
  })

  it('exposes a style entry for every trend direction', () => {
    expect(TREND_STYLE.up.colorClass).toBe('text-ms-success')
    expect(TREND_STYLE.down.colorClass).toBe('text-ms-critical')
    expect(TREND_STYLE.stable.colorClass).toBe('text-muted-foreground')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/dashboard-trend.test.ts`
Expected: FAIL — `Cannot find module '@/lib/dashboard-trend'`

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/dashboard-trend.ts
import { TrendingUp, TrendingDown, Minus, type LucideIcon } from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import type { DashboardCardData } from '@/app/services/dashboard-types'

/**
 * Extraído de `DashboardWidgetCard`/`DashboardModuleSummaryCard` (eram duplicados verbatim) —
 * "sucesso"/"crítico" usam os tokens semânticos novos (ver globals.css), não mais
 * text-emerald-600/text-red-600 crus.
 */
export const TREND_STYLE: Record<NonNullable<DashboardCardData['trend']>, { icon: LucideIcon; colorClass: string }> = {
  up: { icon: TrendingUp, colorClass: 'text-ms-success' },
  down: { icon: TrendingDown, colorClass: 'text-ms-critical' },
  stable: { icon: Minus, colorClass: 'text-muted-foreground' },
}

export function formatIndicatorValue(data: Pick<DashboardCardData, 'value' | 'format'>): string | number {
  if (data.format === 'currency' && typeof data.value === 'number') return formatCurrency(data.value)
  return data.value
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/dashboard-trend.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/dashboard-trend.ts tests/dashboard-trend.test.ts
git commit -m "Extrai TREND_STYLE/formatIndicatorValue compartilhado (elimina duplicacao entre os 2 cards de KPI)"
```

---

### Task 3: Shared skeleton grid + error/empty state component

**Self-review finding (added after initial draft):** all 3 dashboard views (`dashboard-profile-view.tsx:120-123`, `dashboard-diretoria-view.tsx:90-93`, `dashboard-centro-operacoes-view.tsx:76-79`) render error/empty states as bare centered gray text (`<p className="text-muted-foreground text-center py-12">Erro ao carregar...</p>`) — this is checklist item "estados de carregamento, vazio e erro" from the user's brief and was missing a task. Folded into this task since it touches the same 3 files. All 3 also have a decorative `<Radar className="w-4 h-4 text-red-600" />` icon (section header, not a severity signal) — swap to `text-primary` for token consistency while here.

**Files:**
- Create: `src/components/dashboard/dashboard-skeleton-grid.tsx`, `src/components/dashboard/dashboard-state-message.tsx`
- Modify: `src/components/dashboard/dashboard-profile-view.tsx:114-134` (approx), `dashboard-diretoria-view.tsx:85-98`, `dashboard-centro-operacoes-view.tsx:69-86`

**Interfaces:**
- Produces: `DashboardSkeletonGrid({ count = 4 }: { count?: number })` — a `<div>` grid of `count` `<Skeleton className="h-24 rounded-ms-lg">` blocks, replacing the 3 identical inline copies.
- Produces: `DashboardStateMessage({ kind: 'error' | 'empty'; message: string })` — replaces the 3×2 duplicated bare-text blocks with an icon + message, consistent with the rest of the redesign's "hierarchy by shape/size, not just color" principle already established in `DashboardAlertCard`.
- Consumes: `Skeleton` from `@/components/ui/skeleton` (unchanged).

- [ ] **Step 1: Create the component**

```typescript
// src/components/dashboard/dashboard-skeleton-grid.tsx
import { Skeleton } from '@/components/ui/skeleton'

/** Bloco de carregamento do Dashboard — era copiado idêntico em 3 arquivos (profile-view,
 * diretoria-view, centro-operacoes-view); extraído aqui pra ter um só lugar pra ajustar. */
export function DashboardSkeletonGrid({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-24 rounded-ms-lg" />
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Create `DashboardStateMessage`**

```typescript
// src/components/dashboard/dashboard-state-message.tsx
import { AlertCircle, Inbox } from 'lucide-react'

interface DashboardStateMessageProps {
  kind: 'error' | 'empty'
  message: string
}

/** Substitui os blocos "&lt;p className=text-center py-12&gt;Erro ao carregar...&lt;/p&gt;" repetidos
 * (bare text, sem hierarquia) por ícone+mensagem — mesma lógica de "forma além de cor" já usada em
 * DashboardAlertCard. `error` usa o token crítico; `empty` é neutro (não é uma falha, é ausência de
 * dado — nunca confundir os dois visualmente). */
export function DashboardStateMessage({ kind, message }: DashboardStateMessageProps) {
  const Icon = kind === 'error' ? AlertCircle : Inbox
  const iconClass = kind === 'error' ? 'text-ms-critical' : 'text-muted-foreground'
  return (
    <div className="flex flex-col items-center gap-2 text-center py-12">
      <Icon className={`w-6 h-6 ${iconClass}`} />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  )
}
```

- [ ] **Step 3: Replace each of the 3 inline skeleton copies with `<DashboardSkeletonGrid />`, and each error/empty `<p>` with `<DashboardStateMessage>`**

In each of `dashboard-profile-view.tsx`, `dashboard-diretoria-view.tsx`, `dashboard-centro-operacoes-view.tsx`: find the literal block
```tsx
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
  <Skeleton className="h-24 rounded-xl" />
  <Skeleton className="h-24 rounded-xl" />
  <Skeleton className="h-24 rounded-xl" />
  <Skeleton className="h-24 rounded-xl" />
</div>
```
and replace with `<DashboardSkeletonGrid />`. Replace `<p className="text-muted-foreground text-center py-12">Erro ao carregar...</p>` with `<DashboardStateMessage kind="error" message="Erro ao carregar este dashboard" />` (keep each file's own existing message text — they already differ slightly per view, e.g. "Erro ao carregar o Centro de Operações" — do not rewrite the copy, only the wrapper). Same for the "Nenhum indicador..." empty-state `<p>` → `<DashboardStateMessage kind="empty" message="..." />` with each file's existing text preserved verbatim. Also swap each file's `<Radar className="w-4 h-4 text-red-600" />` → `<Radar className="w-4 h-4 text-primary" />`.

Add the imports: `import { DashboardSkeletonGrid } from '@/components/dashboard/dashboard-skeleton-grid'` and `import { DashboardStateMessage } from '@/components/dashboard/dashboard-state-message'`. Remove the now-unused `Skeleton` import from each file if nothing else in that file uses it (check with `grep -n "Skeleton" <file>` first — `dashboard-centro-operacoes-view.tsx` may use `Skeleton` elsewhere for the pipeline's own loading state; keep the import if so).

- [ ] **Step 4: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint .`
Expected: 0 errors, ≤59 warnings, no new unused-import warnings.

- [ ] **Step 5: Run full test suite**

Run: `npx vitest run`
Expected: 505/505 passing (no dashboard component has dedicated tests today, so this only confirms nothing else broke).

- [ ] **Step 6: Commit**

```bash
git add src/components/dashboard/dashboard-skeleton-grid.tsx src/components/dashboard/dashboard-state-message.tsx src/components/dashboard/dashboard-profile-view.tsx src/components/dashboard/dashboard-diretoria-view.tsx src/components/dashboard/dashboard-centro-operacoes-view.tsx
git commit -m "Extrai DashboardSkeletonGrid e DashboardStateMessage (elimina copias de loading/erro/vazio, cobre estados do checklist)"
```

---

### Task 4: Dashboard header component

**Files:**
- Create: `src/components/dashboard/dashboard-header.tsx`
- Modify: `src/app/page.tsx` (the `activeModule === 'dashboard'` branch, currently just `<h2 className="text-2xl font-bold">Dashboard</h2>` followed by `<DashboardTabs ... />`)

**Interfaces:**
- Consumes: `activeProfile: string` (the currently selected `DashboardTabs` value — already tracked as local state inside `DashboardTabs`, needs lifting one level: see Step 1), `lastUpdated: Date | null` (same `fetchedAt` value already passed into `DashboardAlertCenter` today — reuse it, don't invent a new fetch).
- Produces: `DashboardHeader({ activeProfileLabel, lastUpdated }: { activeProfileLabel: string; lastUpdated: Date | null })`.

- [ ] **Step 1: Lift the active-profile label out of `DashboardTabs`**

`dashboard-tabs.tsx` already has a `PROFILE_LABELS`-equivalent map (lines 11-21 per diagnosis) and an internal `value`/`onValueChange` for the Radix `Tabs`. Add an `onProfileChange?: (label: string) => void` prop, called alongside the existing tab-change handler with the human label (e.g. `"Comercial"`), so `page.tsx` can hold `const [activeProfileLabel, setActiveProfileLabel] = useState('Centro de Operações')` and pass it down.

- [ ] **Step 2: Create `DashboardHeader`**

```typescript
// src/components/dashboard/dashboard-header.tsx
interface DashboardHeaderProps {
  activeProfileLabel: string
  lastUpdated: Date | null
}

function formatLastUpdated(date: Date | null): string {
  if (!date) return ''
  const minutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000))
  if (minutes === 0) return 'atualizado agora mesmo'
  if (minutes === 1) return 'atualizado há 1 minuto'
  return `atualizado há ${minutes} minutos`
}

/** Cabeçalho do Dashboard — antes era só um <h2>Dashboard</h2> solto. Título fixo + subtítulo
 * contextual (perfil ativo + hora real da última atualização, nunca inventados — mesmo dado que já
 * alimenta `DashboardAlertCenter`). */
export function DashboardHeader({ activeProfileLabel, lastUpdated }: DashboardHeaderProps) {
  return (
    <div className="flex items-baseline justify-between gap-4 flex-wrap">
      <div>
        <h2 className="text-2xl font-bold">Dashboard</h2>
        <p className="text-sm text-muted-foreground">{activeProfileLabel}</p>
      </div>
      {lastUpdated && (
        <p className="text-xs text-muted-foreground tabular-nums">{formatLastUpdated(lastUpdated)}</p>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Wire it into `page.tsx`**

Replace the current
```tsx
{activeModule === 'dashboard' && (
  <div className="space-y-4 max-w-[1600px] mx-auto">
    <h2 className="text-2xl font-bold">Dashboard</h2>
    <DashboardTabs role={userRole} onNavigate={(moduleKey) => setActiveModule(moduleKey as ModuleKey)} />
  </div>
)}
```
with (adding the two new state values near the other `useState` calls in the same component):
```tsx
{activeModule === 'dashboard' && (
  <div className="space-y-4 max-w-[1600px] mx-auto">
    <DashboardHeader activeProfileLabel={activeProfileLabel} lastUpdated={dashboardLastUpdated} />
    <DashboardTabs
      role={userRole}
      onNavigate={(moduleKey) => setActiveModule(moduleKey as ModuleKey)}
      onProfileChange={setActiveProfileLabel}
      onLastUpdated={setDashboardLastUpdated}
    />
  </div>
)}
```
`onLastUpdated` bubbles the same `fetchedAt` each profile view already computes (per `DashboardProfileView`/`DashboardDiretoriaView`/`DashboardCentroOperacoesView`, which already pass `fetchedAt` into `DashboardAlertCenter` today) up through `DashboardTabs` — thread it exactly like `onNavigate` already is threaded, not a new fetch.

- [ ] **Step 4: Typecheck, lint, full test suite**

Run: `npx tsc --noEmit && npx eslint . && npx vitest run`
Expected: 0 errors, ≤59 warnings, 505/505 passing.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/dashboard-header.tsx src/app/page.tsx src/components/dashboard/dashboard-tabs.tsx src/components/dashboard/dashboard-profile-view.tsx src/components/dashboard/dashboard-diretoria-view.tsx src/components/dashboard/dashboard-centro-operacoes-view.tsx
git commit -m "Adiciona cabecalho do Dashboard com perfil ativo e ultima atualizacao reais"
```

---

### Task 5: Merge `DashboardWidgetCard` + `DashboardModuleSummaryCard` into `DashboardIndicatorCard`

**Files:**
- Create: `src/components/dashboard/dashboard-indicator-card.tsx`
- Modify: every current importer of `DashboardWidgetCard`/`DashboardModuleSummaryCard` (find with `grep -rln "DashboardWidgetCard\|DashboardModuleSummaryCard" src/components/dashboard/`)
- Delete: `src/components/dashboard/dashboard-widget-card.tsx`, `src/components/dashboard/dashboard-module-summary-card.tsx`

**Interfaces:**
- Consumes: `TREND_STYLE`, `formatIndicatorValue` from `src/lib/dashboard-trend.ts` (Task 2).
- Produces: `DashboardIndicatorCard` with two variants, preserving both existing documented anatomies exactly (do not merge the anatomies themselves — only the trend/format logic and the `Card` shell were duplicated, the layouts differ on purpose per the code comments about 5-column truncation bugs):
  ```typescript
  type DashboardIndicatorCardProps =
    | { variant: 'wide'; title: string; data: DashboardCardData; icon: ReactNode }
    | { variant: 'compact'; label: string; data: DashboardCardData; icon: ReactNode; onOpen: () => void }
  ```

- [ ] **Step 1: Write the component preserving both layouts**

```typescript
// src/components/dashboard/dashboard-indicator-card.tsx
import type { ReactNode } from 'react'
import { ArrowRight } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { TREND_STYLE, formatIndicatorValue } from '@/lib/dashboard-trend'
import type { DashboardCardData } from '@/app/services/dashboard-types'

type DashboardIndicatorCardProps =
  | { variant: 'wide'; title: string; data: DashboardCardData; icon: ReactNode }
  | { variant: 'compact'; label: string; data: DashboardCardData; icon: ReactNode; onOpen: () => void }

/**
 * Substitui `DashboardWidgetCard` (variant="wide", usado nas abas de perfil) e
 * `DashboardModuleSummaryCard` (variant="compact", usado na Diretoria/Centro de Operações) — eram
 * dois componentes quase-idênticos com TREND_STYLE duplicado verbatim. As DUAS anatomias são
 * preservadas exatamente como estavam (não são a mesma coisa por acidente): "wide" põe o ícone GRANDE
 * ao lado do valor; "compact" põe o ícone pequeno em cima e o valor sozinho embaixo, porque a anatomia
 * "wide" truncava valores em grades de 5 colunas (achado do usuário, ADR-019 Subetapa 7.5) — nunca
 * volte a unificar o layout em si, só a lógica de trend/formatação estava duplicada.
 */
export function DashboardIndicatorCard(props: DashboardIndicatorCardProps) {
  const trend = props.data.trend ? TREND_STYLE[props.data.trend] : null
  const TrendIcon = trend?.icon
  const displayValue = formatIndicatorValue(props.data)

  if (props.variant === 'wide') {
    return (
      <Card className="rounded-ms-lg overflow-hidden">
        <CardContent className="p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            {props.icon}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-muted-foreground truncate">{props.title}</p>
            <div className="flex items-baseline gap-2 flex-wrap">
              <p className="text-2xl font-bold tabular-nums truncate">{displayValue}</p>
              {trend && TrendIcon && (
                <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${trend.colorClass}`}>
                  <TrendIcon className="w-3.5 h-3.5" />
                  {props.data.trendValue}
                </span>
              )}
            </div>
            {props.data.trendLabel && <p className="text-xs text-muted-foreground truncate">{props.data.trendLabel}</p>}
            {props.data.hint && <p className="text-xs text-muted-foreground truncate" title={props.data.hint}>{props.data.hint}</p>}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="rounded-ms-lg overflow-hidden">
      <CardContent className="p-5 flex flex-col gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 [&_svg]:w-4 [&_svg]:h-4">
            {props.icon}
          </div>
          <p className="text-sm text-muted-foreground truncate">{props.label}</p>
        </div>
        <div className="flex items-baseline gap-2 flex-wrap">
          <p className="text-xl font-bold tabular-nums truncate">{displayValue}</p>
          {trend && TrendIcon && (
            <span className={`inline-flex items-center gap-0.5 text-xs font-semibold shrink-0 ${trend.colorClass}`}>
              <TrendIcon className="w-3.5 h-3.5" />
              {props.data.trendValue}
            </span>
          )}
        </div>
        <Button variant="ghost" size="sm" className="w-full justify-start px-0 h-auto text-sm font-medium" onClick={props.onOpen}>
          Ver mais <ArrowRight className="w-3.5 h-3.5" />
        </Button>
      </CardContent>
    </Card>
  )
}
```

Note the previous `text-[11px]` arbitrary value on `trendLabel` (flagged in diagnosis) is now `text-xs` — the documented type scale in `globals.css` names `text-xs`/`text-sm` but never `text-[11px]`; this closes that specific inconsistency.

- [ ] **Step 2: Find and update every importer**

Run: `grep -rln "DashboardWidgetCard\|DashboardModuleSummaryCard" src/components/dashboard/`
For each match, replace `<DashboardWidgetCard title={...} data={...} icon={...} />` with `<DashboardIndicatorCard variant="wide" title={...} data={...} icon={...} />`, and `<DashboardModuleSummaryCard label={...} data={...} icon={...} onOpen={...} />` with `<DashboardIndicatorCard variant="compact" label={...} data={...} icon={...} onOpen={...} />`. Update the import statement in each file accordingly.

- [ ] **Step 3: Delete the two old files**

```bash
rm src/components/dashboard/dashboard-widget-card.tsx src/components/dashboard/dashboard-module-summary-card.tsx
```

- [ ] **Step 4: Typecheck, lint, full test suite**

Run: `npx tsc --noEmit && npx eslint . && npx vitest run`
Expected: 0 errors, ≤59 warnings, 505/505 passing. A `tsc` error here means an importer was missed — fix and re-run before proceeding.

- [ ] **Step 5: Commit**

```bash
git add -A src/components/dashboard/
git commit -m "Unifica DashboardWidgetCard e DashboardModuleSummaryCard em DashboardIndicatorCard (variant wide/compact)"
```

---

### Task 6: Alert card + alert center — swap raw Tailwind severity colors for semantic tokens

**Files:**
- Modify: `src/components/dashboard/dashboard-alert-card.tsx` (the `SEVERITY_STYLE` map, lines 15-49), `src/components/dashboard/dashboard-alert-center.tsx` (severity header colors, lines 61, 75; empty-state icon color, line 44)

**Interfaces:**
- No new interface — same `DashboardAlertData`/`DashboardAlertSeverity` types, only the Tailwind class strings inside `SEVERITY_STYLE` change.

- [ ] **Step 1: Update `SEVERITY_STYLE` in `dashboard-alert-card.tsx`**

Replace the whole `SEVERITY_STYLE` object (lines 15-49) with:

```typescript
const SEVERITY_STYLE: Record<
  DashboardAlertSeverity,
  { label: string; icon: typeof AlertCircle; card: string; iconWrap: string; badge: string; title: string; iconSize: string; pulse: boolean }
> = {
  critical: {
    label: 'Crítico',
    icon: AlertCircle,
    card: 'border-2 border-ms-critical/70 bg-ms-critical/5 shadow-sm hover:shadow-md hover:border-ms-critical',
    iconWrap: 'bg-ms-critical text-white',
    badge: 'bg-ms-critical text-white',
    title: 'text-base font-bold',
    iconSize: 'w-5 h-5',
    pulse: true,
  },
  warning: {
    label: 'Atenção',
    icon: AlertTriangle,
    card: 'border border-ms-warning/50 bg-card hover:shadow-sm hover:border-ms-warning',
    iconWrap: 'bg-ms-warning/15 text-ms-warning',
    badge: 'bg-ms-warning/15 text-ms-warning',
    title: 'text-sm font-semibold',
    iconSize: 'w-4 h-4',
    pulse: false,
  },
  info: {
    label: 'Informativo',
    icon: Info,
    card: 'border border-border bg-card hover:shadow-sm',
    iconWrap: 'bg-ms-info/10 text-ms-info',
    badge: 'bg-ms-info/10 text-ms-info',
    title: 'text-sm font-medium',
    iconSize: 'w-4 h-4',
    pulse: false,
  },
}
```

Also update the pulse ring at line 65 (`bg-red-600` → `bg-ms-critical`).

- [ ] **Step 2: Update `dashboard-alert-center.tsx` header colors**

Line 44: `text-emerald-600` → `text-ms-success` (the "tudo em ordem" checkmark).
Line 61: `text-red-600` → `text-ms-critical` (the "CRÍTICO" section label).
Line 75: `text-amber-600` → `text-ms-warning` (the "ATENÇÃO" section label).

- [ ] **Step 3: Typecheck, lint, full test suite**

Run: `npx tsc --noEmit && npx eslint . && npx vitest run`
Expected: 0 errors, ≤59 warnings, 505/505 passing.

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/dashboard-alert-card.tsx src/components/dashboard/dashboard-alert-center.tsx
git commit -m "Troca cores de severidade cruas do Tailwind pelos tokens semanticos (critico=laranja, nao mais vermelho de marca)"
```

---

### Task 7: Pipeline breadcrumb — signature redesign

**Files:**
- Modify: `src/components/dashboard/dashboard-pipeline-breadcrumb.tsx` (full rewrite of the render, same props/data contract)

**Interfaces:**
- Consumes: same `DashboardPipelineStageDTO[]`/`onNavigate` props — no change to the data contract, only the render.
- Produces: same exported `DashboardPipelineBreadcrumb` component signature — no consumer changes needed.

- [ ] **Step 1: Rewrite the component**

```typescript
// src/components/dashboard/dashboard-pipeline-breadcrumb.tsx
'use client'

import { FileText, ClipboardList, Cog, ShoppingCart, Truck, Wallet } from 'lucide-react'
import type { ElementType } from 'react'
import type { DashboardPipelineStageDTO, DashboardAlertSeverity } from '@/app/services/dashboard-types'

interface DashboardPipelineBreadcrumbProps {
  stages: DashboardPipelineStageDTO[]
  onNavigate: (moduleKey: string) => void
}

const STAGE_ICONS: Record<string, ElementType> = {
  orcamento: FileText,
  pedido: ClipboardList,
  producao: Cog,
  compra: ShoppingCart,
  entrega: Truck,
  financeiro: Wallet,
}

const SEVERITY_RING: Record<DashboardAlertSeverity, string> = {
  info: 'ring-ms-info/40 text-ms-info',
  warning: 'ring-ms-warning/50 text-ms-warning',
  critical: 'ring-ms-critical/60 text-ms-critical',
}

/**
 * Pipeline Orçamento→Financeiro (ADR-024) redesenhado como painel de linha de produção (evolução
 * visual 2026-07-29): cada etapa é uma "estação" com anel de estado (cor = severity real do backend,
 * nunca inventada) conectada por um traço contínuo. `stroke-dashoffset` anima uma vez no mount via a
 * classe `ms-motion-safe` (definida em globals.css, desativada sob prefers-reduced-motion). Retrato do
 * AGORA — cada etapa mostra "quanto está em trânsito ali", não uma tabela de status.
 */
export function DashboardPipelineBreadcrumb({ stages, onNavigate }: DashboardPipelineBreadcrumbProps) {
  return (
    <div className="rounded-ms-lg border bg-card p-4 overflow-x-auto">
      <div className="relative flex items-start gap-0 min-w-max">
        {stages.map((stage, index) => {
          const Icon = STAGE_ICONS[stage.id]
          const ring = SEVERITY_RING[stage.severity]
          return (
            <div key={stage.id} className="flex items-start">
              <button
                type="button"
                onClick={() => onNavigate(stage.linkToModule)}
                className="group flex flex-col items-center gap-2 px-4 py-1 rounded-ms-md hover:bg-muted/60 transition-colors"
              >
                <span
                  className={`flex items-center justify-center w-11 h-11 rounded-full bg-background ring-2 transition-shadow ${ring} group-hover:ring-[3px]`}
                >
                  <Icon className="w-5 h-5" />
                </span>
                <span className="text-xs text-muted-foreground leading-tight text-center">{stage.label}</span>
                <span className="text-sm font-bold tabular-nums leading-tight">{stage.count}</span>
              </button>
              {index < stages.length - 1 && (
                <svg width="40" height="44" className="shrink-0 -mx-1 mt-4" aria-hidden="true">
                  <line
                    x1="0" y1="1" x2="40" y2="1"
                    stroke="var(--border)" strokeWidth="2"
                  />
                  <line
                    x1="0" y1="1" x2="40" y2="1"
                    stroke="var(--primary)" strokeWidth="2" strokeDasharray="24"
                    className="ms-motion-safe"
                    style={{ animation: 'ms-flow var(--ms-motion-base) var(--ms-motion-ease) 1' }}
                  />
                </svg>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify `DashboardAlertSeverity` is exported from `dashboard-types.ts`**

Run: `grep -n "DashboardAlertSeverity" src/app/services/dashboard-types.ts`
Expected: an `export type DashboardAlertSeverity = 'critical' | 'warning' | 'info'` already exists (confirmed during diagnosis) — this import must resolve with no new type needed.

- [ ] **Step 3: Typecheck, lint, full test suite**

Run: `npx tsc --noEmit && npx eslint . && npx vitest run`
Expected: 0 errors, ≤59 warnings, 505/505 passing.

- [ ] **Step 4: Visual verification against the isolated preview server**

With the preview dev server running on `localhost:3011` (test DB, already seeded), take a screenshot:
```bash
cd /tmp/agent-browser-tool && ./node_modules/.bin/agent-browser reload && ./node_modules/.bin/agent-browser screenshot /tmp/pipeline-after.png
```
Confirm visually: 6 circular station icons connected by a horizontal rail, ring color matches each stage's real severity (info=blue-gray, warning=amber, critical=orange — none of them the brand red unless a stage's severity happens to be... note none of the 6 stages ever map to "brand red", by design — the ring vocabulary is entirely the new semantic set, brand red stays reserved for the active nav/buttons elsewhere), no console errors (`agent-browser eval "window.__consoleErrors"` or check via `agent-browser get text body` for a Next.js error overlay).

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/dashboard-pipeline-breadcrumb.tsx
git commit -m "Redesenha a esteira operacional como painel de linha de producao (elemento-assinatura)"
```

---

### Task 8: Sidebar + topbar refinement in `page.tsx`

**Files:**
- Modify: `src/app/page.tsx:553-702` (the `renderNav` function and the header/aside JSX)

**Interfaces:**
- No prop/behavior changes — pure className edits. Every `onClick`/`href`/nav item stays exactly as-is (Global Constraint: preserve every nav item and route).

- [ ] **Step 1: Active nav item — left-rail marker instead of full pill**

Replace (line ~589-591):
```tsx
className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left ${collapsed ? 'justify-center' : ''} ${
  activeModule === n.key ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
}`}
```
with:
```tsx
className={`w-full flex items-center gap-3 px-3 py-2 rounded-ms-sm text-sm font-medium transition-colors text-left border-l-2 ${collapsed ? 'justify-center border-l-0' : ''} ${
  activeModule === n.key
    ? 'bg-primary/5 text-primary border-l-primary'
    : 'text-muted-foreground border-l-transparent hover:bg-muted hover:text-foreground hover:border-l-border'
}`}
```
(collapsed mode drops the rail since there's no room for it — `justify-center border-l-0` — the icon-only `bg-primary/10` treatment from before is intentionally NOT reintroduced in collapsed mode; add `bg-primary/10` back for collapsed active state so the collapsed rail isn't ambiguous:)
```tsx
    : n.key === activeModule && collapsed ? 'bg-primary/10 text-primary' : '...'
```
Simplify by computing the class as a small local variable inside the map instead of one long ternary chain — write it as:
```tsx
{visibleItems.map(n => {
  const isActive = activeModule === n.key
  const activeClass = collapsed
    ? (isActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground')
    : (isActive ? 'bg-primary/5 text-primary border-l-2 border-l-primary' : 'text-muted-foreground border-l-2 border-l-transparent hover:bg-muted hover:text-foreground hover:border-l-border')
  return (
    <button
      key={n.key}
      onClick={() => handleNavClick(n.key)}
      title={collapsed ? n.label : undefined}
      className={`w-full flex items-center gap-3 px-3 py-2 rounded-ms-sm text-sm font-medium transition-colors text-left ${collapsed ? 'justify-center' : ''} ${activeClass}`}
    >
      {n.icon} {!collapsed && n.label}
      {!collapsed && n.key === 'configuracoes' && activeModule === 'configuracoes' && <ChevronDown className="w-4 h-4 ml-auto" />}
    </button>
  )
})}
```

- [ ] **Step 2: Section group labels — slightly stronger hierarchy**

Line 582: `text-[11px] font-semibold tracking-wider text-muted-foreground/70` → `text-xs font-semibold tracking-wider text-muted-foreground/70 uppercase` (closes another arbitrary-value inconsistency; `uppercase` added since the labels — "COMERCIAL", "PRODUÇÃO" — are already typed uppercase in the data but relying on that instead of CSS is fragile if a label is ever added in mixed case).

- [ ] **Step 3: Topbar/aside hardcoded colors → tokens**

Line 658: `bg-white/95 border-b border-slate-200` → `bg-card/95 border-b border-border`.
Line 700: `border-r border-slate-200 bg-white` → `border-r border-border bg-card`.

- [ ] **Step 4: Focus-visible rings on nav buttons (accessibility — currently relying on browser default outline, which Tailwind's base reset may suppress)**

Add `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-1` to the nav button's className (Step 1) and to the topbar's search-trigger button (line ~677) and sidebar-collapse `Button` (line 566-572, though `Button` from `ui/button.tsx` likely already has focus-visible styles — verify with `grep -n "focus-visible" src/components/ui/button.tsx` first; only add manually to the two hand-rolled `<button>` elements that aren't using the shared `Button` component).

- [ ] **Step 5: Typecheck, lint, full test suite**

Run: `npx tsc --noEmit && npx eslint . && npx vitest run`
Expected: 0 errors, ≤59 warnings, 505/505 passing.

- [ ] **Step 6: Visual + keyboard verification**

Screenshot the sidebar in both expanded and collapsed states via `agent-browser`. Then verify keyboard nav: `agent-browser press Tab` repeatedly and `agent-browser screenshot` to confirm a visible focus ring lands on each nav item in sequence (not just a color change with no ring, which would fail WCAG 2.4.7).

- [ ] **Step 7: Commit**

```bash
git add src/app/page.tsx
git commit -m "Refina sidebar (marcador ativo em trilho, nao pilula cheia) e topbar (tokens em vez de cor fixa, foco visivel)"
```

---

### Task 9: Motion — mount stagger + count-up (framer-motion), reduced-motion respected

**Files:**
- Modify: `src/components/dashboard/dashboard-indicator-card.tsx` (wrap in `motion.div`, add count-up), `src/components/dashboard/dashboard-alert-card.tsx` (mount fade+rise)

**Interfaces:**
- No prop changes — motion is purely additive presentation wrapping the existing render output.

- [ ] **Step 1: Add a small shared count-up hook**

```typescript
// src/lib/use-count-up.ts
import { useEffect, useState } from 'react'

/** Conta de 0 até `target` uma vez, ~500ms — só quando `target` é numérico (valores em texto, ex.
 * "3 de 10", passam direto). Não repete em cada re-render, só na montagem/mudança real de `target`.
 * Desativado sob prefers-reduced-motion (retorna o valor final direto). */
export function useCountUp(target: number, durationMs = 500): number {
  const [value, setValue] = useState(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return target
    return 0
  })

  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setValue(target)
      return
    }
    let raf: number
    const start = performance.now()
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / durationMs)
      setValue(Math.round(target * progress))
      if (progress < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, durationMs])

  return value
}
```

- [ ] **Step 2: Write a test for the reduced-motion short-circuit**

```typescript
// tests/use-count-up.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useCountUp } from '@/lib/use-count-up'

describe('useCountUp', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('returns the target immediately when prefers-reduced-motion is set', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce'), media: query }) as MediaQueryList)
    const { result } = renderHook(() => useCountUp(42))
    expect(result.current).toBe(42)
  })
})
```

Check `@testing-library/react` is already a dependency (`grep -n "@testing-library/react" package.json`) — if not present, use a plain hook-invocation test via a minimal test component instead of `renderHook`, since adding a new test dependency is out of scope for this plan.

- [ ] **Step 3: Run test to verify it fails, then passes**

Run: `npx vitest run tests/use-count-up.test.ts`
Expected: FAIL first (module doesn't exist) — then, after Step 1's file is saved, PASS.

- [ ] **Step 4: Apply `useCountUp` in `DashboardIndicatorCard` (only for numeric, non-currency values — currency/text values render as-is, exactly matching the "never fake data" constraint since this only changes HOW a real number reveals itself, not WHAT number it is)**

In `dashboard-indicator-card.tsx`, where `displayValue` is computed, add:
```typescript
import { useCountUp } from '@/lib/use-count-up'
// ...
const numericTarget = typeof props.data.value === 'number' && props.data.format !== 'currency' ? props.data.value : null
const countedValue = useCountUp(numericTarget ?? 0)
const displayValue = numericTarget !== null ? countedValue : formatIndicatorValue(props.data)
```
(Currency values are excluded from count-up — counting up through intermediate currency-formatted strings, e.g. "R$ 0,34" → "R$ 891,20", reads as jittery/wrong for money; only plain integer counters like "4 materiais" benefit from this.)

- [ ] **Step 5: Add mount fade+rise to `DashboardAlertCard` via `framer-motion`**

```typescript
// dashboard-alert-card.tsx — add the import
import { motion } from 'framer-motion'
```
Wrap the returned `<button>` in `<motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>...</motion.div>` — `framer-motion` already respects `prefers-reduced-motion` automatically via its own internal check when `MotionConfig reducedMotion="user"` is NOT set (verify: framer-motion v12 respects OS-level reduced motion by default for `transform`/`opacity` only if explicitly configured — to guarantee this without a global `MotionConfig` provider, wrap with the simpler safeguard: only animate when `!window.matchMedia('(prefers-reduced-motion: reduce)').matches`, computed once via a small local check mirroring `useCountUp`'s pattern).

- [ ] **Step 6: Typecheck, lint, full test suite**

Run: `npx tsc --noEmit && npx eslint . && npx vitest run`
Expected: 0 errors, ≤59 warnings, all previous tests + `dashboard-trend.test.ts` + `use-count-up.test.ts` passing.

- [ ] **Step 7: Visual verification — confirm the count-up and stagger are visible and reduced-motion disables them**

```bash
cd /tmp/agent-browser-tool
./node_modules/.bin/agent-browser media reduced-motion
./node_modules/.bin/agent-browser reload
./node_modules/.bin/agent-browser screenshot /tmp/reduced-motion-check.png
```
Confirm the screenshot shows final values immediately (no mid-animation frame captured — since it's a static screenshot this mostly confirms no layout shift/jank, not the animation itself; the meaningful check is `agent-browser eval` reading `getComputedStyle` for `animation-duration: 0s` equivalent, or simply trusting the code path since it's unit-tested in Step 3).

- [ ] **Step 8: Commit**

```bash
git add src/lib/use-count-up.ts tests/use-count-up.test.ts src/components/dashboard/dashboard-indicator-card.tsx src/components/dashboard/dashboard-alert-card.tsx
git commit -m "Adiciona contagem de numeros e entrada em stagger nos cards do Dashboard (respeitando prefers-reduced-motion)"
```

---

### Task 10: Responsiveness + accessibility pass

**Files:**
- Modify: `src/components/dashboard/dashboard-tabs.tsx` (horizontal overflow on the profile `TabsList`), `src/components/dashboard/dashboard-alert-center.tsx` (add `aria-live="polite"` to the alert count region)

**Interfaces:** No changes — className/attribute additions only.

- [ ] **Step 1: Confirm `TabsList` overflow behavior**

Radix `TabsList` doesn't scroll by default. Check current rendering: `grep -n "TabsList" src/components/dashboard/dashboard-tabs.tsx`. Add `className="overflow-x-auto flex-nowrap"` to the `TabsList` if not already present, so on narrow viewports the 9 profile tabs scroll horizontally instead of wrapping/overflowing the container.

- [ ] **Step 2: Add `aria-live` to the alert center's count**

In `dashboard-alert-center.tsx`, wrap the root returned `<div className="space-y-4">` region with `aria-live="polite" aria-atomic="false"` so a screen reader announces when alert counts change after a refetch (never on initial mount, per aria-live semantics) without needing to re-focus anything.

- [ ] **Step 3: Verify mobile viewport via agent-browser**

```bash
cd /tmp/agent-browser-tool
./node_modules/.bin/agent-browser close
./node_modules/.bin/agent-browser --executable-path /tmp/chrome-libs/chrome-wrapper.sh open http://localhost:3011/ --device "iPhone 12"
```
(Device emulation via `--device` avoids the earlier `viewport` command issue.) Log in again, navigate to the Dashboard, screenshot, and confirm: sidebar collapses into the mobile `Sheet` (already existing behavior, must still work), pipeline stations don't overflow off-screen without a scroll affordance (Task 7's `overflow-x-auto` wrapper already handles this), profile tabs scroll instead of clipping.

- [ ] **Step 4: Typecheck, lint, full test suite**

Run: `npx tsc --noEmit && npx eslint . && npx vitest run`
Expected: 0 errors, ≤59 warnings, 505/505 + new tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/dashboard-tabs.tsx src/components/dashboard/dashboard-alert-center.tsx
git commit -m "Ajusta overflow das abas de perfil e aria-live da Central de Alertas (responsividade + acessibilidade)"
```

---

### Task 11: Full verification pass (/verify equivalent) + before/after comparison

**Files:** none (verification only)

- [ ] **Step 1: Full quality gate**

Run: `npx tsc --noEmit && npx eslint . && npx vitest run && npm run build`
Expected: 0 TS errors, ≤59 ESLint warnings (0 new), all tests passing (505 baseline + `dashboard-trend.test.ts` + `use-count-up.test.ts`), clean production build.

- [ ] **Step 2: Live before/after screenshot comparison on the isolated preview server**

Restart the preview dev server if needed (`localhost:3011`, `prisma/test.db` — never the production port/DB), log in, and capture: Centro de Operações (full page), Comercial tab, and the mobile viewport — same 3 views captured during diagnosis. Place all 6 (3 before + 3 after) side by side for the final report to the user.

- [ ] **Step 3: Confirm zero regressions in existing navigation**

Click through: each of the 9 profile tabs loads without a console error; every pipeline stage button, alert card, and "Ver mais" button still calls `onNavigate`/`onOpen` and switches `activeModule` correctly (spot-check 3: pipeline "Compra" stage → lands on Compras module; a KPI's "Ver mais" → lands on its linked module; sidebar "Orçamentos" → lands on Orçamentos).

- [ ] **Step 4: Commit the plan/spec docs update (mark complete) and report to the user**

```bash
git add docs/superpowers/
git commit -m "Marca plano de evolucao visual do Dashboard como concluido"
```

---

### Task 12: Code review

- [ ] Run `/code-review` (or the equivalent skill) against the full diff produced by Tasks 1-11 before considering the work final. Address any findings the same way established in this project's quality-gate discipline (fix, re-run gate, re-commit) — do not silently dismiss a finding without explaining why in the response to the user.
