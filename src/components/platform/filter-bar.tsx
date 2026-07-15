import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'

interface FilterBarProps {
  /** Controles de filtro arbitrários (reaproveita `SearchInput`, `Select`, checkboxes, etc. já
   * existentes) — `FilterBar` nunca reimplementa um controle de filtro, só organiza o layout deles. */
  children: ReactNode
  /** Ação opcional "Limpar filtros" — só aparece se fornecida. */
  onClear?: () => void
}

// FilterBar — componente de PLATAFORMA (Fase 11.5, Subetapa 11.5.3). Camada 4 da estrutura padrão de
// página (ADR-018 §0.1). Responsabilidade única: layout consistente de 1 linha (com quebra em telas
// pequenas) para os controles de filtro de qualquer módulo — nunca constrói um input/select/checkbox
// próprio, e nunca importa `DataTable` (a composição entre eles acontece na página, nunca aqui).
export function FilterBar({ children, onClear }: FilterBarProps) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="flex items-center gap-3 flex-wrap flex-1 min-w-0">{children}</div>
      {onClear && (
        <Button variant="ghost" size="sm" onClick={onClear}>
          <X className="w-4 h-4" /> Limpar filtros
        </Button>
      )}
    </div>
  )
}
