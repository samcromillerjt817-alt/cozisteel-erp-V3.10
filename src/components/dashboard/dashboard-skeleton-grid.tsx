import { Skeleton } from '@/components/ui/skeleton'

/** Bloco de carregamento do Dashboard — era copiado idêntico em 3 arquivos (profile-view,
 * diretoria-view, centro-operacoes-view); extraído aqui pra ter um só lugar pra ajustar. */
export function DashboardSkeletonGrid({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-24 rounded-ms-lg" />
      ))}
    </div>
  )
}
