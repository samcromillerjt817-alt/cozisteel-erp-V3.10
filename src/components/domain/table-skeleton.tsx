import { Skeleton } from '@/components/ui/skeleton'

interface TableSkeletonProps {
  rows?: number
}

/** Placeholder de carregamento padrão de toda tabela de listagem (Fase 13, Lote 6, ADR-015). */
export function TableSkeleton({ rows = 2 }: TableSkeletonProps) {
  return (
    <div className="p-6 space-y-3">
      {Array.from({ length: rows }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
    </div>
  )
}
