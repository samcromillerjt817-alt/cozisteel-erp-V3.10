'use client'

import { useState } from 'react'
import { CheckCircle2, AlertCircle, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DashboardAlertCard } from '@/components/dashboard/dashboard-alert-card'
import type { DashboardAlertData, DashboardAlertSeverity, DashboardWidgetDTO } from '@/app/services/dashboard-types'

interface DashboardAlertCenterProps {
  widgets: DashboardWidgetDTO[] // já filtrados para widget.type === 'alert' por quem chama
  onNavigate: (moduleKey: string) => void
  fetchedAt: Date | null
  maxVisible?: number // Diretoria (ADR-019, decisão de aprovação): tela inicial limpa mesmo com muitos alertas
}

const SEVERITY_ORDER: Record<DashboardAlertSeverity, number> = { critical: 0, warning: 1, info: 2 }

function formatRelativeUpdate(fetchedAt: Date | null): string {
  if (!fetchedAt) return ''
  const minutes = Math.max(0, Math.round((Date.now() - fetchedAt.getTime()) / 60000))
  if (minutes === 0) return 'Última atualização: agora mesmo.'
  if (minutes === 1) return 'Última atualização: há 1 minuto.'
  return `Última atualização: há ${minutes} minutos.`
}

/**
 * Central de Alertas / Centro de Comando (ADR-019, Subetapa 7.2 + evolução visual pós-aprovação) —
 * primeiro bloco de cada perfil (Ação → Resumo → Análise). Puramente um renderizador: severidade/
 * contagem/mensagem/link já vêm prontos do backend (decisão do usuário, 2026-07-13) — este componente
 * só agrupa (crítico primeiro, sempre em destaque próprio; atenção depois, mais compacto) para que a
 * prioridade seja legível em poucos segundos por tamanho/posição, não só por cor.
 */
export function DashboardAlertCenter({ widgets, onNavigate, fetchedAt, maxVisible }: DashboardAlertCenterProps) {
  const [expanded, setExpanded] = useState(false)

  const active = widgets
    .map((w) => ({ widget: w, data: w.data as DashboardAlertData }))
    .filter((w) => w.data.count > 0)
    .sort((a, b) => SEVERITY_ORDER[a.data.severity] - SEVERITY_ORDER[b.data.severity] || b.data.count - a.data.count)

  if (active.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-6 flex flex-col items-center text-center gap-2">
        <CheckCircle2 className="w-8 h-8 text-emerald-600" />
        <p className="font-medium">Tudo em ordem por aqui.</p>
        <p className="text-xs text-muted-foreground">{formatRelativeUpdate(fetchedAt)}</p>
      </div>
    )
  }

  const visible = maxVisible && !expanded ? active.slice(0, maxVisible) : active
  const hiddenCount = active.length - visible.length
  const critical = visible.filter((v) => v.data.severity === 'critical')
  const warning = visible.filter((v) => v.data.severity === 'warning')
  const info = visible.filter((v) => v.data.severity === 'info')

  return (
    <div className="space-y-4">
      {critical.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-red-600">
            <AlertCircle className="w-3.5 h-3.5" />
            Crítico — requer ação imediata
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {critical.map(({ widget, data }) => (
              <DashboardAlertCard key={widget.id} title={widget.title} data={data} onNavigate={onNavigate} />
            ))}
          </div>
        </div>
      )}

      {warning.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-600">
            <AlertTriangle className="w-3.5 h-3.5" />
            Atenção — monitorar
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {warning.map(({ widget, data }) => (
              <DashboardAlertCard key={widget.id} title={widget.title} data={data} onNavigate={onNavigate} />
            ))}
          </div>
        </div>
      )}

      {info.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {info.map(({ widget, data }) => (
            <DashboardAlertCard key={widget.id} title={widget.title} data={data} onNavigate={onNavigate} />
          ))}
        </div>
      )}

      {hiddenCount > 0 && (
        <Button variant="ghost" size="sm" onClick={() => setExpanded(true)}>
          Ver todos os alertas (mostrando {visible.length} de {active.length})
        </Button>
      )}
      {expanded && maxVisible && active.length > maxVisible && (
        <Button variant="ghost" size="sm" onClick={() => setExpanded(false)}>
          Mostrar menos
        </Button>
      )}
    </div>
  )
}
