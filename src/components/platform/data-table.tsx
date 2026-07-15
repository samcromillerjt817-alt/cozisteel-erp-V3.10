'use client'

import { useState, type ReactNode } from 'react'
import { ArrowUp, ArrowDown, ArrowUpDown, MoreHorizontal, AlertCircle } from 'lucide-react'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { TableSkeleton } from '@/components/domain/table-skeleton'
import { EmptyTableRow } from '@/components/domain/empty-table-row'
import { PaginationBar } from '@/components/domain/pagination-bar'

// DataTable — componente de PLATAFORMA (Fase 11.5, Subetapa 11.5.2), não "mais uma tabela": é a base
// de TODAS as listagens do ERP daí em diante. Construído e validado isolado com dado fixo (ver
// `src/app/dev/datatable/page.tsx`) antes de qualquer módulo real usá-lo — mesma disciplina "componente
// primeiro" do resto da fase (ADR-018 §0).
//
// Decisões de escopo desta versão (o que É real vs. o que só NÃO É IMPEDIDO — usuário, aprovação da
// 11.5.2):
// - Filtros: o DataTable NUNCA constrói UI de filtro própria — isso é responsabilidade da `FilterBar`
//   (Subetapa 11.5.3). O que existe aqui é o slot `toolbar`, renderizado acima da tabela, onde
//   qualquer barra de filtro/ação externa se encaixa.
// - Ações em lote: IMPLEMENTADAS de verdade (`bulkActions`), mesmo que nenhum módulo real as use ainda
//   — pedido explícito do usuário ("preparadas, mesmo que ainda não utilizadas" tratado aqui como
//   "funcionam se fornecidas", diferente dos itens abaixo que são só não-bloqueados).
// - Responsividade real: rolagem horizontal (herdada do primitivo `Table`) + `hideBelow` por coluna
//   (esconde uma coluna de baixa prioridade abaixo de um breakpoint, real, não só CSS decorativo).
// - NÃO implementados nesta versão, mas a arquitetura não os impede (ver comentários no código):
//   ocultar/exibir colunas, redimensionar colunas, persistência de preferência do usuário, exportação,
//   virtualização. Nenhum prop morto foi criado para essas capacidades — só a estrutura interna (linhas
//   como função pura por linha, colunas como array plano, estado controlado pelo chamador) já permite
//   adicioná-las depois sem quebrar esta API.

export interface DataTableColumn<T> {
  id: string
  header: ReactNode
  cell: (row: T) => ReactNode
  sortable?: boolean
  align?: 'left' | 'center' | 'right'
  /** Dica de largura CSS (ex.: '120px', '20%') — não impede um futuro redimensionamento manual por
   * arrasto, só define a largura inicial. */
  width?: string
  /** Esconde esta coluna abaixo do breakpoint informado (responsividade real, não decorativa) — use
   * para colunas de apoio que não são essenciais em telas pequenas. */
  hideBelow?: 'sm' | 'md' | 'lg'
}

export interface DataTableRowAction<T> {
  label: string
  icon?: ReactNode
  onClick: (row: T) => void
  disabled?: (row: T) => boolean
  variant?: 'default' | 'destructive'
}

export interface DataTableBulkAction<T> {
  label: string
  icon?: ReactNode
  onClick: (rows: T[]) => void
  variant?: 'default' | 'destructive'
}

export interface DataTableSort {
  columnId: string
  direction: 'asc' | 'desc'
}

export interface DataTablePagination {
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[]
  rows: T[]
  /** Identificador estável por linha — usado para seleção; nunca o índice do array. */
  getRowId: (row: T) => string

  loading?: boolean
  error?: string | null
  emptyMessage?: string

  sort?: DataTableSort | null
  onSortChange?: (sort: DataTableSort | null) => void

  selectable?: boolean
  selectedIds?: Set<string>
  onSelectionChange?: (ids: Set<string>) => void

  rowActions?: DataTableRowAction<T>[]
  bulkActions?: DataTableBulkAction<T>[]

  pagination?: DataTablePagination

  /** Slot acima da tabela (mas abaixo da barra de ações em lote, quando visível) — onde uma `FilterBar`
   * (Subetapa 11.5.3) ou qualquer ação externa se encaixa. O DataTable é o elemento central da tela,
   * mas não deve concentrar tudo: este slot existe justamente para não empurrar filtros/ações
   * principais para dentro do componente de tabela em si. */
  toolbar?: ReactNode
}

function hideBelowClass(hideBelow?: 'sm' | 'md' | 'lg'): string {
  if (!hideBelow) return ''
  return { sm: 'hidden sm:table-cell', md: 'hidden md:table-cell', lg: 'hidden lg:table-cell' }[hideBelow]
}

function alignClass(align?: 'left' | 'center' | 'right'): string {
  return { left: 'text-left', center: 'text-center', right: 'text-right' }[align ?? 'left']
}

