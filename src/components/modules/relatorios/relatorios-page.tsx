'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Download, FileOutput } from 'lucide-react'
import { PageHeader } from '@/components/platform/page-header'
import { FilterBar } from '@/components/platform/filter-bar'
import { DataTable, type DataTableColumn } from '@/components/platform/data-table'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { DatePicker } from '@/components/form/date-picker'
import { formatCurrency, statusLabels } from '@/lib/format'
import { PRODUCTION_ORDER_STATUS_LABELS } from '../producao/types'
import { REQUISITION_STATUS_LABELS } from '../requisicoes/types'
import { REPORT_TYPE_LABELS, REPORT_SUMMARY_LABELS, REPORT_SUMMARY_MONEY_KEYS, type ReportType, type ReportResult } from './types'

type ReportRow = Record<string, unknown> & { __rowId: string }

const STATUS_LABELS_BY_TYPE: Partial<Record<ReportType, Record<string, string>>> = {
  sales: statusLabels,
  production: PRODUCTION_ORDER_STATUS_LABELS,
  purchases: REQUISITION_STATUS_LABELS,
}

/**
 * Módulo Relatórios (Fase 11.5, Subetapa 11.5.9 — normalização final). Sai da tabela HTML crua
 * (`<table>` nativo com colunas calculadas por `Object.keys(rows[0])`) para o `DataTable` — mesmas
 * colunas dinâmicas, agora com loading/empty state padronizados do resto do ERP.
 *
 * **Achado, não corrigido de propósito**: o tipo "Compras (Requisições)" consulta `Requisition`, não
 * `PurchaseOrder` (o módulo Compras, já migrado na Subetapa 11.5.8) — o rótulo já deixa isso explícito
 * no parêntese, não é um bug de UI, é uma decisão de produto anterior a esta subetapa (que tipo de
 * relatório de compras faz sentido — por Requisição ou por Pedido de Compra formal — é uma decisão do
 * usuário, não uma correção de migração).
 */
export function RelatoriosPage() {
  const [reportType, setReportType] = useState<ReportType>('sales')
  const [reportFrom, setReportFrom] = useState('')
  const [reportTo, setReportTo] = useState('')
  const [reportStatus, setReportStatus] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ReportResult | null>(null)

  function queryString() {
    const params = new URLSearchParams()
    if (reportFrom) params.set('from', reportFrom)
    if (reportTo) params.set('to', reportTo)
    if (reportStatus) params.set('status', reportStatus)
    return params.toString()
  }

  function handleTypeChange(value: ReportType) {
    setReportType(value)
    setReportStatus('')
    setResult(null)
  }

  async function generate() {
    setLoading(true)
    setResult(null)
    try {
      const r = await fetch(`/api/reports/${reportType}?${queryString()}`)
      const json = await r.json()
      if (!r.ok) {
        toast.error(json.error || 'Erro ao gerar relatório')
        return
      }
      setResult({ summary: json.summary, rows: json.rows })
    } catch {
      toast.error('Erro ao gerar relatório')
    } finally {
      setLoading(false)
    }
  }

  function downloadCsv() {
    window.open(`/api/reports/${reportType}?${queryString()}&format=csv`, '_blank')
  }

  function downloadPdf() {
    window.open(`/api/reports/${reportType}/pdf?${queryString()}`, '_blank')
  }

  const rawRows = result?.rows || []
  const columns: DataTableColumn<ReportRow>[] = rawRows.length > 0
    ? Object.keys(rawRows[0]).map((key) => ({ id: key, header: key, cell: (row) => String(row[key] ?? '') }))
    : []
  const tableRows: ReportRow[] = rawRows.map((row, idx) => ({ ...row, __rowId: String(idx) }))
  const statusOptions = STATUS_LABELS_BY_TYPE[reportType]

  return (
    <div className="space-y-4">
      <PageHeader title="Relatórios" />

      <FilterBar>
        <div className="space-y-1.5">
          <Label className="text-xs">Tipo de relatório</Label>
          <Select value={reportType} onValueChange={(v) => handleTypeChange(v as ReportType)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(REPORT_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5"><Label className="text-xs">De</Label><DatePicker value={reportFrom} onChange={setReportFrom} /></div>
        <div className="space-y-1.5"><Label className="text-xs">Até</Label><DatePicker value={reportTo} onChange={setReportTo} /></div>
        {statusOptions && (
          <div className="space-y-1.5">
            <Label className="text-xs">Status</Label>
            <Select value={reportStatus || 'all'} onValueChange={(v) => setReportStatus(v === 'all' ? '' : v)}>
              <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {Object.entries(statusOptions).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        <Button onClick={generate} disabled={loading}>{loading ? 'Gerando...' : 'Gerar Relatório'}</Button>
      </FilterBar>

      {result && (
        <>
          <div className="flex flex-wrap gap-4">
            {Object.entries(result.summary || {}).map(([k, v]) => (
              <Card key={k} className="flex-1 min-w-[160px]"><CardContent className="p-4">
                <p className="text-xs text-muted-foreground">{REPORT_SUMMARY_LABELS[k] || k}</p>
                <p className="text-xl font-bold">
                  {typeof v === 'number'
                    ? (REPORT_SUMMARY_MONEY_KEYS.has(k) ? formatCurrency(v) : v.toLocaleString('pt-BR'))
                    : String(v)}
                </p>
              </CardContent></Card>
            ))}
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={downloadCsv}><Download className="w-4 h-4 mr-1" /> Exportar Excel/CSV</Button>
            <Button variant="outline" onClick={downloadPdf}><FileOutput className="w-4 h-4 mr-1" /> Exportar PDF</Button>
          </div>

          <DataTable
            columns={columns}
            rows={tableRows}
            getRowId={(row) => row.__rowId}
            emptyMessage="Nenhum registro encontrado para os filtros selecionados"
          />
        </>
      )}
    </div>
  )
}
