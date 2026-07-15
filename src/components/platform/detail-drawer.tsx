import type { ReactNode } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet'

interface DetailDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  /** Conteúdo do detalhe — qualquer coisa (campos de leitura, sub-formulário, sub-lista). */
  children: ReactNode
  /** Slot de rodapé para ações (Salvar/Cancelar) — opcional; sem ele o painel é só consulta. */
  footer?: ReactNode
}

// DetailDrawer — componente de PLATAFORMA (Fase 11.5, Subetapa 11.5.3). Camada 6 da estrutura padrão
// de página (ADR-018 §0.1), substituindo os 3 mecanismos de drill-down incompatíveis encontrados na
// auditoria (seções dentro do dialog de edição; segundo dialog dedicado; navegação para outra sub-
// view). Painel lateral único para qualquer detalhe/drill-down do ERP — nunca importa `DataTable` nem
// sabe de onde veio a linha que abriu; quem chama decide o conteúdo via `children`.
export function DetailDrawer({ open, onOpenChange, title, description, children, footer }: DetailDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          {description && <SheetDescription>{description}</SheetDescription>}
        </SheetHeader>
        <div className="px-4 space-y-4">{children}</div>
        {footer && <SheetFooter>{footer}</SheetFooter>}
      </SheetContent>
    </Sheet>
  )
}
