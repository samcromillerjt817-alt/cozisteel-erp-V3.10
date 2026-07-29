import { AlertCircle, Inbox } from 'lucide-react'

interface DashboardStateMessageProps {
  kind: 'error' | 'empty'
  message: string
}

/** Substitui os blocos "<p className=text-center py-12>Erro ao carregar...</p>" repetidos (bare
 * text, sem hierarquia) por ícone+mensagem — mesma lógica de "forma além de cor" já usada em
 * DashboardAlertCard. `error` usa o token crítico; `empty` é neutro (não é uma falha, é ausência de
 * dado — nunca confundir os dois visualmente). */
export function DashboardStateMessage({ kind, message }: DashboardStateMessageProps) {
  const Icon = kind === 'error' ? AlertCircle : Inbox
  const iconClass = kind === 'error' ? 'text-ms-critical' : 'text-muted-foreground'
  return (
    <div className="flex flex-col items-center gap-2 text-center py-12">
      <Icon className={`w-6 h-6 ${iconClass}`} />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  )
}
