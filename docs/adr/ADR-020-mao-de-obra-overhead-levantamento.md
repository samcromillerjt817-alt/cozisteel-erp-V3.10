# ADR-020 — Mão de Obra e Overhead (Fase 12, Subetapa 8): Levantamento

- **Status**: **Levantamento aprovado — 4 decisões resolvidas pelo usuário em 2026-07-15** (Parte 5).
  Implementação ainda não iniciada.
- **Data**: 2026-07-15
- **Depende de**: [ADR-016 — Financeiro Integrado](./ADR-016-financeiro-integrado-levantamento.md) (esta
  é a Subetapa 8, registrada lá como "futura, fora do escopo desta rodada", §2.3 e Parte 9, item 8);
  [ADR-005 — Engenharia do Produto (BOM)](./ADR-005-engenharia-produto-bom.md) (`ProductOperation`,
  fonte dos dados de tempo); [ADR-008 — Infraestrutura Financeira](./ADR-008-infraestrutura-financeira.md)
  (`CostCenter`, ainda não implementado — ver Parte 3)
- **Escopo explicitamente fora desta rodada**: qualquer schema, migração, Service ou UI. Este documento
  só levanta o que existe, avalia opções e lista decisões pendentes — implementação começa numa rodada
  futura, depois de aprovação.

---

## PARTE 1 — Contexto

A Fase 12 (Financeiro) está em produção desde 2026-07-14 com custo real de material por lote
(`ProductBatch.materialCost`, `CostingService`, Subetapas 1-7), mas **nenhum custo de mão de obra ou
overhead é calculado ou persistido em lugar nenhum do sistema**. O ADR-016 já identificou esse vazio
(§2.3) e resolveu, como decisão pendente #4 daquela rodada, deixá-lo explicitamente fora do escopo
inicial — "sem dado bruto suficiente hoje". Esta é a retomada formal dessa subetapa.

**Achado que muda a análise do ADR-016**: a afirmação de §2.3 — *"taxa fixa por hora/tipo de produto ×
tempo padrão da BOM (se algum dia a BOM ganhar um campo de tempo de operação — hoje não tem)"* — está
desatualizada. O modelo `ProductOperation` (schema atual) **já tem** `setupTimeMinutes` e
`runTimeMinutesPerUnit`, por operação, por revisão de BOM:

```prisma
model ProductOperation {
  bomRevisionId         String
  operationTypeId       String
  sequenceOrder         Int
  setupTimeMinutes      Float   @default(0)  // tempo de preparação, minutos
  runTimeMinutesPerUnit Float   @default(0)  // tempo de execução por unidade, minutos
  workCenter            String  @default("") // texto livre — sem catálogo próprio ainda
}
```

Ou seja: **o dado bruto de tempo padrão já existe**, por revisão de BOM congelada
(`ProductionOrder.bomRevisionId` já preserva qual revisão foi usada em cada OP, opcional — OPs sem
engenharia formal não têm). O que falta não é o tempo, é (a) uma **taxa monetária** por hora e (b) uma
**política de overhead** — nenhuma das duas tem qualquer dado ou configuração hoje
(confirmado: nenhum campo `hourlyRate`/`laborRate`/`overheadRate` existe em `schema.prisma` nem em
`SystemSetting`).

---

## PARTE 2 — Mão de obra: opções avaliadas

### (a) Taxa fixa × tempo padrão da BOM — recomendação técnica preliminar

`tempoOP = Σ (setupTimeMinutes + runTimeMinutesPerUnit × quantidadeProduzida)` de todas as
`ProductOperation` da `BomRevision` congelada na OP, multiplicado por uma taxa/hora configurável.

- **Vantagem**: zero apontamento manual novo — reaproveita 100% do dado que a Fase 4 (ADR-005) já
  captura; calculável tanto prospectivamente (orçamento/precificação) quanto retroativamente para
  qualquer OP que tenha `bomRevisionId`; consistente com o princípio já usado em `materialCost` (custo
  padrão vs. real é a mesma tensão do ADR-016 §2.2, mas aqui só existe a opção "padrão" porque não há
  apontamento de hora real).
