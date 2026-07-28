'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Trash2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { AsyncButton } from '@/components/domain/async-button'
import type { BomLineRow } from './bom-types'

interface BomSubstitutesDialogProps {
  line: BomLineRow | null
  onOpenChange: (open: boolean) => void
  materialsFull: { id: string; name: string }[]
  editable: boolean
  onChanged: () => void
}

/** ADR-023 (item 4) — materiais substitutos aceitos para uma linha de matéria-prima. Só
 * informativo (não consumido por MRP/Reserva/Produção nesta versão, ver bom-types.ts). */
export function BomSubstitutesDialog({ line, onOpenChange, materialsFull, editable, onChanged }: BomSubstitutesDialogProps) {
  const [materialId, setMaterialId] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  async function add() {
    if (!line || !materialId) { toast.error('Selecione a matéria-prima substituta'); return }
    setSaving(true)
    try {
      const r = await fetch(`/api/bom-revisions/${line.bomRevisionId}/lines/${line.id}/substitutes`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ materialId, notes }),
      })
      if (r.ok) {
        toast.success('Substituto adicionado!')
        setMaterialId('')
        setNotes('')
        onChanged()
      } else {
        const err = await r.json()
        toast.error(err.error || 'Erro ao adicionar substituto')
      }
    } catch {
      toast.error('Erro ao adicionar substituto')
    } finally {
      setSaving(false)
    }
  }

  async function remove(substituteId: string) {
    if (!line) return
    const r = await fetch(`/api/bom-revisions/${line.bomRevisionId}/lines/${line.id}/substitutes/${substituteId}`, { method: 'DELETE' })
    if (r.ok) {
      toast.success('Substituto removido')
      onChanged()
    } else {
      toast.error('Erro ao remover substituto')
    }
  }

  return (
    <Dialog open={!!line} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Materiais Substitutos — {line?.material?.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {(line?.substitutes.length ?? 0) === 0 && <p className="text-sm text-muted-foreground">Nenhum substituto cadastrado.</p>}
          {line?.substitutes.map((s) => (
            <div key={s.id} className="flex items-center justify-between text-sm border rounded px-3 py-1.5 gap-2">
              <div>
                <span>{s.material.name}</span>
                {s.notes && <span className="text-xs text-muted-foreground"> — {s.notes}</span>}
              </div>
              {editable && (
                <Button variant="ghost" size="sm" className="text-destructive h-7 px-2" onClick={() => remove(s.id)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
          ))}
        </div>

        {editable && (
          <div className="space-y-3 border-t pt-3">
            <div className="space-y-1.5">
              <Label>Adicionar substituto</Label>
              <Select value={materialId} onValueChange={setMaterialId}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {materialsFull.filter((m) => m.id !== line?.materialId).map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Notas (opcional)</Label>
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex.: mesma bitola, fornecedor alternativo" />
            </div>
            <AsyncButton onClick={add} loading={saving} className="w-full">Adicionar</AsyncButton>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
