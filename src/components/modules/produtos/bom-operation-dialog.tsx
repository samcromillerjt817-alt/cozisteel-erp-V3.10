'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'
import { FormDialog } from '@/components/domain/form-dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { QuantityInput } from '@/components/form/quantity-input'
import { Textarea } from '@/components/ui/textarea'
import type { BomOperationRow, OperationTypeOption } from './bom-types'

interface BomOperationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  bomRevisionId: string
  operation: BomOperationRow | null
  operationTypes: OperationTypeOption[]
  onOperationTypesChanged: () => void
  onSaved: () => void
}

const EMPTY = { operationTypeId: '', description: '', setupTimeMinutes: 0, runTimeMinutesPerUnit: 0, workCenter: '', notes: '' }

export function BomOperationDialog({ open, onOpenChange, bomRevisionId, operation, operationTypes, onOperationTypesChanged, onSaved }: BomOperationDialogProps) {
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [newTypeName, setNewTypeName] = useState('')
  const [creatingType, setCreatingType] = useState(false)

  useEffect(() => {
    if (operation) {
      setForm({
        operationTypeId: operation.operationTypeId,
        description: operation.description,
        setupTimeMinutes: operation.setupTimeMinutes,
        runTimeMinutesPerUnit: operation.runTimeMinutesPerUnit,
        workCenter: operation.workCenter,
        notes: operation.notes,
      })
    } else {
      setForm(EMPTY)
    }
    setNewTypeName('')
  }, [operation, open])

  async function createOperationType() {
    if (!newTypeName.trim()) return
    setCreatingType(true)
    try {
      const r = await fetch('/api/operation-types', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newTypeName, description: '' }) })
      if (r.ok) {
        const created = await r.json()
        toast.success('Tipo de operação criado!')
        setNewTypeName('')
        onOperationTypesChanged()
        setForm((f) => ({ ...f, operationTypeId: created.id }))
      } else {
        const err = await r.json()
        toast.error(err.error || 'Erro ao criar tipo de operação')
      }
    } catch {
      toast.error('Erro ao criar tipo de operação')
    } finally {
      setCreatingType(false)
    }
  }

  async function save() {
    if (!form.operationTypeId) { toast.error('Selecione o tipo de operação'); return }
    setSaving(true)
    try {
      const url = operation ? `/api/bom-revisions/${bomRevisionId}/operations/${operation.id}` : `/api/bom-revisions/${bomRevisionId}/operations`
      const method = operation ? 'PUT' : 'POST'
      const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      if (r.ok) {
        toast.success(operation ? 'Operação atualizada!' : 'Operação adicionada!')
        onOpenChange(false)
        onSaved()
      } else {
        const err = await r.json()
        toast.error(err.error || 'Erro ao salvar operação')
      }
    } catch {
      toast.error('Erro ao salvar operação')
    } finally {
      setSaving(false)
    }
  }

  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title={operation ? 'Editar Operação' : 'Nova Operação'} onSave={save} saving={saving}>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>Tipo de operação</Label>
          <div className="flex gap-2">
            <Select value={form.operationTypeId} onValueChange={(v) => setForm((f) => ({ ...f, operationTypeId: v }))}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>{operationTypes.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Input placeholder="Ou crie um tipo novo (ex.: Solda, Corte)" value={newTypeName} onChange={(e) => setNewTypeName(e.target.value)} />
            <Button type="button" variant="outline" size="sm" onClick={createOperationType} disabled={creatingType || !newTypeName.trim()}>
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Descrição</Label>
          <Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5"><Label>Setup (min)</Label><QuantityInput value={form.setupTimeMinutes} onChange={(v) => setForm((f) => ({ ...f, setupTimeMinutes: v }))} /></div>
          <div className="space-y-1.5"><Label>Tempo/un (min)</Label><QuantityInput value={form.runTimeMinutesPerUnit} onChange={(v) => setForm((f) => ({ ...f, runTimeMinutesPerUnit: v }))} /></div>
        </div>

        <div className="space-y-1.5">
          <Label>Centro de trabalho</Label>
          <Input value={form.workCenter} onChange={(e) => setForm((f) => ({ ...f, workCenter: e.target.value }))} placeholder="Ex.: Corte a laser 1" />
        </div>

        <div className="space-y-1.5">
          <Label>Notas</Label>
          <Textarea rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
        </div>
      </div>
    </FormDialog>
  )
}
