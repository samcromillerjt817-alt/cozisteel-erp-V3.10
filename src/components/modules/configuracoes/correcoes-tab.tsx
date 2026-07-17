'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { AsyncButton } from '@/components/domain/async-button'
import { useConfirm } from '@/components/domain/confirm-dialog'
import { PageHeader } from '@/components/platform/page-header'
import { formatCurrency } from '@/lib/format'
import type { StuckPatchInfo, OrphanedBackup, ProductBatchCostSnapshot } from './types'

/**
 * Aba "Correções" de Configurações (ADR-021, Subetapa 4) — biblioteca de receitas curadas: a metade
 * "com escrita" da postura híbrida (Parte 3, opção "c"). Cada receita tem seu próprio fluxo de
 * pré-visualização + confirmação — nunca aplica direto sem o admin ver o que vai mudar primeiro.
 */
export function CorrecoesTab() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Correções"
        description="Operações curadas de manutenção e recuperação — cada uma pede confirmação e fica registrada em Auditoria."
      />
      <UnstickPatchStatusCard />
      <ReconcilePatchLogCard />
      <RecalculateBatchCostCard />
    </div>
  )
}

// ── Receita 1: destravar status de patch preso ──────────────────────────

function UnstickPatchStatusCard() {
  const confirmAction = useConfirm()
  const [checking, setChecking] = useState(false)
  const [applying, setApplying] = useState(false)
  const [info, setInfo] = useState<StuckPatchInfo | null>(null)

  async function check() {
    setChecking(true)
    try {
      const r = await fetch('/api/admin/recipes/unstick-patch-status/preview', { method: 'POST' })
      const json = await r.json()
      if (r.ok) setInfo(json)
      else toast.error(json.error || 'Erro ao verificar status')
    } catch {
      toast.error('Erro ao verificar status')
    } finally {
      setChecking(false)
    }
  }

  async function apply() {
    if (!(await confirmAction('Destravar o status de atualização preso? Isso marca a atualização travada como "falhou" — use só se tiver certeza de que nenhum processo real está em andamento.'))) return
    setApplying(true)
    try {
      const r = await fetch('/api/admin/recipes/unstick-patch-status/apply', { method: 'POST' })
      const json = await r.json()
      if (r.ok) {
        toast.success('Status destravado')
        setInfo({ stuck: false })
      } else {
        toast.error(json.error || 'Erro ao aplicar correção')
      }
    } catch {
      toast.error('Erro ao aplicar correção')
    } finally {
      setApplying(false)
    }
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Destravar status de atualização preso</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Corrige <code>storage/patches/status.json</code> quando fica preso num estado não-terminal
          porque o processo que o escreveu já não está mais rodando.
        </p>
        <AsyncButton variant="outline" onClick={check} loading={checking}>Verificar status</AsyncButton>
        {info && (
          <div className="rounded border p-3 text-sm space-y-2">
            <Badge variant={info.stuck ? 'destructive' : 'outline'}>{info.stuck ? 'Travado' : 'OK'}</Badge>
            {info.stuck && (
              <>
                <p>Estado: <span className="font-medium">{info.state}</span> — há {info.ageMinutes} min ({info.pid ? `PID ${info.pid}, ` : ''}processo {info.processAlive ? 'vivo' : 'não encontrado'})</p>
                <AsyncButton onClick={apply} loading={applying}>Corrigir agora</AsyncButton>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ── Receita 2: reconstruir PatchLog ausente ─────────────────────────────

function ReconcilePatchLogCard() {
  const confirmAction = useConfirm()
  const [searching, setSearching] = useState(false)
  const [applyingId, setApplyingId] = useState<string | null>(null)
  const [orphans, setOrphans] = useState<OrphanedBackup[] | null>(null)

  async function search() {
    setSearching(true)
    try {
      const r = await fetch('/api/admin/recipes/reconcile-patch-log/preview', { method: 'POST' })
      const json = await r.json()
      if (r.ok) setOrphans(json)
      else toast.error(json.error || 'Erro ao buscar backups órfãos')
    } catch {
      toast.error('Erro ao buscar backups órfãos')
    } finally {
      setSearching(false)
    }
  }

  async function reconcile(backupTar: string) {
    if (!(await confirmAction(`Reconstruir o registro de atualização a partir de "${backupTar}"? Isso cria uma linha em Histórico de Atualizações marcada como revertida.`))) return
    setApplyingId(backupTar)
    try {
      const r = await fetch('/api/admin/recipes/reconcile-patch-log/apply', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ backupTar }),
      })
      const json = await r.json()
      if (r.ok) {
        toast.success('Registro reconstruído')
        setOrphans((prev) => prev?.filter((o) => o.backupTar !== backupTar) ?? null)
      } else {
        toast.error(json.error || 'Erro ao reconciliar')
      }
    } catch {
      toast.error('Erro ao reconciliar')
    } finally {
      setApplyingId(null)
    }
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Reconstruir registro de atualização ausente</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Lista backups de patch em disco sem registro correspondente em Histórico de Atualizações
          (ex.: um rollback que falhou ao se registrar).
        </p>
        <AsyncButton variant="outline" onClick={search} loading={searching}>Buscar backups órfãos</AsyncButton>
        {orphans && (
          orphans.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum backup órfão encontrado.</p>
          ) : (
            <div className="space-y-2">
              {orphans.map((o) => (
                <div key={o.backupTar} className="flex flex-wrap items-center justify-between gap-2 rounded border p-3 text-sm">
                  <div>
                    <p className="font-mono">{o.backupTar}</p>
                    <p className="text-muted-foreground">{new Date(o.timestamp).toLocaleString('pt-BR')} — versão no backup: {o.fromVersionInBackup || 'desconhecida'}</p>
                  </div>
                  <AsyncButton size="sm" onClick={() => reconcile(o.backupTar)} loading={applyingId === o.backupTar}>Reconciliar</AsyncButton>
                </div>
              ))}
            </div>
          )
        )}
      </CardContent>
    </Card>
  )
}

// ── Receita 3: recalcular custo de lote ─────────────────────────────────

function RecalculateBatchCostCard() {
  const confirmAction = useConfirm()
  const [productBatchId, setProductBatchId] = useState('')
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [batch, setBatch] = useState<ProductBatchCostSnapshot | null>(null)

  async function fetchBatch() {
    if (!productBatchId.trim()) return
    setLoading(true)
    try {
      const r = await fetch('/api/admin/recipes/recalculate-batch-cost/preview', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productBatchId }),
      })
      const json = await r.json()
      if (r.ok) setBatch(json)
      else toast.error(json.error || 'Lote não encontrado')
    } catch {
      toast.error('Erro ao buscar lote')
    } finally {
      setLoading(false)
    }
  }

  async function recalculate() {
    if (!(await confirmAction('Recalcular o custo deste lote a partir dos dados atuais (estrutura de BOM, taxas de custeio configuradas)? Os valores anteriores serão substituídos.'))) return
    setApplying(true)
    try {
      const r = await fetch('/api/admin/recipes/recalculate-batch-cost/apply', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productBatchId }),
      })
      const json = await r.json()
      if (r.ok) {
        toast.success('Custo recalculado')
        setBatch((prev) => prev ? { ...prev, ...json } : null)
      } else {
        toast.error(json.error || 'Erro ao recalcular')
      }
    } catch {
      toast.error('Erro ao recalcular')
    } finally {
      setApplying(false)
    }
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Recalcular custo de lote de produção</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Recalcula material/mão de obra/overhead de um lote específico a partir dos dados atuais.
        </p>
        <div className="flex gap-2">
          <Input placeholder="ID do lote (ProductBatch)" value={productBatchId} onChange={(e) => setProductBatchId(e.target.value)} className="max-w-sm" />
          <AsyncButton variant="outline" onClick={fetchBatch} loading={loading} disabled={!productBatchId.trim()}>Buscar lote</AsyncButton>
        </div>
        {batch && (
          <div className="rounded border p-3 text-sm space-y-2">
            <p className="font-medium">Lote {batch.batchNumber}</p>
            <div className="grid grid-cols-3 gap-3">
              <div><span className="text-muted-foreground">Material:</span> {batch.materialCost !== null ? formatCurrency(batch.materialCost) : '-'}</div>
              <div><span className="text-muted-foreground">Mão de obra:</span> {batch.laborCost !== null ? formatCurrency(batch.laborCost) : '-'}</div>
              <div><span className="text-muted-foreground">Overhead:</span> {batch.overheadCost !== null ? formatCurrency(batch.overheadCost) : '-'}</div>
            </div>
            <AsyncButton onClick={recalculate} loading={applying}>Recalcular agora</AsyncButton>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
