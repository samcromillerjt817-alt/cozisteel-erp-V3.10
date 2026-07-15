'use client'

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'

export interface ActionResultAction {
  label: string
  onClick: () => void
  variant?: 'default' | 'outline'
}

interface ActionResultOptions {
  title: string
  description?: string
  /** 1 a 3 próximos passos oferecidos ao usuário — nunca só "ok, feche esta caixa". */
  actions: ActionResultAction[]
}

type ShowActionResultFn = (options: ActionResultOptions) => void

const ActionResultContext = createContext<ShowActionResultFn | null>(null)

/**
 * Painel de "o que fazer agora" depois de uma ação que gera um registro em outro módulo (Hardening
 * pós-11.5, Prioridade 1) — mesma arquitetura Provider+hook de `useConfirm` (`confirm-dialog.tsx`),
 * só que sem pergunta: sempre tem pelo menos 1 ação de continuidade, nunca é só um aviso passivo como
 * o toast que substitui. `useActionResult()` tem a mesma forma de uso de `useConfirm()` — chamada de
 * qualquer página, sem prop-drilling de estado de diálogo.
 */
export function ActionResultProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ActionResultOptions | null>(null)

  const showActionResult = useCallback<ShowActionResultFn>((opts) => {
    setOptions(opts)
  }, [])

  const close = () => setOptions(null)

  return (
    <ActionResultContext.Provider value={showActionResult}>
      {children}
      <AlertDialog open={!!options} onOpenChange={(open) => { if (!open) close() }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{options?.title}</AlertDialogTitle>
            {options?.description && <AlertDialogDescription>{options.description}</AlertDialogDescription>}
          </AlertDialogHeader>
          <AlertDialogFooter>
            {options?.actions.map((action) => (
              <Button
                key={action.label}
                variant={action.variant || 'outline'}
                onClick={() => { close(); action.onClick() }}
              >
                {action.label}
              </Button>
            ))}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ActionResultContext.Provider>
  )
}

export function useActionResult(): ShowActionResultFn {
  const ctx = useContext(ActionResultContext)
  if (!ctx) throw new Error('useActionResult precisa estar dentro de um ActionResultProvider')
  return ctx
}
