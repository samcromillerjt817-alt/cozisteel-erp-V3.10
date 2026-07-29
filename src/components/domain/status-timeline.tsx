'use client'

import { useEffect, useState } from 'react'
import { StatusBadge } from '@/components/domain/status-badge'
import type { StatusDomain } from '@/lib/status-tokens'

interface StatusHistoryEntry {
  id: string
  fromStatus: string
  toStatus: string
  reason: string
  createdAt: string
  user: { id: string; name: string } | null
}

interface StatusTimelineProps {
  /** Valor bruto gravado em `StatusHistory.entityType` (snake_case — ver `prisma/schema.prisma`),
   * nunca o mesmo literal de `StatusDomain` (camelCase, usado só pra cor do badge). */
  entityType: 'quote' | 'sales_order' | 'production_order' | 'requisition' | 'purchase_order' | 'bom_revision' | 'shipment'
  entityId: string
  domain: StatusDomain
  labels: Record<string, string>
}

/**
 * ADR-022 (Fase UX-2, achado #14) — `StatusHistory` é gravado a cada transição desde a Fase 2, mas
 * nenhuma tela o exibia. Componente único e reutilizável (não um por módulo) — cada `DetailDrawer`
 * só informa qual entidade e como traduzir/colorir seus status.
 */
export function StatusTimeline({ entityType, entityId, domain, labels }: StatusTimelineProps) {
  const [entries, setEntries] = useState<StatusHistoryEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/status-history?entityType=${entityType}&entityId=${entityId}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => { if (!cancelled) setEntries(data) })
      .catch(() => { if (!cancelled) setEntries([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [entityType, entityId])

  if (loading) return <p className="text-sm text-muted-foreground">Carregando histórico...</p>
  if (entries.length === 0) return <p className="text-sm text-muted-foreground">Nenhuma mudança de status registrada ainda.</p>

  return (
    <ul className="space-y-3">
      {entries.map((e) => (
        <li key={e.id} className="flex items-start gap-2 text-sm">
          <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground mt-2 shrink-0" />
          <div className="flex-1 space-y-0.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <StatusBadge domain={domain} status={e.fromStatus} label={labels[e.fromStatus] || e.fromStatus} className="text-xs" />
              <span className="text-muted-foreground">→</span>
              <StatusBadge domain={domain} status={e.toStatus} label={labels[e.toStatus] || e.toStatus} className="text-xs" />
            </div>
            <p className="text-xs text-muted-foreground">
              {e.user?.name || 'Sistema'} — {new Date(e.createdAt).toLocaleString('pt-BR')}
            </p>
            {e.reason && <p className="text-xs italic">&ldquo;{e.reason}&rdquo;</p>}
          </div>
        </li>
      ))}
    </ul>
  )
}
