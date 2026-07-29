'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { PageHeader } from '@/components/platform/page-header'
import { DataTable, type DataTableColumn } from '@/components/platform/data-table'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { CurrencyInput } from '@/components/form/currency-input'
import { QuantityInput } from '@/components/form/quantity-input'
import { Textarea } from '@/components/ui/textarea'
import { FormDialog } from '@/components/domain/form-dialog'
import { useConfirm } from '@/components/domain/confirm-dialog'

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  quote: 'Orçamento', requisition: 'Requisição', purchase_order: 'Pedido de Compra',
}

const ROLE_OPTIONS = ['admin', 'manager', 'user', 'viewer', 'comercial', 'producao', 'compras', 'estoque', 'financeiro']

interface ApprovalRuleRow {
  id: string
  documentType: string
  minValue: number | null
  maxValue: number | null
  approverRole: string | null
  requiredApprovals: number
  allowSelfApproval: boolean
  order: number
  active: boolean
  notes: string
}

const EMPTY_FORM = {
  documentType: 'quote', minValue: 0, hasMax: false, maxValue: 0, approverRole: '', requiredApprovals: 1,
  allowSelfApproval: true, order: 0, active: true, notes: '',
}

/**
 * ADR-023 (item 5, Decisão #4) — motor de alçada genuinamente configurável. Enquanto nenhuma regra
 * existir para um tipo de documento, uma política implícita em `approval.service.ts` preserva o
 * comportamento de antes desta mudança (1 aprovação, sem faixa de valor, autoaprovação permitida) —
 * esta tela é onde as regras REAIS entram quando a empresa definir os valores de corte.
 */
