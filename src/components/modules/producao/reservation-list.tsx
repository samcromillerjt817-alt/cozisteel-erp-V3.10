'use client'

import { useEffect, useState } from 'react'

interface ReservationRow {
  id: string
  itemType: 'material' | 'product'
  material: { id: string; name: string; unit: string } | null
  product: { id: string; name: string } | null
  quantityNeeded: number
  quantityReserved: number
  quantityShortfall: number
  status: string
}

const STATUS_LABELS: Record<string, string> = {
  reserved: 'Reservado', partial: 'Parcial', released: 'Liberado', consumed: 'Consumido',
}

/**
 * ADR-022 (Fase UX-3, achado #06) — `MaterialReservationService.listReservations()` existia desde
 * o ADR-006 (Fase 5) sem nenhuma rota/tela. Primeira exposição: só consulta, nenhuma ação (aprovar,
 * forçar reserva) — decisão explícita do usuário de começar pelo menor risco.
 */
export function ReservationList({ productionOrderId }: { productionOrderId: string }) {
  const [rows, setRows] = useState<ReservationRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/production-orders/${productionOrderId}/reservations`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => { if (!cancelled) setRows(data) })
      .catch(() => { if (!cancelled) setRows([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [productionOrderId])

  if (loading) return <p className="text-sm text-muted-foreground">Carregando reserva de material...</p>
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">Nenhuma reserva de material para esta OP (sem revisão de engenharia vinculada, ou nada a reservar).</p>

  return (
    <div className="space-y-1.5">
      {rows.map((r) => {
        const name = r.itemType === 'material' ? r.material?.name : r.product?.name
        const unit = r.itemType === 'material' ? r.material?.unit || '' : ''
        return (
          <div key={r.id} className="flex items-center justify-between text-sm border rounded px-3 py-1.5 gap-2">
            <span className="truncate">{name || '-'}</span>
            <span className="text-xs text-muted-foreground shrink-0">
              {r.quantityReserved}/{r.quantityNeeded} {unit}
              {r.quantityShortfall > 0 && <span className="text-destructive font-medium"> · faltam {r.quantityShortfall}</span>}
              {' — '}{STATUS_LABELS[r.status] || r.status}
            </span>
          </div>
        )
      })}
    </div>
  )
}
