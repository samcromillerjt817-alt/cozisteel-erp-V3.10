'use client'

import { FileText, ClipboardList, Cog, ShoppingCart, Truck, Wallet } from 'lucide-react'
import type { ElementType } from 'react'
import type { DashboardPipelineStageDTO, DashboardAlertSeverity } from '@/app/services/dashboard-types'

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

const SEVERITY_RING: Record<DashboardAlertSeverity, string> = {
  info: 'ring-ms-info/40 text-ms-info',
  warning: 'ring-ms-warning/50 text-ms-warning',
  critical: 'ring-ms-critical/60 text-ms-critical',
}

/**
 * Pipeline Orçamento→Financeiro (ADR-024, Fase 1) redesenhado como painel de linha de produção
 * (evolução visual 2026-07-29): cada etapa é uma "estação" com anel de estado (cor = severity real do
 * backend, nunca inventada) conectada por um traço contínuo. O traço vermelho anima uma vez no mount
 * (`ms-flow`, definido em globals.css, desativado sob prefers-reduced-motion via `.ms-motion-safe`).
 * Retrato do AGORA — cada etapa mostra "quanto está em trânsito ali", não uma tabela de status.
 */
export function DashboardPipelineBreadcrumb({ stages, onNavigate }: DashboardPipelineBreadcrumbProps) {
  return (
    <div className="rounded-ms-lg border bg-card p-4 overflow-x-auto">
      <div className="relative flex items-start gap-0 min-w-max">
        {stages.map((stage, index) => {
          const Icon = STAGE_ICONS[stage.id]
          const ring = SEVERITY_RING[stage.severity]
          return (
            <div key={stage.id} className="flex items-start">
              <button
                type="button"
                onClick={() => onNavigate(stage.linkToModule)}
                className="group flex flex-col items-center gap-2 px-4 py-1 rounded-ms-md hover:bg-muted/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-1"
              >
                <span
                  className={`flex items-center justify-center w-11 h-11 rounded-full bg-background ring-2 transition-shadow ${ring} group-hover:ring-[3px]`}
                >
                  <Icon className="w-5 h-5" />
                </span>
                <span className="text-xs text-muted-foreground leading-tight text-center">{stage.label}</span>
                <span className="text-sm font-bold tabular-nums leading-tight">{stage.count}</span>
              </button>
              {index < stages.length - 1 && (
                <svg width="40" height="44" className="shrink-0 -mx-1 mt-4" aria-hidden="true">
                  <line x1="0" y1="1" x2="40" y2="1" stroke="var(--border)" strokeWidth="2" />
                  <line
                    x1="0" y1="1" x2="40" y2="1"
                    stroke="var(--primary)" strokeWidth="2" strokeDasharray="24"
                    className="ms-motion-safe"
                    style={{ animation: 'ms-flow var(--ms-motion-base) var(--ms-motion-ease) 1' }}
                  />
                </svg>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