- **Desvantagem**: é custo **padrão**, não real — não captura hora-extra, retrabalho, parada de
  máquina, ou operário mais lento/rápido que o tempo cadastrado. OPs sem `bomRevisionId` (produção sem
  engenharia formal) não têm como calcular nada por essa via.
- **Taxa por operação vs. taxa única**: `workCenter` hoje é texto livre, sem catálogo — uma taxa
  diferente por centro de trabalho exigiria promovê-lo a uma tabela própria primeiro (fora do escopo
  mínimo). Opção mínima viável: **uma taxa única, configurável** (`R$/hora`), aplicada a todo o tempo
  calculado, independente do `workCenter` do passo.

### (b) Apontamento manual por OP (novo model, ex. `ProductionLaborEntry`)

Um ou mais colaboradores registram início/fim (ou horas trabalhadas) por Ordem de Produção.

- **Vantagem**: custo real, não padrão — captura o que de fato aconteceu.
- **Desvantagem**: exige **dado bruto que não existe hoje em lugar nenhum** — novo model, nova tela,
  novo hábito operacional (alguém precisa efetivamente apontar hora todo dia); risco real de ficar
  incompleto/inconsistente se a operação não adotar o hábito, o que deixaria o custo de mão de obra
  pior que uma estimativa padrão (dado parcial é mais enganoso que dado claramente rotulado como
  "padrão"). É o mesmo tipo de risco que o ADR-016 §2.3 já sinalizou como razão de deixar isso fora do
  escopo inicial.

**Recomendação técnica preliminar**: começar por **(a) taxa fixa × tempo padrão**, exatamente pelo
motivo oposto ao que bloqueava a Fase 12 quando o ADR-016 foi escrito — o dado bruto necessário **já
existe**, e persistir esse custo padrão no lote é estritamente aditivo (não impede evoluir para (b) no
futuro, quando/se apontamento manual fizer sentido operacionalmente). Sinalizar sempre como "padrão",
nunca como "real", em qualquer relatório/tela que exiba esse número.

---

## PARTE 3 — Overhead: opções avaliadas

### (a) Rateio percentual sobre custo de material — recomendação técnica preliminar

`overheadOP = materialCost × percentualConfigurável` (ex. 15%). Simples, sem novo domínio, mesma
filosofia de "taxa única configurável" da mão de obra.

- **Vantagem**: nenhum dado novo necessário além de um percentual configurável; `materialCost` já é
  persistido e confiável desde a Subetapa 1-2.
- **Desvantagem**: é uma aproximação grosseira — dilui custos indiretos reais (aluguel, energia,
  depreciação de máquina) num único número sem relação direta com o que cada produto de fato consome
  desses recursos indiretos.

### (b) Rateio por centro de custo

