'use client'

import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface PaginationBarProps {
  page: number
  totalPages: number
  total: number
  limit: number
  onPageChange: (page: number) => void
}

/**
 * Barra de paginação padrão (ADR-014, Lote 1) — "Mostrando X–Y de Z" + Anterior/Próxima.
 * A API já suporta paginação real (skip/take) em todas as listagens; esta é a peça que faltava
 * no frontend para o usuário conseguir navegar além da primeira página.
 */
export function PaginationBar({ page, totalPages, total, limit, onPageChange }: PaginationBarProps) {
  if (total === 0) return null
  const from = (page - 1) * limit + 1
  const to = Math.min(page * limit, total)
  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-2 py-3 text-sm text-muted-foreground border-t">
      <span>Mostrando {from}–{to} de {total}</span>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          <ChevronLeft className="h-4 w-4" /> Anterior
        </Button>
        <span className="px-1 whitespace-nowrap">Página {page} de {Math.max(totalPages, 1)}</span>
        <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
          Próxima <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
