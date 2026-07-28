'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { FormDialog } from '@/components/domain/form-dialog'
import { Badge } from '@/components/ui/badge'

interface ProductBatchRow {
  id: string
  batchNumber: string
  quantityProduced: number
  producedAt: string
  reversedAt: string | null
}

/**
 * ADR-023 (Decisão #1, Estorno) — lotes produzidos por rodada (`ProductBatch`) existiam desde o
 * ADR-013 sem nenhuma tela. Primeira exposição: lista + ação "Estornar" por rodada, a mais arriscada
 * das 4 mapeadas no levantamento — recusa sem cascata quando o lote já virou componente de outra OP.
 */
export function ProductionBatchesSection({ productionOrderId }: { productionOrderId: string }) {
  const [rows, setRows] = useState<ProductBatchRow[]>([])
  const [loading, setLoading] = useState(true)
  const [reverseTarget, setReverseTarget] = useState<ProductBatchRow | null>(null)
  const [reverseReason, setReverseReason] = useState('')
  const [reverseSaving, setReverseSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/production-orders/${productionOrderId}/batches`)
      setRows(r.ok ? await r.json() : [])
    } catch {
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [productionOrderId])

  useEffect(() => {
    load()
  }, [load])

  async function saveReverse() {
    if (!reverseTarget) return
    if (!reverseReason.trim()) { toast.error('Informe o motivo do estorno'); return }
    setReverseSaving(true)
    try {
      const r = await fetch(`/api/production-orders/batches/${reverseTarget.id}/reverse`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: reverseReason }),
      })
      if (r.ok) {
        toast.success('Rodada de produção estornada!')
        setReverseTarget(null)
        load()
      } else {
        const err = await r.json()
        toast.error(err.error || 'Erro ao estornar rodada de produção')
      }
    } catch {
      toast.error('Erro ao estornar rodada de produção')
    } finally {
      setReverseSaving(false)
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">Carregando lotes produzidos...</p>
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">Nenhum lote produzido ainda (ou produto sem controle de lote).</p>

  return (
    <div className="space-y-1.5">
      {rows.map((b) => (
        <div key={b.id} className="flex items-center justify-between text-sm border rounded px-3 py-1.5 gap-2">
          <div className="flex items-center gap-2">
            <span className="font-mono">{b.batchNumber}</span>
            <span className="text-xs text-muted-foreground">{b.quantityProduced} un. — {new Date(b.producedAt).toLocaleDateString('pt-BR')}</span>
            {b.reversedAt && <Badge variant="outline">Estornado</Badge>}
          </div>
          {!b.reversedAt && (
            <Button variant="ghost" size="sm" className="text-destructive h-7 px-2" onClick={() => { setReverseTarget(b); setReverseReason('') }}>
              <Undo2 className="w-3.5 h-3.5" /> Estornar
            </Button>
          )}
        </div>
      ))}

      <FormDialog
        open={!!reverseTarget}
        onOpenChange={(open) => { if (!open) setReverseTarget(null) }}
        title={`Estornar Rodada — ${reverseTarget?.batchNumber || ''}`}
        onSave={saveReverse}
        saving={reverseSaving}
        saveLabel="Confirmar Estorno"
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Isso reverte o consumo de matéria-prima/subconjunto e a entrada do produto acabado desta
            rodada. Só é possível enquanto o lote gerado ainda não tiver sido consumido por outra
            Ordem de Produção.
          </p>
          <div className="space-y-1.5">
            <Label>Motivo do estorno</Label>
            <Textarea rows={3} value={reverseReason} onChange={(e) => setReverseReason(e.target.value)} placeholder="Ex.: produção lançada por engano" />
          </div>
        </div>
      </FormDialog>
    </div>
  )
}
