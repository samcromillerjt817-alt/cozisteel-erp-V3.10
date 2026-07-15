import { Badge } from '@/components/ui/badge'
import { statusCategoryClasses, statusCategoryFor, type StatusDomain } from '@/lib/status-tokens'

interface StatusBadgeProps {
  domain: StatusDomain
  status: string
  label: string
  className?: string
}

/** Badge de status com cor semântica única por domínio (Fase 13, Lote 2, ADR-015) — toda tela
 * consome este componente em vez de definir sua própria paleta de cor por status. */
export function StatusBadge({ domain, status, label, className = '' }: StatusBadgeProps) {
  const category = statusCategoryFor(domain, status)
  return <Badge className={`${statusCategoryClasses[category]} ${className}`}>{label}</Badge>
}
