'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { FormDialog } from '@/components/domain/form-dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { SearchableSelect } from '@/components/domain/searchable-select'
import { QuantityInput } from '@/components/form/quantity-input'
import { UnitSelect } from '@/components/form/unit-select'
import { PercentInput } from '@/components/form/percent-input'
import { Textarea } from '@/components/ui/textarea'
import type { BomLineRow } from './bom-types'

interface ProductOption { id: string; name: string; internalCode: string }

interface BomLineDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  bomRevisionId: string
  productId: string
  line: BomLineRow | null
  materialsFull: { id: string; name: string }[]
  onSaved: () => void
}

const EMPTY = { lineType: 'material' as 'material' | 'component', materialId: '', componentProductId: '', componentProductLabel: '', quantity: 1, unit: 'KG', scrapPct: 0, notes: '' }

export function BomLineDialog({ open, onOpenChange, bomRevisionId, productId, line, materialsFull, onSaved }: BomLineDialogProps) {
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (line) {
      setForm({
        lineType: line.lineType,
        materialId: line.materialId || '',
        componentProductId: line.componentProductId || '',
        componentProductLabel: line.componentProduct?.name || '',
        quantity: line.quantity,
        unit: line.unit,
        scrapPct: line.scrapPct,
        notes: line.notes,
      })
    } else {
      setForm(EMPTY)
    }
  }, [line, open])

  async function save() {
    if (form.lineType === 'material' && !form.materialId) { toast.error('Selecione a matéria-prima'); return }
    if (form.lineType === 'component' && !form.componentProductId) { toast.error('Selecione o produto componente'); return }

    setSaving(true)
    try {
      const url = line ? `/api/bom-revisions/${bomRevisionId}/lines/${line.id}` : `/api/bom-revisions/${bomRevisionId}/lines`
      const method = line ? 'PUT' : 'POST'
      const r = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lineType: form.lineType,
          materialId: form.lineType === 'material' ? form.materialId : null,
          componentProductId: form.lineType === 'component' ? form.componentProductId : null,
          quantity: form.quantity, unit: form.unit, scrapPct: form.scrapPct, order: 0, notes: form.notes,
        }),
      })
      if (r.ok) {
        toast.success(line ? 'Linha atualizada!' : 'Linha adicionada!')
        onOpenChange(false)
        onSaved()
      } else {
        const err = await r.json()
        toast.error(err.error || 'Erro ao salvar linha')
      }
    } catch {
      toast.error('Erro ao salvar linha')
    } finally {
      setSaving(false)
    }
  }

  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title={line ? 'Editar Linha' : 'Nova Linha'} onSave={save} saving={saving}>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>Tipo</Label>
          <Select value={form.lineType} onValueChange={(v) => setForm((f) => ({ ...f, lineType: v as 'material' | 'component' }))}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="material">Matéria-prima</SelectItem>
              <SelectItem value="component">Componente (subconjunto)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {form.lineType === 'material' ? (
          <div className="space-y-1.5">
            <Label>Matéria-prima</Label>
            <Select value={form.materialId} onValueChange={(v) => setForm((f) => ({ ...f, materialId: v }))}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>{materialsFull.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label>Produto componente</Label>
            <SearchableSelect<ProductOption>
              value={form.componentProductId}
              label={form.componentProductLabel}
              placeholder="Buscar produto..."
              searchUrl={(q) => `/api/products?search=${encodeURIComponent(q)}&limit=20`}
              parseResults={(json) => ((json as { data: ProductOption[] }).data || []).filter((p) => p.id !== productId).map((p) => ({ id: p.id, label: p.name, data: p }))}
              onSelect={(hit) => setForm((f) => ({ ...f, componentProductId: hit.id, componentProductLabel: hit.label }))}
            />
          </div>
        )}

        <div className="grid grid-cols-3 gap-2">
          <div className="space-y-1.5"><Label>Quantidade</Label><QuantityInput value={form.quantity} onChange={(v) => setForm((f) => ({ ...f, quantity: v }))} /></div>
          <div className="space-y-1.5"><Label>Unidade</Label><UnitSelect value={form.unit} onChange={(v) => setForm((f) => ({ ...f, unit: v }))} /></div>
          <div className="space-y-1.5"><Label>% Perda</Label><PercentInput value={form.scrapPct} onChange={(v) => setForm((f) => ({ ...f, scrapPct: v }))} /></div>
        </div>

        <div className="space-y-1.5">
          <Label>Notas</Label>
          <Textarea rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
        </div>
      </div>
    </FormDialog>
  )
}
