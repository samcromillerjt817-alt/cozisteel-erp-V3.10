import { TableRow, TableCell } from '@/components/ui/table'
import { Button } from '@/components/ui/button'

interface EmptyTableRowProps {
  colSpan: number
  message: string
  /** ADR-022 (Fase UX-6, achado #22) — estado vazio ganha um próximo passo, não só a constatação de
   * que não há nada. Opcional: nem toda listagem tem uma ação de criação óbvia (ex.: uma tabela
   * só-leitura ou filtrada). */
  action?: { label: string; onClick: () => void }
}

/** Linha "Nenhum X encontrado" padrão de toda tabela de listagem (Fase 13, Lote 6, ADR-015). */
export function EmptyTableRow({ colSpan, message, action }: EmptyTableRowProps) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="text-center py-8">
        <p className="text-muted-foreground">{message}</p>
        {action && (
          <Button variant="outline" size="sm" className="mt-3" onClick={action.onClick}>
            {action.label}
          </Button>
        )}
      </TableCell>
    </TableRow>
  )
}
