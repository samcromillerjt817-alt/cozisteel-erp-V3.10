'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Lock, LockOpen } from 'lucide-react'
import { PageHeader } from '@/components/platform/page-header'
import { DataTable, type DataTableColumn } from '@/components/platform/data-table'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { FormDialog } from '@/components/domain/form-dialog'

interface PeriodClosingRow {
  id: string
  period: string
  status: string
  closedAt: string
  notes: string
  closedBy: { id: string; name: string } | null
  reopenedAt: string | null
  reopenedBy: { id: string; name: string } | null
}

function currentPeriod(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

/**
 * ADR-023 (item 6, Decisão #5) — Fechamento Mensal por competência: bloqueia inclusão, alteração,
 * cancelamento e baixa retroativa de Contas a Pagar/Receber cuja competência caia dentro do período
 * fechado. O Fluxo de Caixa continua usando vencimento/pagamento normalmente — competência é um
 * conceito contábil à parte, não substitui a visão de caixa.
 */
export function FechamentosTab() {
  const [rows, setRows] = useState<PeriodClosingRow[]>([])
  const [loading, setLoading] = useState(true)

  const [closeDialogOpen, setCloseDialogOpen] = useState(false)
  const [closePeriod, setClosePeriod] = useState(currentPeriod())
  const [closeNotes, setCloseNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const [reopenTarget, setReopenTarget] = useState<PeriodClosingRow | null>(null)
  const [reopenReason, setReopenReason] = useState('')
  const [reopenSaving, setReopenSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/financeiro/fechamentos')
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

  async function closePeriodAction() {
    setSaving(true)
    try {
      const r = await fetch('/api/financeiro/fechamentos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ period: closePeriod, notes: closeNotes }),
      })
      if (r.ok) {
        toast.success(`Competência ${closePeriod} fechada!`)
        setCloseDialogOpen(false)
        setCloseNotes('')
        load()
      } else {
        const err = await r.json()
        toast.error(err.error || 'Erro ao fechar competência')
      }
    } catch {
      toast.error('Erro ao fechar competência')
    } finally {
      setSaving(false)
    }
  }

  async function reopenAction() {
    if (!reopenTarget) return
    if (!reopenReason.trim()) { toast.error('Informe o motivo da reabertura'); return }
    setReopenSaving(true)
    try {
      const r = await fetch(`/api/financeiro/fechamentos/${reopenTarget.period}/reabrir`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: reopenReason }),
      })
      if (r.ok) {
        toast.success(`Competência ${reopenTarget.period} reaberta!`)
        setReopenTarget(null)
        setReopenReason('')
        load()
      } else {
        const err = await r.json()
        toast.error(err.error || 'Erro ao reabrir competência')
      }
    } catch {
      toast.error('Erro ao reabrir competência')
    } finally {
      setReopenSaving(false)
    }
  }

  const columns: DataTableColumn<PeriodClosingRow>[] = [
    { id: 'period', header: 'Competência', cell: (r) => <span className="font-mono font-medium">{r.period}</span> },
    { id: 'status', header: 'Status', cell: (r) => <Badge variant={r.status === 'closed' ? 'default' : 'outline'}>{r.status === 'closed' ? 'Fechada' : 'Reaberta'}</Badge> },
    { id: 'closedAt', header: 'Fechada em', cell: (r) => `${new Date(r.closedAt).toLocaleDateString('pt-BR')} · ${r.closedBy?.name || '-'}`, hideBelow: 'md' },
    { id: 'reopenedAt', header: 'Reaberta em', cell: (r) => (r.reopenedAt ? `${new Date(r.reopenedAt).toLocaleDateString('pt-BR')} · ${r.reopenedBy?.name || '-'}` : '-'), hideBelow: 'md' },
  ]

  return (
    <div className="space-y-4">
      <PageHeader
        title="Fechamento Mensal"
        description="Trava por competência — bloqueia inclusões, alterações, cancelamentos e baixas retroativas de Contas a Pagar/Receber dentro do período fechado. Não afeta vencimento/pagamento nem o Fluxo de Caixa."
        actions={<Button onClick={() => setCloseDialogOpen(true)}><Lock className="w-4 h-4" /> Fechar Competência</Button>}
      />

      <DataTable
        columns={columns}
        rows={rows}
        getRowId={(r) => r.id}
        loading={loading}
        emptyMessage="Nenhuma competência fechada ainda."
        rowActions={[
          { label: 'Reabrir', icon: <LockOpen />, onClick: (r) => { setReopenTarget(r); setReopenReason('') }, disabled: (r) => r.status !== 'closed' },
        ]}
      />

      <FormDialog open={closeDialogOpen} onOpenChange={setCloseDialogOpen} title="Fechar Competência" onSave={closePeriodAction} saving={saving}>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Competência (AAAA-MM)</Label>
            <Input value={closePeriod} onChange={(e) => setClosePeriod(e.target.value)} placeholder="2026-07" />
          </div>
          <div className="space-y-1.5">
            <Label>Notas</Label>
            <Textarea rows={3} value={closeNotes} onChange={(e) => setCloseNotes(e.target.value)} />
          </div>
        </div>
      </FormDialog>

      <FormDialog
        open={!!reopenTarget}
        onOpenChange={(open) => { if (!open) setReopenTarget(null) }}
        title={`Reabrir Competência ${reopenTarget?.period || ''}`}
        onSave={reopenAction}
        saving={reopenSaving}
      >
        <div className="space-y-1.5">
          <Label>Motivo da reabertura (obrigatório)</Label>
          <Textarea rows={3} value={reopenReason} onChange={(e) => setReopenReason(e.target.value)} placeholder="Ex.: lançamento retroativo autorizado pela diretoria" />
        </div>
      </FormDialog>
    </div>
  )
}
