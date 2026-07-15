import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { EmptyTableRow } from '@/components/domain/empty-table-row'
import { translateStatusLabel } from './dashboard-status-labels'
import type { DashboardTableData } from '@/app/services/dashboard-types'

/** Renderiza `type: 'table'` — puramente de exibição, reaproveitando os componentes de tabela já existentes (Fase 13). */
export function DashboardWidgetTable({ data }: { data: DashboardTableData }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {data.columns.map((col) => (
            <TableHead key={col.key}>{col.label}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.rows.length === 0 ? (
          <EmptyTableRow colSpan={data.columns.length} message="Nenhum dado no período" />
        ) : (
          data.rows.map((row, index) => (
            <TableRow key={index}>
              {data.columns.map((col) => (
                <TableCell key={col.key}>{translateStatusLabel(row[col.key])}</TableCell>
              ))}
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  )
}
