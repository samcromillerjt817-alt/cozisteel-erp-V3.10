'use client'

import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'
import type { ComponentProps } from 'react'

interface AsyncButtonProps extends ComponentProps<typeof Button> {
  loading?: boolean
  loadingText?: string
}

/**
 * Botão com spinner + disable automático embutidos (ADR-014) — padroniza o padrão "Salvando..."
 * já bem aplicado nos formulários de criar/editar, e é o mesmo componente usado nas ações de
 * status inline (que antes não tinham nenhum indicador visual nem proteção contra clique duplo).
 */
export function AsyncButton({ loading, loadingText, disabled, children, ...props }: AsyncButtonProps) {
  return (
    <Button disabled={disabled || loading} {...props}>
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {loading ? (loadingText ?? children) : children}
    </Button>
  )
}
