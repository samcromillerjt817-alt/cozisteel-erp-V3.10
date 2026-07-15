// Paleta categórica oficial do ERP (Fase 11.5, Subetapa 11.5.1) — promovida da Dashboard (Fase 11,
// validada pela skill dataviz, 2026-07-10) para uso em qualquer gráfico do sistema, não só o
// Dashboard. Ordem fixa, nunca ciclada por rank. `node validate_palette.js` confirmou: bandas de
// luminância e chroma OK, pior par CVD ΔE 24.2 (bem acima do piso de 12). 3 tons (água/amarelo/
// magenta) ficam abaixo de 3:1 de contraste na superfície clara — mitigado por sempre haver legenda +
// tooltip (nunca cor isolada carregando significado), conforme a própria regra da skill.
//
// Os mesmos 8 valores estão espelhados como CSS custom properties em `globals.css`
// (`--chart-cat-1..8`) — preparação de tema (Fase 11.5, Decisão 1), mantidos em sincronia
// manualmente: este array é o valor real consumido pelo Recharts, as variáveis CSS são a
// documentação/ponto de partida para um futuro tema escuro.
export const ERP_CHART_PALETTE = [
  '#2a78d6', // azul
  '#1baf7a', // água
  '#eda100', // amarelo
  '#008300', // verde
  '#4a3aa7', // violeta
  '#e34948', // vermelho
  '#e87ba4', // magenta
  '#eb6834', // laranja
] as const

export function getChartColor(index: number): string {
  return ERP_CHART_PALETTE[index % ERP_CHART_PALETTE.length]
}
