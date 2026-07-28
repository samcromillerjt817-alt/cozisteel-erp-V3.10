'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import type { BomRevisionRow, BomCompareResult } from './bom-types'

interface BomCompareDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  fromRevision: BomRevisionRow | null
  otherRevisions: BomRevisionRow[]
}

/** ADR-023 (item 4) — diff estrutural entre duas revisões do mesmo produto. */
export function BomCompareDialog({ open, onOpenChange, fromRevision, otherRevisions }: BomCompareDialogProps) {
  const [toId, setToId] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<BomCompareResult | null>(null)

  async function compare(selectedToId: string) {
    setToId(selectedToId)
    if (!fromRevision || !selectedToId) return
    setLoading(true)
    setResult(null)
    try {
      const r = await fetch(`/api/bom-revisions/compare?fromId=${fromRevision.id}&toId=${selectedToId}`)
      if (r.ok) {
        setResult(await r.json())
      } else {
        const err = await r.json()
        toast.error(err.error || 'Erro ao comparar revisões')
      }
    } catch {
      toast.error('Erro ao comparar revisões')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) { setToId(''); setResult(null) } }}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Comparar Revisão {fromRevision?.revisionCode}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Comparar com</Label>
            <Select value={toId} onValueChange={compare}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Selecione a outra revisão" /></SelectTrigger>
              <SelectContent>
                {otherRevisions.filter((r) => r.id !== fromRevision?.id).map((r) => (
                  <SelectItem key={r.id} value={r.id}>Revisão {r.revisionCode}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {loading && <p className="text-sm text-muted-foreground">Comparando...</p>}

          {result && !loading && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {result.fromRevisionCode} → {result.toRevisionCode} — {result.unchangedCount} item(ns) sem alteração
              </p>

              {result.added.length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase text-muted-foreground">Adicionados</Label>
                  {result.added.map((l, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <Badge variant="outline" className="text-green-700 border-green-300">+</Badge>
                      <span>{l.name} — {l.quantity} {l.unit}</span>
                    </div>
                  ))}
                </div>
              )}

              {result.removed.length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase text-muted-foreground">Removidos</Label>
                  {result.removed.map((l, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <Badge variant="outline" className="text-destructive border-destructive/40">−</Badge>
                      <span>{l.name} — {l.quantity} {l.unit}</span>
                    </div>
                  ))}
                </div>
              )}

              {result.changed.length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase text-muted-foreground">Alterados</Label>
                  {result.changed.map((l, i) => (
                    <div key={i} className="text-sm">
                      <span>{l.name}: {l.quantityFrom} {l.unitFrom} → {l.quantityTo} {l.unitTo}</span>
                      {l.scrapPctFrom !== l.scrapPctTo && <span className="text-muted-foreground"> (perda {l.scrapPctFrom}% → {l.scrapPctTo}%)</span>}
                    </div>
                  ))}
                </div>
              )}

              {result.added.length === 0 && result.removed.length === 0 && result.changed.length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhuma diferença estrutural entre as duas revisões.</p>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
