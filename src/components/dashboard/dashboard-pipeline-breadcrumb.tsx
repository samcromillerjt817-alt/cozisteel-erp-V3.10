'use client'

import { ArrowRight, FileText, ClipboardList, Cog, ShoppingCart, Truck, Wallet } from 'lucide-react'
import type { ElementType } from 'react'
import type { DashboardPipelineStageDTO } from '@/app/services/dashboard-types'

interface DashboardPipelineBreadcrumbProps {
  stages: DashboardPipelineStageDTO[]
  onNavigate: (moduleKey: string) => void
}

const STAGE_ICONS: Record<string, ElementType> = {
  orcamento: FileText,
  pedido: ClipboardList,
  producao: Cog,
  compra: ShoppingCart,
  entrega: Truck,
  financeiro: Wallet,
}

const SEVERITY_CLASSES: Record<string, string> = {
  info: 'text-emerald-600',
  warning: 'text-amber-600',
  critical: 'text-red-600',
}

/**
 * Pipeline Orçamento→Financeiro (ADR-024, Fase 1) — retrato do AGORA, não uma tabela de status: cada
 * etapa mostra "quanto está em trânsito ali" (nunca a mesma contagem de um alerta específico, que
 * mede atraso/risco). Clicar leva direto ao módulo daquela etapa.
 */
export function DashboardPipelineBreadcrumb({ stages, onNavigate }: DashboardPipelineBreadcrumbProps) {
  return (
    <div className="flex items-stretch gap-1 overflow-x-auto rounded-xl border bg-card p-2">
      {stages.map((stage, index) => {
        const Icon = STAGE_ICONS[stage.id]
        return (
          <div key={stage.id} className="flex items-stretch gap-1 shrink-0">
            <button
              type="button"
              onClick={() => onNavigate(stage.linkToModule)}
              className="flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-muted/60 transition-colors text-left"
            >
              <Icon className={`w-4 h-4 shrink-0 ${SEVERITY_CLASSES[stage.severity]}`} />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground leading-tight">{stage.label}</p>
                <p className="text-sm font-bold tabular-nums leading-tight">{stage.count}</p>
              </div>
            </button>
            {index < stages.length - 1 && (
              <div className="flex items-center text-muted-foreground/40">
                <ArrowRight className="w-4 h-4" />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
