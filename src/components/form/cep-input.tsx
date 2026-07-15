'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Loader2 } from 'lucide-react'
import { maskCep, onlyDigits } from '@/lib/masks'

interface CepInputProps {
  value: string
  onChange: (value: string) => void
  onLookup?: (cep: string) => Promise<void>
  className?: string
}

/**
 * Campo de CEP com máscara e busca automática (ADR-014) — `onLookup` é o handler já existente de
 * cada tela (ex.: `handleCepLookup`), reaproveitado como está; este componente só padroniza a
 * máscara e adiciona o indicador de carregamento que faltava (a busca não dava nenhum feedback
 * visual antes, mesmo levando um tempo perceptível).
 */
export function CepInput({ value, onChange, onLookup, className }: CepInputProps) {
  const [loading, setLoading] = useState(false)
  return (
    <div className="relative">
      <Input
        value={value}
        placeholder="00000-000"
        maxLength={9}
        inputMode="numeric"
        className={className}
        onChange={(e) => onChange(maskCep(e.target.value))}
        onBlur={async (e) => {
          if (!onLookup || onlyDigits(e.target.value).length !== 8) return
          setLoading(true)
          try { await onLookup(e.target.value) } finally { setLoading(false) }
        }}
      />
      {loading && <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
    </div>
  )
}