export function AlcadasTab() {
  const confirmAction = useConfirm()
  const [rows, setRows] = useState<ApprovalRuleRow[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/approval-rules')
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

  function openNew() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setDialogOpen(true)
  }

  function openEdit(rule: ApprovalRuleRow) {
    setEditingId(rule.id)
    setForm({
      documentType: rule.documentType,
      minValue: rule.minValue ?? 0,
      hasMax: rule.maxValue != null,
      maxValue: rule.maxValue ?? 0,
      approverRole: rule.approverRole ?? '',
      requiredApprovals: rule.requiredApprovals,
      allowSelfApproval: rule.allowSelfApproval,
      order: rule.order,
      active: rule.active,
      notes: rule.notes,
    })
    setDialogOpen(true)
  }

  async function save() {
    setSaving(true)
    try {
      const body = {
        documentType: form.documentType,
        minValue: form.minValue > 0 ? form.minValue : null,
        maxValue: form.hasMax ? form.maxValue : null,
        approverRole: form.approverRole || null,
        requiredApprovals: form.requiredApprovals,
        allowSelfApproval: form.allowSelfApproval,
        order: form.order,
        active: form.active,
        notes: form.notes,
      }
      const url = editingId ? `/api/approval-rules/${editingId}` : '/api/approval-rules'
      const method = editingId ? 'PUT' : 'POST'
      const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (r.ok) {
        toast.success(editingId ? 'Regra atualizada!' : 'Regra criada!')
        setDialogOpen(false)
        load()
      } else {
        const err = await r.json()
        toast.error(err.error || 'Erro ao salvar regra')
      }
    } catch {
      toast.error('Erro ao salvar regra')
    } finally {
      setSaving(false)
    }
  }

  async function remove(rule: ApprovalRuleRow) {
    if (!(await confirmAction(`Excluir esta regra de alçada de ${DOCUMENT_TYPE_LABELS[rule.documentType]}?`))) return
    const r = await fetch(`/api/approval-rules/${rule.id}`, { method: 'DELETE' })
    if (r.ok) { toast.success('Regra excluída'); load() } else { toast.error('Erro ao excluir regra') }
  }

  const columns: DataTableColumn<ApprovalRuleRow>[] = [
    { id: 'documentType', header: 'Documento', cell: (r) => DOCUMENT_TYPE_LABELS[r.documentType] || r.documentType },
    {
      id: 'range', header: 'Faixa de valor',
      cell: (r) => (r.minValue == null && r.maxValue == null ? 'Qualquer valor' : `${r.minValue != null ? `≥ ${r.minValue}` : ''}${r.minValue != null && r.maxValue != null ? ' e ' : ''}${r.maxValue != null ? `≤ ${r.maxValue}` : ''}`),
    },
    { id: 'approverRole', header: 'Perfil aprovador', cell: (r) => r.approverRole || 'Qualquer perfil' },
    { id: 'requiredApprovals', header: 'Aprovações', align: 'right', cell: (r) => r.requiredApprovals },
    { id: 'allowSelfApproval', header: 'Autoaprovação', cell: (r) => (r.allowSelfApproval ? 'Permitida' : 'Bloqueada') },
    { id: 'active', header: 'Status', cell: (r) => <Badge variant={r.active ? 'default' : 'outline'}>{r.active ? 'Ativa' : 'Inativa'}</Badge> },
  ]

  return (
    <div className="space-y-4">
      <PageHeader
        title="Alçadas de Aprovação"
        description='Regras configuráveis de aprovação por documento, faixa de valor e perfil (ADR-023). Enquanto nenhuma regra existir para um tipo de documento, vale a política padrão: 1 aprovação, qualquer aprovador, autoaprovação permitida.'
        actions={<Button onClick={openNew}><Plus className="w-4 h-4" /> Nova Regra</Button>}
      />

      <DataTable
        columns={columns}
        rows={rows}
        getRowId={(r) => r.id}
        loading={loading}
        emptyMessage="Nenhuma regra cadastrada — a política padrão está em vigor para todos os documentos."
        rowActions={[
          { label: 'Editar', icon: <Pencil />, onClick: openEdit, primary: true },
          { label: 'Excluir', icon: <Trash2 />, variant: 'destructive', onClick: remove },
        ]}
      />

      <FormDialog open={dialogOpen} onOpenChange={setDialogOpen} title={editingId ? 'Editar Regra de Alçada' : 'Nova Regra de Alçada'} onSave={save} saving={saving} maxWidth="sm:max-w-xl">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Tipo de documento</Label>
            <Select value={form.documentType} onValueChange={(v) => setForm((f) => ({ ...f, documentType: v }))}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(DOCUMENT_TYPE_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Valor mínimo (0 = sem piso)</Label>
              <CurrencyInput value={form.minValue} onChange={(v) => setForm((f) => ({ ...f, minValue: v }))} />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Valor máximo</Label>
                <div className="flex items-center gap-1.5">
                  <Switch checked={!form.hasMax} onCheckedChange={(v) => setForm((f) => ({ ...f, hasMax: !v }))} />
                  <span className="text-xs text-muted-foreground">Sem teto</span>
                </div>
              </div>
              <CurrencyInput value={form.maxValue} onChange={(v) => setForm((f) => ({ ...f, maxValue: v }))} disabled={!form.hasMax} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Perfil aprovador exigido</Label>
            <Select value={form.approverRole || '__any__'} onValueChange={(v) => setForm((f) => ({ ...f, approverRole: v === '__any__' ? '' : v }))}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__any__">Qualquer perfil com permissão do módulo</SelectItem>
                {ROLE_OPTIONS.map((role) => <SelectItem key={role} value={role}>{role}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Aprovações necessárias</Label>
              <QuantityInput value={form.requiredApprovals} onChange={(v) => setForm((f) => ({ ...f, requiredApprovals: Math.max(1, Math.round(v)) }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Ordem entre regras concorrentes</Label>
              <QuantityInput value={form.order} onChange={(v) => setForm((f) => ({ ...f, order: Math.max(0, Math.round(v)) }))} />
            </div>
          </div>

          <div className="flex items-center justify-between border rounded-md px-3 py-2">
            <Label className="text-sm font-normal">Permitir autoaprovação (quem criou o documento pode aprovar)</Label>
            <Switch checked={form.allowSelfApproval} onCheckedChange={(v) => setForm((f) => ({ ...f, allowSelfApproval: v }))} />
          </div>

          <div className="flex items-center justify-between border rounded-md px-3 py-2">
            <Label className="text-sm font-normal">Regra ativa</Label>
            <Switch checked={form.active} onCheckedChange={(v) => setForm((f) => ({ ...f, active: v }))} />
          </div>

          <div className="space-y-1.5">
            <Label>Notas</Label>
            <Textarea rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </div>
        </div>
      </FormDialog>
    </div>
  )
}
