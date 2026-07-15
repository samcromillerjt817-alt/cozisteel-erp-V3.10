'use client'

import type { ReactNode } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { AsyncButton } from '@/components/domain/async-button'

interface FormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  maxWidth?: string
  onSave: () => void
  saving?: boolean
  saveLabel?: string
  cancelLabel?: string
  children: ReactNode
}

/**
 * Casco padrão de modal de formulário (ADR-014) — header + corpo rolável + rodapé fixo com
 * Cancelar/Salvar (já usando `AsyncButton`). Reaproveita `Dialog`/`DialogContent`/`DialogHeader`/
 * `DialogFooter` do shadcn (já corrigido na base desta consolidação — ver `dialog.tsx`) e só
 * padroniza a moldura ao redor de cada formulário; os campos de cada tela continuam como estão.
 */
export function FormDialog({
  open,
  onOpenChange,
  title,
  maxWidth = 'sm:max-w-2xl',
  onSave,
  saving,
  saveLabel = 'Salvar',
  cancelLabel = 'Cancelar',
  children,
}: FormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`${maxWidth} max-h-[90vh] overflow-y-auto`}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {children}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{cancelLabel}</Button>
          <AsyncButton onClick={onSave} loading={saving}>{saveLabel}</AsyncButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
