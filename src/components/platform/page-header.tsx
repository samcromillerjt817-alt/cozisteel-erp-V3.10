import type { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  description?: string
  /** Slot de ações principais (ex.: botão "Novo Cliente") — nunca importa nem conhece `FilterBar`/
   * `DataTable`; quem monta a página decide o que colocar aqui. */
  actions?: ReactNode
}

// PageHeader — componente de PLATAFORMA (Fase 11.5, Subetapa 11.5.3). Camada 1 da estrutura padrão de
// página (ADR-018 §0.1). Responsabilidade única: título + descrição + slot de ações — não sabe nada
// sobre KPIs, alertas, filtros ou tabela; a composição de todas as camadas acontece na página que usa
// `PageHeader`, nunca dentro dele.
export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4 flex-wrap">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold truncate">{title}</h1>
        {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  )
}
