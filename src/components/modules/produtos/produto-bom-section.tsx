'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Plus, Eye, ArrowRightLeft, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { StatusBadge } from '@/components/domain/status-badge'
import { FormDialog } from '@/components/domain/form-dialog'
import { useConfirm } from '@/components/domain/confirm-dialog'
import { DataTable, type DataTableColumn } from '@/components/platform/data-table'
import { BomRevisionEditor } from './bom-revision-editor'
import { BomCompareDialog } from './bom-compare-dialog'
import { BOM_STATUS_LABELS, BOM_STATUS_TRANSITIONS, type BomRevisionRow } from './bom-types'

interface ProdutoBomSectionProps {
  productId: string
  materialsFull: { id: string; name: string }[]
}

/**
 * ADR-023 (item 4, "completar a BOM formal") — primeira tela do motor de engenharia (BomRevision/
 * BomLine/ProductOperation, Fase 4/ADR-005): existia service e testes desde então, zero rota/UI.
 * Drill-down leve dentro do `FormDialog` de edição de produto, mesmo tratamento de Imagens/
 * Matérias-primas (receita simples) já usado nesta tela.
 */
export function ProdutoBomSection({ productId, materialsFull }: ProdutoBomSectionProps) {
  const confirmAction = useConfirm()
  const [revisions, setRevisions] = useState<BomRevisionRow[]>([])
  const [loading, setLoading] = useState(true)

  const [newDialogOpen, setNewDialogOpen] = useState(false)
  const [newCode, setNewCode] = useState('')
  const [newNotes, setNewNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const [statusTarget, setStatusTarget] = useState<{ revision: BomRevisionRow; status: string } | null>(null)
  const [statusReason, setStatusReason] = useState('')
  const [changingStatus, setChangingStatus] = useState(false)

  const [editingRevision, setEditingRevision] = useState<BomRevisionRow | null>(null)
  const [comparingRevision, setComparingRevision] = useState<BomRevisionRow | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/products/${productId}/bom-revisions`)
      setRevisions(r.ok ? await r.json() : [])
    } catch {
      setRevisions([])
    } finally {
      setLoading(false)
    }
  }, [productId])

  useEffect(() => {
    load()
  }, [load])

  async function createRevision() {
    if (!newCode.trim()) { toast.error('Informe o código da revisão'); return }
    setSaving(true)
    try {
      const r = await fetch(`/api/products/${productId}/bom-revisions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revisionCode: newCode, notes: newNotes }),
      })
      if (r.ok) {
        toast.success('Revisão criada!')
        setNewDialogOpen(false)
        setNewCode('')
        setNewNotes('')
        load()
      } else {
        const err = await r.json()
        toast.error(err.error || 'Erro ao criar revisão')
      }
    } catch {
      toast.error('Erro ao criar revisão')
    } finally {
      setSaving(false)
    }
  }

  async function changeStatus() {
    if (!statusTarget) return
    setChangingStatus(true)
    try {
      const r = await fetch(`/api/bom-revisions/${statusTarget.revision.id}/status`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: statusTarget.status, reason: statusReason }),
      })
      if (r.ok) {
        toast.success('Status atualizado!')
        setStatusTarget(null)
        setStatusReason('')
        load()
      } else {
        const err = await r.json()
        toast.error(err.error || 'Erro ao mudar status')
      }
    } catch {
      toast.error('Erro ao mudar status')
    } finally {
      setChangingStatus(false)
    }
  }

  async function removeRevision(revision: BomRevisionRow) {
    if (!(await confirmAction('Excluir esta revisão em rascunho?'))) return
    const r = await fetch(`/api/bom-revisions/${revision.id}`, { method: 'DELETE' })
    if (r.ok) { toast.success('Revisão excluída'); load() } else { toast.error('Erro ao excluir revisão') }
  }

  const columns: DataTableColumn<BomRevisionRow>[] = [
    { id: 'revisionCode', header: 'Revisão', cell: (r) => <span className="font-mono font-medium">{r.revisionCode}</span> },
    { id: 'status', header: 'Status', cell: (r) => <StatusBadge domain="bom" status={r.status} label={BOM_STATUS_LABELS[r.status] || r.status} /> },
    { id: 'lines', header: 'Linhas', align: 'right', cell: (r) => r._count?.lines ?? 0 },
    { id: 'createdBy', header: 'Criada por', cell: (r) => r.createdBy?.name || '-', hideBelow: 'md' },
    { id: 'releasedAt', header: 'Liberada em', cell: (r) => (r.releasedAt ? new Date(r.releasedAt).toLocaleDateString('pt-BR') : '-'), hideBelow: 'md' },
  ]

  return (
    <div className="border-t pt-4 mt-2 space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-semibold">Engenharia (BOM formal)</Label>
        <Button size="sm" variant="outline" onClick={() => setNewDialogOpen(true)}><Plus className="w-3.5 h-3.5" /> Nova Revisão</Button>
      </div>

      <DataTable
        columns={columns}
        rows={revisions}
        getRowId={(r) => r.id}
        loading={loading}
        emptyMessage="Nenhuma revisão de engenharia cadastrada ainda."
        rowActions={[
          { label: 'Ver / Editar Estrutura', icon: <Eye />, onClick: (r) => setEditingRevision(r), primary: true },
          { label: 'Comparar com outra revisão', icon: <ArrowRightLeft />, onClick: (r) => setComparingRevision(r), disabled: () => revisions.length < 2 },
          ...(['pending_approval', 'released', 'draft', 'obsolete'] as const).map((targetStatus) => ({
            label: `Mudar para "${BOM_STATUS_LABELS[targetStatus]}"`,
            icon: <ArrowRightLeft />,
            onClick: (r: BomRevisionRow) => { setStatusTarget({ revision: r, status: targetStatus }); setStatusReason('') },
            disabled: (r: BomRevisionRow) => !BOM_STATUS_TRANSITIONS[r.status]?.includes(targetStatus),
          })),
          { label: 'Excluir', icon: <Trash2 />, variant: 'destructive' as const, onClick: (r) => removeRevision(r), disabled: (r) => r.status !== 'draft' },
        ]}
      />

      <FormDialog open={newDialogOpen} onOpenChange={setNewDialogOpen} title="Nova Revisão de Engenharia" onSave={createRevision} saving={saving}>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Código da revisão</Label>
            <Input value={newCode} onChange={(e) => setNewCode(e.target.value)} placeholder="Ex.: A, B, 01" />
          </div>
          <div className="space-y-1.5">
            <Label>Notas</Label>
            <Textarea rows={3} value={newNotes} onChange={(e) => setNewNotes(e.target.value)} />
          </div>
        </div>
      </FormDialog>

      <FormDialog
        open={!!statusTarget}
        onOpenChange={(open) => { if (!open) setStatusTarget(null) }}
        title={`Mudar status para "${BOM_STATUS_LABELS[statusTarget?.status ?? ''] || ''}"`}
        onSave={changeStatus}
        saving={changingStatus}
      >
        <div className="space-y-1.5">
          <Label>Motivo (opcional)</Label>
          <Textarea rows={3} value={statusReason} onChange={(e) => setStatusReason(e.target.value)} placeholder="Ex.: estrutura validada com o cliente" />
        </div>
      </FormDialog>

      <BomRevisionEditor
        revision={editingRevision}
        onOpenChange={(open) => { if (!open) setEditingRevision(null); load() }}
        productId={productId}
        materialsFull={materialsFull}
        onChanged={load}
      />

      <BomCompareDialog
        open={!!comparingRevision}
        onOpenChange={(open) => { if (!open) setComparingRevision(null) }}
        fromRevision={comparingRevision}
        otherRevisions={revisions}
      />
    </div>
  )
}
