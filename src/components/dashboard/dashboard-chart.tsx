'use client'

import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { getChartColor } from '@/lib/erp-chart-palette'
import { translateStatusLabel } from './dashboard-status-labels'
import type { DashboardChartData } from '@/app/services/dashboard-types'

interface DashboardChartProps {
  data: DashboardChartData
  height?: number
}

/**
 * Wrapper único e reutilizável do Recharts para todo o Dashboard (Fase 11, ADR-017, Subetapa 7) —
 * desacoplado de qualquer widget específico, consome só a forma genérica `DashboardChartData` já
 * definida desde a Subetapa 1. Reaproveitável por qualquer módulo futuro (ex.: Financeiro, Fase 12)
 * que produza esse mesmo formato, sem precisar de um componente de gráfico novo.
 *
 * `donut`/`bar` (série única, cor por categoria) cobrem os 48 widgets de hoje. `line` já suporta
 * múltiplas séries (nenhum widget usa ainda — plausível para o Financeiro comparar receita x custo
 * ao longo do tempo). `funnel` é aproximado como barra horizontal (nenhum widget usa hoje; se um
 * funil de verdade for necessário depois, trocar por `<FunnelChart>` do Recharts nesta função, sem
 * mexer em quem chama).
 */
export function DashboardChart({ data, height = 260 }: DashboardChartProps) {
  if (data.chartType === 'donut') {
    const series = data.series[0]
    const pieData = series?.data.map((point) => ({ name: translateStatusLabel(point.x), value: point.y })) || []
    return (
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie data={pieData} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="80%" paddingAngle={2}>
            {pieData.map((_, index) => (
              <Cell key={index} fill={getChartColor(index)} />
            ))}
          </Pie>
          <Tooltip />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    )
  }

  if (data.chartType === 'line') {
    // Reindexa por x (uma linha por valor de x), uma coluna por série — Recharts precisa de um
    // único array de pontos, não de um array por série.
    const xValues = Array.from(new Set(data.series.flatMap((s) => s.data.map((d) => d.x))))
    const rows = xValues.map((x) => {
      const row: Record<string, string | number> = { x: translateStatusLabel(x) }
      data.series.forEach((s) => {
        row[s.label] = s.data.find((d) => d.x === x)?.y ?? 0
      })
      return row
    })
    return (
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={rows}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="x" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} />
          <Tooltip />
          {data.series.length > 1 && <Legend />}
          {data.series.map((s, index) => (
            <Line key={s.label} type="monotone" dataKey={s.label} stroke={getChartColor(index)} strokeWidth={2} dot={{ r: 3 }} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    )
  }

  // 'bar' (padrão) e 'funnel' (aproximado como barra horizontal) — série única, cor por categoria.
  const series = data.series[0]
  const rows = series?.data.map((point) => ({ x: translateStatusLabel(point.x), y: point.y })) || []
  const horizontal = data.chartType === 'funnel'
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} layout={horizontal ? 'vertical' : 'horizontal'}>
        <CartesianGrid strokeDasharray="3 3" vertical={!horizontal} horizontal={horizontal} />
        {horizontal ? (
          <>
            <XAxis type="number" tick={{ fontSize: 12 }} />
            <YAxis type="category" dataKey="x" tick={{ fontSize: 12 }} width={120} />
          </>
        ) : (
          <>
            <XAxis dataKey="x" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
          </>
        )}
        <Tooltip />
        <Bar dataKey="y" radius={[4, 4, 0, 0]}>
          {rows.map((_, index) => (
            <Cell key={index} fill={getChartColor(index)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
