import { TableRow, TableCell } from '@/components/ui/table'

interface EmptyTableRowProps {
  colSpan: number
  message: string
}

/** Linha "Nenhum X encontrado" padrão de toda tabela de listagem (Fase 13, Lote 6, ADR-015). */
export function EmptyTableRow({ colSpan, message }: EmptyTableRowProps) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="text-center py-8 text-muted-foreground">{message}</TableCell>
    </TableRow>
  )
}
