'use client'

import { AlertCircle, AlertTriangle, Info, ArrowRight } from 'lucide-react'
import { motion } from 'framer-motion'
import type { DashboardAlertData, DashboardAlertSeverity } from '@/app/services/dashboard-types'

interface DashboardAlertCardProps {
  title: string
  data: DashboardAlertData
  onNavigate: (moduleKey: string) => void
}

// Hierarquia por severidade nunca depende só de cor (decisão do usuário, evolução pós-7.2): tamanho,
// peso tipográfico, presença de fundo tintado e um indicador pulsante (só no crítico) carregam o
// mesmo sinal por forma/tamanho/movimento, não só matiz — ajuda inclusive leitura por daltônicos.
// A severidade em si já vem pronta do backend (ADR-019, Subetapa 7.2): este componente só traduz o
// valor recebido em aparência, nunca recalcula o que é crítico/atenção/informativo.
const SEVERITY_STYLE: Record<
  DashboardAlertSeverity,
  { label: string; icon: typeof AlertCircle; card: string; iconWrap: string; badge: string; title: string; iconSize: string; pulse: boolean }
> = {
  critical: {
    label: 'Crítico',
    icon: AlertCircle,
    card: 'border-2 border-ms-critical/70 bg-ms-critical/5 shadow-sm hover:shadow-md hover:border-ms-critical',
    iconWrap: 'bg-ms-critical text-white',
    badge: 'bg-ms-critical text-white',
    title: 'text-base font-bold',
    iconSize: 'w-5 h-5',
    pulse: true,
  },
  warning: {
    label: 'Atenção',
    icon: AlertTriangle,
    card: 'border border-ms-warning/50 bg-card hover:shadow-sm hover:border-ms-warning',
    iconWrap: 'bg-ms-warning/15 text-ms-warning',
    badge: 'bg-ms-warning/15 text-ms-warning',
    title: 'text-sm font-semibold',
    iconSize: 'w-4 h-4',
    pulse: false,
  },
  info: {
    label: 'Informativo',
    icon: Info,
    card: 'border border-border bg-card hover:shadow-sm',
    iconWrap: 'bg-ms-info/10 text-ms-info',
    badge: 'bg-ms-info/10 text-ms-info',
    title: 'text-sm font-medium',
    iconSize: 'w-4 h-4',
    pulse: false,
  },
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function DashboardAlertCard({ title, data, onNavigate }: DashboardAlertCardProps) {
  const style = SEVERITY_STYLE[data.severity]
  const Icon = style.icon
  const reduceMotion = prefersReducedMotion()

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <button
        type="button"
        onClick={() => onNavigate(data.linkToModule)}
        className={`group w-full text-left rounded-xl p-4 flex flex-col gap-2.5 transition-all cursor-pointer ${style.card}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className={`relative shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${style.iconWrap}`}>
              <Icon className={style.iconSize} />
              {style.pulse && <span className="absolute inset-0 rounded-full bg-ms-critical motion-safe:animate-ping opacity-40" />}
            </span>
            <span className={`truncate ${style.title}`}>{title}</span>
          </div>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${style.badge}`}>{data.count}</span>
        </div>

        <p className="text-sm text-muted-foreground leading-snug">{data.message}</p>

        <span className="inline-flex items-center gap-1 self-start text-sm font-semibold text-primary group-hover:gap-1.5 transition-all">
          Resolver agora <ArrowRight className="w-4 h-4" />
        </span>
      </button>
    </motion.div>
  )
}
