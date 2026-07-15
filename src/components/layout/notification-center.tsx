'use client'

import { useCallback, useEffect, useState } from 'react'
import { Bell } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { DashboardAlertCard } from '@/components/dashboard/dashboard-alert-card'
import type { DashboardWidgetDTO, DashboardAlertData, DashboardAlertSeverity } from '@/app/services/dashboard-types'

interface NotificationCenterProps {
  onNavigate: (moduleKey: string) => void
}

const SEVERITY_ORDER: Record<DashboardAlertSeverity, number> = { critical: 0, warning: 1, info: 2 }

/**
 * Sino de notificações da barra lateral (Fase 11.5, Subetapa 11.5.10) — reaproveita o mesmo
 * `DashboardAlertCard` (severidade/ícone/cor) do Alert Center do Dashboard, alimentado por
 * `GET /api/dashboard/alerts` (todos os alertas de qualquer domínio, já filtrados pela permissão do
 * usuário na rota) — substitui as 2 buscas manuais (estoque baixo, requisições pendentes) que
 * existiam antes desta subetapa.
 */
export function NotificationCenter({ onNavigate }: NotificationCenterProps) {
  const [open, setOpen] = useState(false)
  const [widgets, setWidgets] = useState<DashboardWidgetDTO[]>([])

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/dashboard/alerts')
      if (r.ok) {
        const json = await r.json()
        setWidgets(json.widgets || [])
      }
    } catch {
      // silencioso — notificações não são críticas
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const sorted = [...widgets].sort((a, b) => {
    const da = a.data as DashboardAlertData
    const db = b.data as DashboardAlertData
    return SEVERITY_ORDER[da.severity] - SEVERITY_ORDER[db.severity] || db.count - da.count
  })
  const count = widgets.reduce((sum, w) => sum + (w.data as DashboardAlertData).count, 0)

  return (
    <Popover open={open} onOpenChange={(next) => { setOpen(next); if (next) load() }}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="w-5 h-5" />
          {count > 0 && (
            <span className="absolute -top-0.5 -right-0.5 bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
              {count > 9 ? '9+' : count}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="end">
        <div className="p-3 border-b font-semibold text-sm">Notificações</div>
        <div className="max-h-96 overflow-y-auto p-3 space-y-2">
          {sorted.length === 0 ? (
            <p className="text-sm text-muted-foreground p-4 text-center">Nenhuma notificação no momento</p>
          ) : (
            sorted.map((w) => (
              <DashboardAlertCard
                key={w.id}
                title={w.title}
                data={w.data as DashboardAlertData}
                onNavigate={(m) => { setOpen(false); onNavigate(m) }}
              />
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
