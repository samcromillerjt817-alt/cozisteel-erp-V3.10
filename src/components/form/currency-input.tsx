'use client'

import { useState, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { formatCurrency, parseCurrencyInput } from '@/lib/format'

interface CurrencyInputProps {
  value: number
  onChange: (value: number) => void
  className?: string
}

/**
 * Campo monetário em PT-BR (ADR-014) — formata "R$ 1.234,56" fora de foco e permite digitação livre
 * durante o foco, convertendo com `parseCurrencyInput` no blur. `formatCurrency` já inclui o prefixo
 * "R$" desde a Hardening pós-11.5 — sem prefixo visual próprio aqui, ou o valor mostraria "R$ R$ ...".
 */
export function CurrencyInput({ value, onChange, className }: CurrencyInputProps) {
  const [text, setText] = useState(() => formatCurrency(value))
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (!focused) setText(formatCurrency(value))
  }, [value, focused])

  return (
    <Input
      className={`text-right ${className || ''}`}
      value={text}
      inputMode="decimal"
      onFocus={() => setFocused(true)}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        setFocused(false)
        const parsed = parseCurrencyInput(text)
        onChange(parsed)
        setText(formatCurrency(parsed))
      }}
    />
  )
}
