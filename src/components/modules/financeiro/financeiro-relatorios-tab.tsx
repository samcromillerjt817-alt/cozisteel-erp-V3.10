'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { DatePicker } from '@/components/form/date-picker'
import { isValidDate } from '@/components/form/date-input'
import { DashboardChart } from '@/components/dashboard/dashboard-chart'
import { formatCurrency } from '@/lib/format'

interface ProductOption {
  id: string
  name: string
  internalCode?: string
}

interface AccountBalances {
  receivable: { open: number; overdue: number }
  payable: { open: number; overdue: number }
}

interface CashFlowBucket {
  date: string
  receivable: number
  payable: number
  net: number
}

interface GrossMarginEstimate {
  revenue: number
  estimatedCost: number
  grossMargin: number
  grossMarginPercent: number | null
  costCoveragePercent: number
}

interface StockValuationTotals {
  rawMaterial: number
  finishedGoods: number
  total: number
}

interface MaterialCostHistoryPoint {
  batchNumber: string
  producedAt: string
  materialCost: number
  quantityProduced: number
}

function brDateToIso(value: string): string | null {
  if (!isValidDate(value)) return null
  const [day, month, year] = value.split('/')
  return `${year}-${month}-${day}`
}

function StatTile({ label, value, tone }: { label: string; value: string; tone?: 'default' | 'danger' }) {
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-xl font-semibold ${tone === 'danger' ? 'text-destructive' : ''}`}>{value}</p>
    </div>
  )
}

/**
 * Aba "Relatórios" de Financeiro (ADR-022, Fase UX-2, achado #01) — as 5 agregações de
 * `FinancialReportService` já existiam prontas e testadas desde o ADR-016/Subetapa 6, mas nenhuma
 * tela as consumia; só 1 widget de dashboard usava 1 dos 5 métodos. Cada card busca seu próprio dado
 * de forma independente, mesmo padrão já usado pelas outras abas de Financeiro/Configurações.
 */
export function FinanceiroRelatoriosTab({ products }: { products: ProductOption[] }) {
  const [balances, setBalances] = useState<AccountBalances | null>(null)
  const [balancesLoading, setBalancesLoading] = useState(false)

  const [daysAhead, setDaysAhead] = useState('90')
  const [cashFlow, setCashFlow] = useState<CashFlowBucket[]>([])
  const [cashFlowLoading, setCashFlowLoading] = useState(false)

  const [marginFrom, setMarginFrom] = useState('')
  const [marginTo, setMarginTo] = useState('')
  const [margin, setMargin] = useState<GrossMarginEstimate | null>(null)
  const [marginLoading, setMarginLoading] = useState(false)

  const [valuation, setValuation] = useState<StockValuationTotals | null>(null)
  const [valuationLoading, setValuationLoading] = useState(false)

  const [costProductId, setCostProductId] = useState('')
  const [costHistory, setCostHistory] = useState<MaterialCostHistoryPoint[]>([])
  const [costHistoryLoading, setCostHistoryLoading] = useState(false)

  const loadBalances = useCallback(async () => {
    setBalancesLoading(true)
    try {
      const r = await fetch('/api/financeiro/relatorios/saldo')
      if (r.ok) setBalances(await r.json())
    } catch {
      toast.error('Erro ao carregar saldo de contas')
    } finally {
      setBalancesLoading(false)
    }
  }, [])

  const loadCashFlow = useCallback(async () => {
    setCashFlowLoading(true)
    try {
      const r = await fetch(`/api/financeiro/relatorios/fluxo-caixa?daysAhead=${daysAhead}`)
      if (r.ok) setCashFlow(await r.json())
    } catch {
      toast.error('Erro ao carregar fluxo de caixa projetado')
    } finally {
      setCashFlowLoading(false)
    }
  }, [daysAhead])

  const loadValuation = useCallback(async () => {
    setValuationLoading(true)
    try {
      const r = await fetch('/api/financeiro/relatorios/valorizacao-estoque')
      if (r.ok) setValuation(await r.json())
    } catch {
      toast.error('Erro ao carregar valorização de estoque')
    } finally {
      setValuationLoading(false)
    }
  }, [])

  useEffect(() => { loadBalances() }, [loadBalances])
  useEffect(() => { loadCashFlow() }, [loadCashFlow])
  useEffect(() => { loadValuation() }, [loadValuation])

  async function generateMargin() {
    const fromIso = brDateToIso(marginFrom)
    const toIso = brDateToIso(marginTo)
    if (!fromIso || !toIso) {
      toast.error('Informe as duas datas do período (De/Até)')
      return
    }
    setMarginLoading(true)
    try {
      const r = await fetch(`/api/financeiro/relatorios/margem?from=${fromIso}&to=${toIso}`)
      if (r.ok) setMargin(await r.json())
      else toast.error('Erro ao calcular margem bruta estimada')
    } catch {
      toast.error('Erro ao calcular margem bruta estimada')
    } finally {
      setMarginLoading(false)
    }
  }

  async function loadCostHistory(productId: string) {
    setCostProductId(productId)
    if (!productId) { setCostHistory([]); return }
    setCostHistoryLoading(true)
    try {
      const r = await fetch(`/api/financeiro/relatorios/custo-material/${productId}`)
      if (r.ok) setCostHistory(await r.json())
      else toast.error('Erro ao carregar histórico de custo')
    } catch {
      toast.error('Erro ao carregar histórico de custo')
    } finally {
      setCostHistoryLoading(false)
    }
  }

  const cashFlowChartData = {
    chartType: 'line' as const,
    series: [
      { label: 'Entradas previstas', data: cashFlow.map((b) => ({ x: new Date(b.date).toLocaleDateString('pt-BR'), y: b.receivable })) },
      { label: 'Saídas previstas', data: cashFlow.map((b) => ({ x: new Date(b.date).toLocaleDateString('pt-BR'), y: b.payable })) },
    ],
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">Saldo de Contas</CardTitle></CardHeader>
        <CardContent>
          {balancesLoading || !balances ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatTile label="A Receber (em aberto)" value={formatCurrency(balances.receivable.open)} />
              <StatTile label="A Receber (vencido)" value={formatCurrency(balances.receivable.overdue)} tone={balances.receivable.overdue > 0 ? 'danger' : 'default'} />
              <StatTile label="A Pagar (em aberto)" value={formatCurrency(balances.payable.open)} />
              <StatTile label="A Pagar (vencido)" value={formatCurrency(balances.payable.overdue)} tone={balances.payable.overdue > 0 ? 'danger' : 'default'} />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Fluxo de Caixa Projetado</CardTitle>
          <Select value={daysAhead} onValueChange={setDaysAhead}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="30">Próximos 30 dias</SelectItem>
              <SelectItem value="60">Próximos 60 dias</SelectItem>
              <SelectItem value="90">Próximos 90 dias</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {cashFlowLoading ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : cashFlow.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Nenhum título em aberto no período — nada a projetar.</p>
          ) : (
            <DashboardChart data={cashFlowChartData} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Margem Bruta Estimada</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Estimativa: receita real do período menos o custo mais recente conhecido por produto vendido —
            não é uma margem calculada venda a venda (não há vínculo entre item vendido e o lote de produção
            que o atendeu). <code className="font-mono">% com custo conhecido</code> mostra a confiabilidade do número.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5"><Label className="text-xs">De</Label><DatePicker value={marginFrom} onChange={setMarginFrom} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Até</Label><DatePicker value={marginTo} onChange={setMarginTo} /></div>
            <Button onClick={generateMargin} disabled={marginLoading}>{marginLoading ? 'Calculando...' : 'Calcular'}</Button>
          </div>
          {margin && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatTile label="Receita" value={formatCurrency(margin.revenue)} />
              <StatTile label="Custo estimado" value={formatCurrency(margin.estimatedCost)} />
              <StatTile label="Margem bruta" value={formatCurrency(margin.grossMargin)} />
              <StatTile label="% com custo conhecido" value={`${margin.costCoveragePercent.toFixed(0)}%`} tone={margin.costCoveragePercent < 100 ? 'danger' : 'default'} />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Valorização de Estoque</CardTitle></CardHeader>
        <CardContent>
          {valuationLoading || !valuation ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <StatTile label="Matéria-prima" value={formatCurrency(valuation.rawMaterial)} />
              <StatTile label="Produto acabado (estimado)" value={formatCurrency(valuation.finishedGoods)} />
              <StatTile label="Total" value={formatCurrency(valuation.total)} />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Histórico de Custo por Material (produto)</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <Select value={costProductId} onValueChange={loadCostHistory}>
            <SelectTrigger className="w-full sm:w-96"><SelectValue placeholder="Selecionar um produto" /></SelectTrigger>
            <SelectContent>
              {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.internalCode ? `${p.internalCode} — ${p.name}` : p.name}</SelectItem>)}
            </SelectContent>
          </Select>
          {costHistoryLoading ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : costProductId && costHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum lote de produção com custo registrado para este produto.</p>
          ) : costHistory.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b">
                    <th className="py-1.5 pr-4">Lote</th>
                    <th className="py-1.5 pr-4">Produzido em</th>
                    <th className="py-1.5 pr-4">Quantidade</th>
                    <th className="py-1.5">Custo de material</th>
                  </tr>
                </thead>
                <tbody>
                  {costHistory.map((h) => (
                    <tr key={h.batchNumber} className="border-b last:border-0">
                      <td className="py-1.5 pr-4 font-mono">{h.batchNumber}</td>
                      <td className="py-1.5 pr-4">{new Date(h.producedAt).toLocaleDateString('pt-BR')}</td>
                      <td className="py-1.5 pr-4">{h.quantityProduced}</td>
                      <td className="py-1.5 font-medium">{formatCurrency(h.materialCost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
