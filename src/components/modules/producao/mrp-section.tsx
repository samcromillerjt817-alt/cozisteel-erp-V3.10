'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Play, Check, X, AlertTriangle } from 'lucide-react'
import { DataTable, type DataTableColumn } from '@/components/platform/data-table'
import { Badge } from '@/components/ui/badge'
import { AsyncButton } from '@/components/domain/async-button'
import { useConfirm } from '@/components/domain/confirm-dialog'
import { MRP_SUGGESTION_TYPE_LABELS, type MrpSuggestionRow } from './types'

/**
 * ADR-023 (item 3, "completar a exposição do MRP") — motor de netting multinível (Fase 6, ADR-007)
 * e aprovação humana (Fase 7, ADR-009) já prontos e testados, mas sem NENHUMA rota/tela desde então.
 * Primeira exposição: rodar o MRP e decidir (aprovar → vira Requisição / descartar) cada sugestão
 * pendente, com as 3 lacunas de cálculo agora visíveis (estoque mínimo já embutido na falta, prazo do
 * fornecedor, data em que a falta vira problema de verdade).
 *
 * Sugestões de produção não têm destino automatizado ainda (`mrpSuggestionService.approve` recusa) —
 * "Aprovar" fica desabilitado nelas, só "Descartar" funciona, refletindo o backend em vez de esconder.
 */
export function MrpSection() {
  const confirmAction = useConfirm()
  const [rows, setRows] = useState<MrpSuggestionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/mrp/suggestions')
      setRows(r.ok ? await r.json() : [])
    } catch {
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function runMrp() {
    setRunning(true)
    try {
      const r = await fetch('/api/mrp/runs', { method: 'POST' })
      if (r.ok) {
        const run = await r.json()
        toast.success(`MRP executado: ${run.totalSuggestions} sugestão(ões) gerada(s).`)
        load()
      } else {
        const err = await r.json()
        toast.error(err.error || 'Erro ao executar o MRP')
      }
    } catch {
      toast.error('Erro ao executar o MRP')
    } finally {
      setRunning(false)
    }
  }

  async function approve(row: MrpSuggestionRow) {
    if (!(await confirmAction(`Aprovar esta sugestão? Isso cria uma Requisição de Compra para ${row.material?.name}.`))) return
    const r = await fetch(`/api/mrp/suggestions/${row.id}/approve`, { method: 'POST' })
    if (r.ok) {
      toast.success('Sugestão aprovada — Requisição criada.')
      load()
    } else {
      const err = await r.json()
      toast.error(err.error || 'Erro ao aprovar sugestão')
    }
  }

  async function dismiss(row: MrpSuggestionRow) {
    if (!(await confirmAction('Descartar esta sugestão? Ela some da lista, sem gerar nada.'))) return
    const r = await fetch(`/api/mrp/suggestions/${row.id}/dismiss`, { method: 'POST' })
    if (r.ok) {
      toast.success('Sugestão descartada.')
      load()
    } else {
      const err = await r.json()
      toast.error(err.error || 'Erro ao descartar sugestão')
    }
  }

  const columns: DataTableColumn<MrpSuggestionRow>[] = [
    {
      id: 'item', header: 'Item',
      cell: (s) => (
        <div className="flex items-center gap-2">
          <span>{s.material?.name || s.product?.name || '-'}</span>
          {s.isLate && (
            <Badge variant="destructive" className="gap-1">
              <AlertTriangle className="w-3 h-3" /> Atrasado
            </Badge>
          )}
        </div>
      ),
    },
    { id: 'type', header: 'Tipo', cell: (s) => <Badge variant="outline">{MRP_SUGGESTION_TYPE_LABELS[s.suggestionType] || s.suggestionType}</Badge> },
    { id: 'needed', header: 'Necessário', align: 'right', cell: (s) => <span className="font-mono">{s.quantityNeeded}</span>, hideBelow: 'md' },
    { id: 'available', header: 'Disponível', align: 'right', cell: (s) => <span className="font-mono">{s.quantityAvailable}</span>, hideBelow: 'lg' },
    { id: 'minStock', header: 'Estoque mín.', align: 'right', cell: (s) => <span className="font-mono">{s.minStockQty}</span>, hideBelow: 'lg' },
    { id: 'shortfall', header: 'Falta', align: 'right', cell: (s) => <span className="font-mono font-medium">{s.quantityShortfall}</span> },
    { id: 'supplier', header: 'Fornecedor', cell: (s) => s.supplierNameSnapshot || '-', hideBelow: 'md' },
    { id: 'leadTime', header: 'Prazo', align: 'right', cell: (s) => (s.leadTimeDays != null ? `${s.leadTimeDays}d` : '-'), hideBelow: 'lg' },
    { id: 'neededBy', header: 'Necessário até', cell: (s) => s.neededByDate || '-', hideBelow: 'md' },
    { id: 'orderBy', header: 'Comprar até', cell: (s) => s.suggestedOrderByDate || '-', hideBelow: 'md' },
  ]

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <AsyncButton onClick={runMrp} loading={running}>
          <Play className="w-4 h-4" /> Rodar MRP
        </AsyncButton>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        getRowId={(s) => s.id}
        loading={loading}
        emptyMessage="Nenhuma sugestão pendente. Rode o MRP para gerar sugestões a partir das Ordens de Produção abertas."
        rowActions={[
          {
            label: 'Aprovar', icon: <Check />, onClick: approve,
            disabled: (s) => s.suggestionType !== 'purchase',
          },
          { label: 'Descartar', icon: <X />, variant: 'destructive', onClick: dismiss },
        ]}
      />
    </div>
  )
}
