'use client'

import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from 'react'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog'

interface ConfirmOptions {
  title?: string
  description: string
  confirmText?: string
  cancelText?: string
  /** Estiliza o botão de confirmação em vermelho — para ações irreversíveis (excluir), não para
   * ações reversíveis (converter, aplicar). */
  destructive?: boolean
}

type ConfirmFn = (options: ConfirmOptions | string) => Promise<boolean>

const ConfirmContext = createContext<ConfirmFn | null>(null)

/**
 * Substitui `window.confirm()` (ADR-014) — 10 ocorrências no sistema, todas sem estilo próprio e
 * sem diferenciar ação destrutiva de reversível. `useConfirm()` devolve uma função com a MESMA
 * forma de uso de `window.confirm` (`if (!(await confirmAction('texto'))) return`), só que
 * assíncrona e renderizada com a identidade visual do app.
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null)
  const resolver = useRef<((value: boolean) => void) | null>(null)

  const confirm = useCallback<ConfirmFn>((opts) => {
    const normalized = typeof opts === 'string' ? { description: opts } : opts
    setOptions(normalized)
    return new Promise<boolean>((resolve) => { resolver.current = resolve })
  }, [])

  const close = (result: boolean) => {
    setOptions(null)
    resolver.current?.(result)
    resolver.current = null
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialog open={!!options} onOpenChange={(open) => { if (!open) close(false) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{options?.title || 'Confirmar ação'}</AlertDialogTitle>
            <AlertDialogDescription>{options?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => close(false)}>{options?.cancelText || 'Cancelar'}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => close(true)}
              className={options?.destructive ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : ''}
            >
              {options?.confirmText || 'Confirmar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  )
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext)
  if (!ctx) throw new Error('useConfirm precisa estar dentro de um ConfirmProvider')
  return ctx
}
