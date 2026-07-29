'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, ListTree } from 'lucide-react'
import { DetailDrawer } from '@/components/platform/detail-drawer'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { StatusBadge } from '@/components/domain/status-badge'
import { StatusTimeline } from '@/components/domain/status-timeline'
import { useConfirm } from '@/components/domain/confirm-dialog'
import { BomLineDialog } from './bom-line-dialog'
import { BomOperationDialog } from './bom-operation-dialog'
import { BomSubstitutesDialog } from './bom-substitutes-dialog'
import { BOM_STATUS_LABELS, type BomRevisionRow, type BomRevisionDetail, type BomLineRow, type BomOperationRow, type OperationTypeOption } from './bom-types'

interface BomRevisionEditorProps {
  revision: BomRevisionRow | null
  onOpenChange: (open: boolean) => void
  productId: string
  materialsFull: { id: string; name: string }[]
  onChanged: () => void
}

/** ADR-023 (item 4) — detalhe de uma BomRevision: linhas (matéria-prima/componente), operações,
 * histórico de status. Editável só enquanto `draft` (mesma trava do backend, `assertDraft`). */
export function BomRevisionEditor({ revision, onOpenChange, productId, materialsFull, onChanged }: BomRevisionEditorProps) {
  const confirmAction = useConfirm()
  const [detail, setDetail] = useState<BomRevisionDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [operationTypes, setOperationTypes] = useState<OperationTypeOption[]>([])

  const [lineDialogOpen, setLineDialogOpen] = useState(false)
  const [editingLine, setEditingLine] = useState<BomLineRow | null>(null)
  const [substitutesLineId, setSubstitutesLineId] = useState<string | null>(null)
  const substitutesLine = detail?.lines.find((l) => l.id === substitutesLineId) || null

  const [operationDialogOpen, setOperationDialogOpen] = useState(false)
  const [editingOperation, setEditingOperation] = useState<BomOperationRow | null>(null)

  const editable = detail?.status === 'draft'

  const load = useCallback(async () => {
    if (!revision) return
    setLoading(true)
    try {
      const r = await fetch(`/api/bom-revisions/${revision.id}`)
      setDetail(r.ok ? await r.json() : null)
    } catch {
      setDetail(null)
    } finally {
      setLoading(false)
    }
  }, [revision])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!revision) return
    fetch('/api/operation-types').then((r) => (r.ok ? r.json() : [])).then(setOperationTypes).catch(() => {})
  }, [revision])

  function refreshAll() {
    load()
    onChanged()
  }

  async function removeLine(line: BomLineRow) {
    if (!revision) return
    if (!(await confirmAction('Remover esta linha da estrutura?'))) return
    const r = await fetch(`/api/bom-revisions/${revision.id}/lines/${line.id}`, { method: 'DELETE' })
    if (r.ok) { toast.success('Linha removida'); refreshAll() } else { toast.error('Erro ao remover linha') }
  }

  async function removeOperation(op: BomOperationRow) {
    if (!revision) return
    if (!(await confirmAction('Remover esta operação?'))) return
    const r = await fetch(`/api/bom-revisions/${revision.id}/operations/${op.id}`, { method: 'DELETE' })
    if (r.ok) { toast.success('Operação removida'); refreshAll() } else { toast.error('Erro ao remover operação') }
  }

  return (
    <>
      <DetailDrawer
        open={!!revision}
        onOpenChange={onOpenChange}
        title={`Revisão ${revision?.revisionCode || ''}`}
        description={detail ? `Criada por ${detail.createdBy?.name || '-'}` : undefined}
      >
        {loading || !detail ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center gap-2">
              <StatusBadge domain="bom" status={detail.status} label={BOM_STATUS_LABELS[detail.status] || detail.status} />
              {detail.effectiveFrom && <span className="text-xs text-muted-foreground">Vigente desde {new Date(detail.effectiveFrom).toLocaleDateString('pt-BR')}</span>}
            </div>
            {detail.notes && <p className="text-sm text-muted-foreground">{detail.notes}</p>}

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Estrutura (materiais e componentes)</Label>
                {editable && <Button size="sm" variant="outline" onClick={() => { setEditingLine(null); setLineDialogOpen(true) }}><Plus className="w-3.5 h-3.5" /> Linha</Button>}
              </div>
              {detail.lines.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhuma linha cadastrada.</p>
              ) : (
                <div className="space-y-1.5">
                  {detail.lines.map((l) => (
                    <div key={l.id} className="flex items-center justify-between text-sm border rounded px-3 py-1.5 gap-2">
                      <div>
                        <span>{l.material?.name || l.componentProduct?.name}</span>
                        <span className="text-xs text-muted-foreground"> — {l.quantity} {l.unit}{l.scrapPct > 0 ? ` (+${l.scrapPct}% perda)` : ''}</span>
                        {l.substitutes.length > 0 && <span className="text-xs text-muted-foreground"> · {l.substitutes.length} substituto(s)</span>}
                      </div>
                      <div className="flex items-center gap-1">
                        {l.lineType === 'material' && (
                          <Button variant="ghost" size="icon" className="h-7 w-7" title="Materiais substitutos" onClick={() => setSubstitutesLineId(l.id)}>
                            <ListTree className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        {editable && (
                          <>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingLine(l); setLineDialogOpen(true) }}><Pencil className="w-3.5 h-3.5" /></Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeLine(l)}><Trash2 className="w-3.5 h-3.5" /></Button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Operações (roteiro de fabricação)</Label>
                {editable && <Button size="sm" variant="outline" onClick={() => { setEditingOperation(null); setOperationDialogOpen(true) }}><Plus className="w-3.5 h-3.5" /> Operação</Button>}
              </div>
              {detail.operations.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhuma operação cadastrada.</p>
              ) : (
                <div className="space-y-1.5">
                  {detail.operations.map((op) => (
                    <div key={op.id} className="flex items-center justify-between text-sm border rounded px-3 py-1.5 gap-2">
                      <div>
                        <span>{op.sequenceOrder} — {op.operationType.name}</span>
                        <span className="text-xs text-muted-foreground"> — setup {op.setupTimeMinutes}min, {op.runTimeMinutesPerUnit}min/un{op.workCenter ? `, ${op.workCenter}` : ''}</span>
                      </div>
                      {editable && (
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingOperation(op); setOperationDialogOpen(true) }}><Pencil className="w-3.5 h-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeOperation(op)}><Trash2 className="w-3.5 h-3.5" /></Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-semibold">Histórico de status</Label>
              <StatusTimeline entityType="bom_revision" entityId={detail.id} domain="bom" labels={BOM_STATUS_LABELS} />
            </div>
          </div>
        )}
      </DetailDrawer>

      {revision && (
        <BomLineDialog
          open={lineDialogOpen}
          onOpenChange={setLineDialogOpen}
          bomRevisionId={revision.id}
          productId={productId}
          line={editingLine}
          materialsFull={materialsFull}
          onSaved={refreshAll}
        />
      )}

      {revision && (
        <BomOperationDialog
          open={operationDialogOpen}
          onOpenChange={setOperationDialogOpen}
          bomRevisionId={revision.id}
          operation={editingOperation}
          operationTypes={operationTypes}
          onOperationTypesChanged={() => fetch('/api/operation-types').then((r) => (r.ok ? r.json() : [])).then(setOperationTypes).catch(() => {})}
          onSaved={refreshAll}
        />
      )}

      <BomSubstitutesDialog
        line={substitutesLine}
        onOpenChange={(open) => { if (!open) setSubstitutesLineId(null) }}
        materialsFull={materialsFull}
        editable={!!editable}
        onChanged={load}
      />
    </>
  )
}