Dependeria de `CostCenter` (ADR-008) existir de verdade com dados reais de custo indireto por centro —
gatilho ainda não satisfeito (mesmo achado já registrado no ADR-016, Parte 10, item 2: a "janela de
aproveitamento oportunista" do ADR-008 já passou sem o segundo gatilho se confirmar).

**Recomendação técnica preliminar**: (a) rateio percentual simples, pelo mesmo motivo do ADR-016 —
modelar (b) sem `CostCenter` real seria especulação. (a) é estritamente mais simples e não impede migrar
para (b) no futuro se `CostCenter` for retomado.

---

## PARTE 4 — Onde persistir e como integrar com o que já existe

Mesma disciplina de imutabilidade já estabelecida para `MaterialBatch.unitCost` e
`ProductBatch.materialCost`: calculado e gravado **uma vez**, no momento da produção, nunca recalculado
retroativamente (nem se a taxa/hora ou o percentual de overhead mudar depois — isso preservaria histórico
real de "quanto custava produzir isso naquela época", consistente com o resto do Financeiro).

Proposta mínima: dois novos campos em `ProductBatch`, ao lado de `materialCost` —

```prisma
model ProductBatch {
  // ...existente...
  materialCost   Float?  // já existe (Subetapa 1/2)
  laborCost      Float?  // novo — nulo se OP sem bomRevisionId (sem como calcular)
  overheadCost   Float?  // novo — nulo pela mesma razão, OU se materialCost também for nulo
}
```

`StockValuationService`/`FinancialReportService` (ambos já desenhados para serem reutilizáveis,
ADR-016) ganhariam `laborCost`/`overheadCost` nas mesmas agregações que já leem `materialCost` — sem
novo Service dedicado. A taxa/hora e o percentual de overhead ficariam em **Configurações** (mesmo
padrão de `company.*`/`pdf.*` já usado — grupo novo, ex. `custeio.laborRatePerHour`,
`custeio.overheadPercent`), editáveis pelo usuário sem deploy.

---

## PARTE 5 — Decisões (RESOLVIDAS pelo usuário em 2026-07-15)

1. **Mão de obra**: **(a) taxa fixa × tempo padrão da BOM.** Zero apontamento manual novo — reaproveita
   o tempo já cadastrado desde a Fase 4. Custo padrão, não real (limitação aceita).
2. **Granularidade da taxa de mão de obra**: **taxa única global**, configurável em Configurações. Não
   promove `workCenter` a catálogo nesta rodada.
3. **Overhead**: **(a) percentual simples sobre custo de material**, configurável. Não aguarda
   `CostCenter` (ADR-008) — permanece adiado como já estava.
4. **Granularidade do overhead**: **percentual único global**, não por categoria de produto/material.
5. **OPs sem `bomRevisionId`** (produção sem engenharia formal): `laborCost`/`overheadCost` ficam
   `null` — mesmo tratamento que `materialCost` já recebe hoje para produto não lot-controlled
   (decisão técnica, consistente com o padrão existente, não submetida ao usuário separadamente).

**Resultado**: `custeio.laborRatePerHour` e `custeio.overheadPercent` como as duas únicas variáveis de
política, ambas taxa/percentual único global, editáveis em Configurações — a opção mínima viável descrita
na Parte 4, sem nenhuma das extensões mais granulares (taxa por `workCenter`, percentual por categoria,
apontamento manual, `CostCenter`) entrando nesta rodada.

---

## PARTE 6 — Plano de subetapas (aprovado, pronto para implementação)

1. Schema: `ProductBatch.laborCost`/`overheadCost` + grupo de configuração `custeio.*` em
   `SystemSetting` (seed com valores neutros/zero até o usuário configurar).
2. `CostingService` ganha o cálculo de mão de obra (Σ tempo padrão × taxa) e overhead (% sobre
   `materialCost`), chamado no mesmo ponto onde `materialCost` já é calculado (produção de um lote).
3. `StockValuationService`/`FinancialReportService` passam a incluir os dois novos custos nas
   agregações existentes (valorização de estoque, margem bruta).
4. Tela de configuração da taxa/hora e percentual de overhead (aba nova ou campo novo em
   Configurações), seguindo o padrão já usado por `EmpresaTab`.
5. Testes + `graphify update .` + atualização do ADR-001 (log de decisões), como toda subetapa anterior.

Mudança de schema (Subetapa 1 deste plano) exige autorização explícita e separada do usuário antes de
rodar contra o banco compartilhado — mesma regra permanente do projeto.

---

## Conclusão

O maior bloqueio que o ADR-016 registrou para esta subetapa — "nenhum dado bruto existe" — só era
totalmente verdade para overhead. Para mão de obra, o dado de tempo padrão já existe desde a Fase 4
(`ProductOperation.setupTimeMinutes`/`runTimeMinutesPerUnit`), o que mudou a recomendação técnica de
"esperar apontamento real" para "calcular custo padrão a partir do que já está cadastrado". As 4 decisões
da Parte 5 foram validadas pelo usuário em 2026-07-15, todas seguindo a opção mais simples/mínima em
cada dimensão — a Subetapa 8 está desbloqueada para implementação, começando pela Parte 6, item 1
(mudança de schema, que ainda precisa de autorização explícita e separada antes de tocar no banco
compartilhado).