export function DataTable<T>({
  columns,
  rows,
  getRowId,
  loading = false,
  error = null,
  emptyMessage = 'Nenhum registro encontrado',
  sort = null,
  onSortChange,
  selectable = false,
  selectedIds,
  onSelectionChange,
  rowActions,
  bulkActions,
  pagination,
  toolbar,
}: DataTableProps<T>) {
  // Fallback de seleção não-controlada — a maioria dos consumidores vai controlar via `selectedIds`/
  // `onSelectionChange`, mas o componente funciona sozinho se o chamador não precisar do estado.
  const [uncontrolledSelected, setUncontrolledSelected] = useState<Set<string>>(new Set())
  const selected = selectedIds ?? uncontrolledSelected
  const setSelected = onSelectionChange ?? setUncontrolledSelected

  const extraCols = (selectable ? 1 : 0) + (rowActions?.length ? 1 : 0)
  const colSpan = columns.length + extraCols

  const selectedRows = rows.filter((row) => selected.has(getRowId(row)))
  const allOnPageSelected = rows.length > 0 && rows.every((row) => selected.has(getRowId(row)))

  const toggleSort = (columnId: string) => {
    if (!onSortChange) return
    if (sort?.columnId !== columnId) return onSortChange({ columnId, direction: 'asc' })
    if (sort.direction === 'asc') return onSortChange({ columnId, direction: 'desc' })
    onSortChange(null)
  }

  const toggleSelectAllOnPage = (checked: boolean) => {
    const next = new Set(selected)
    for (const row of rows) {
      const id = getRowId(row)
      if (checked) next.add(id)
      else next.delete(id)
    }
    setSelected(next)
  }

  const toggleRowSelected = (id: string, checked: boolean) => {
    const next = new Set(selected)
    if (checked) next.add(id)
    else next.delete(id)
    setSelected(next)
  }

  return (
    <div className="space-y-3">
      {toolbar}

      {selectable && selectedRows.length > 0 && bulkActions && bulkActions.length > 0 && (
        <div className="flex items-center gap-3 rounded-lg bg-muted/50 px-3 py-2 text-sm">
          <span className="font-medium">{selectedRows.length} selecionado{selectedRows.length === 1 ? '' : 's'}</span>
          <div className="flex items-center gap-2 ml-auto">
            {bulkActions.map((action) => (
              <Button
                key={action.label}
                size="sm"
                variant={action.variant === 'destructive' ? 'destructive' : 'outline'}
                onClick={() => action.onClick(selectedRows)}
              >
                {action.icon}
                {action.label}
              </Button>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              {selectable && (
                <TableHead className="w-10">
                  <Checkbox checked={allOnPageSelected} onCheckedChange={(v) => toggleSelectAllOnPage(v === true)} aria-label="Selecionar todos" />
                </TableHead>
              )}
              {columns.map((column) => (
                <TableHead
                  key={column.id}
                  className={`${alignClass(column.align)} ${hideBelowClass(column.hideBelow)}`}
                  style={column.width ? { width: column.width } : undefined}
                >
                  {column.sortable ? (
                    <button type="button" onClick={() => toggleSort(column.id)} className="inline-flex items-center gap-1 hover:text-foreground">
                      {column.header}
                      {sort?.columnId === column.id ? (
                        sort.direction === 'asc' ? <ArrowUp className="w-3.5 h-3.5" /> : <ArrowDown className="w-3.5 h-3.5" />
                      ) : (
                        <ArrowUpDown className="w-3.5 h-3.5 opacity-40" />
                      )}
                    </button>
                  ) : (
                    column.header
                  )}
                </TableHead>
              ))}
              {rowActions && rowActions.length > 0 && <TableHead className="w-10" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={colSpan} className="p-0">
                  <TableSkeleton rows={4} />
                </TableCell>
              </TableRow>
            ) : error ? (
              <TableRow>
                <TableCell colSpan={colSpan} className="text-center py-8">
                  <div className="flex flex-col items-center gap-2 text-destructive">
                    <AlertCircle className="w-5 h-5" />
                    <span className="text-sm">{error}</span>
                  </div>
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <EmptyTableRow colSpan={colSpan} message={emptyMessage} />
            ) : (
              rows.map((row) => {
                const id = getRowId(row)
                return (
                  <TableRow key={id} data-state={selected.has(id) ? 'selected' : undefined}>
                    {selectable && (
                      <TableCell>
                        <Checkbox checked={selected.has(id)} onCheckedChange={(v) => toggleRowSelected(id, v === true)} aria-label="Selecionar linha" />
                      </TableCell>
                    )}
                    {columns.map((column) => (
                      <TableCell key={column.id} className={`${alignClass(column.align)} ${hideBelowClass(column.hideBelow)}`}>
                        {column.cell(row)}
                      </TableCell>
                    ))}
                    {rowActions && rowActions.length > 0 && (
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {rowActions.map((action) => (
                              <DropdownMenuItem
                                key={action.label}
                                disabled={action.disabled?.(row)}
                                variant={action.variant === 'destructive' ? 'destructive' : 'default'}
                                onClick={() => action.onClick(row)}
                              >
                                {action.icon}
                                {action.label}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    )}
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
        {pagination && !loading && !error && rows.length > 0 && (
          <div className="px-3">
            <PaginationBar
              page={pagination.page}
              totalPages={Math.max(1, Math.ceil(pagination.total / pagination.pageSize))}
              total={pagination.total}
              limit={pagination.pageSize}
              onPageChange={pagination.onPageChange}
            />
          </div>
        )}
      </div>
    </div>
  )
}
