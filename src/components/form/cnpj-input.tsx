'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Loader2 } from 'lucide-react'
import { maskCpfCnpj, onlyDigits, isValidCpfCnpj } from '@/lib/masks'

interface CnpjInputProps {
  value: string
  onChange: (value: string) => void
  onLookup?: (cnpj: string) => Promise<void>
  className?: string
}

/**
 * Campo combinado CNPJ/CPF (ADR-014): máscara automática pela quantidade de dígitos, busca de CNPJ
 * (`onLookup`, reaproveitando o handler já existente de cada tela) com indicador de carregamento, e
 * validação de dígito verificador (borda destacada quando o número não fecha matematicamente) —
 * antes não existia nenhuma validação além da máscara em lugar nenhum do sistema.
 */
export function CnpjInput({ value, onChange, onLookup, className }: CnpjInputProps) {
  const [loading, setLoading] = useState(false)
  const invalid = onlyDigits(value).length >= 11 && !isValidCpfCnpj(value)
  return (
    <div className="relative">
      <Input
        value={value}
        placeholder="00.000.000/0000-00"
        inputMode="numeric"
        className={`${invalid ? 'border-destructive' : ''} ${className || ''}`}
        onChange={(e) => onChange(maskCpfCnpj(e.target.value))}
        onBlur={async (e) => {
          if (!onLookup || onlyDigits(e.target.value).length !== 14) return
          setLoading(true)
          try { await onLookup(e.target.value) } finally { setLoading(false) }
        }}
      />
      {loading && <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
    </div>
  )
}
