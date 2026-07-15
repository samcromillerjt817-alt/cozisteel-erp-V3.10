## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- Consult the graph FIRST, before reading source or answering any project question — not just for broad architecture questions. Fall back to source code only if the graph doesn't have enough, and to general knowledge only as a last resort.
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- Run `graphify update .` whenever there's a relevant change to architecture, models, relationships, business rules, or flow between modules — not just at the end of a task or phase. Do this as changes happen, not batched at the end.

**Diagnóstico registrado (2026-07-10) — limitação confirmada, não ignorar**: `graphify update .` (o
comando efetivamente usado neste projeto) só faz extração de AST de **código-fonte** ("no LLM needed").
O **conteúdo dos arquivos `docs/adr/*.md` nunca é semanticamente indexado** — confirmado por consulta
direta ao grafo: conceitos exclusivos de um ADR (ex. "Recharts", "Dashboard modular por widgets") não
existem em `graphify-out/graph.json`, e nenhum nó tem `source` apontando para um arquivo `.md` de
`docs/adr/`. Os únicos nós "ADR-00XX" que existem são citações rasas extraídas de **comentários de
código** que mencionam o número do ADR (`docref`, grau 1 — um ponteiro "este arquivo cita aquele ADR",
nunca uma representação do conteúdo). Extração semântica de markdown exigiria o pipeline com LLM
(`GEMINI_API_KEY`/`GOOGLE_API_KEY`), não configurado neste projeto. Há também um warning cosmético
separado (`file_hash requires a file`) causado por case-sensitivity do path neste ambiente WSL/Windows —
não é a causa raiz da não-indexação, só um sintoma adicional. **Implicação prática**: para o conteúdo
de um ADR específico (princípios, decisões, tabelas), sempre leia o arquivo diretamente (`Read`) — o
grafo só ajuda a localizar QUAL ADR é citado por qual código, nunca substitui a leitura do documento em
si. Ver `docs/adr/ADR-001-principios-arquiteturais.md`, Princípio 12, para o texto completo.

## gstack

Este projeto usa a skill gstack para navegação web assistida por IA. Instalação (global por
desenvolvedor, não vendorizada no repo — é assim que o gstack é projetado):

```bash
git clone --single-branch --depth 1 https://github.com/garrytan/gstack.git ~/.claude/skills/gstack
cd ~/.claude/skills/gstack && ./setup
```

Regras:
- Use a skill `/browse` do gstack para toda navegação na web. Nunca use as ferramentas `mcp__claude-in-chrome__*`.
- Skills do gstack disponíveis: `/office-hours`, `/plan-ceo-review`, `/plan-eng-review`, `/plan-design-review`, `/design-consultation`.

## Health Stack

- typecheck: tsc --noEmit
- lint: eslint .
- test: vitest run

## Arquitetura

Este projeto está evoluindo por um roadmap de 12 fases (Services, eventos de domínio, máquina de estados,
MRP, reserva de estoque, rastreabilidade por lote, Financeiro transversal). Os princípios arquiteturais
oficiais estão em `docs/adr/ADR-001-principios-arquiteturais.md` — consulte antes de criar ou alterar
qualquer model, Service, evento ou entidade. Nenhuma fase deve ser implementada pensando só na
necessidade imediata; toda decisão é avaliada contra a arquitetura final do ERP (Comercial, Produção,
Compras, Estoque, Financeiro), nunca sacrificando consistência por conveniência de curto prazo.
