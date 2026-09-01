'use client'

import { useState, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { formatCurrency } from '@/lib/format'

interface CurrencyInputProps {
  value: number
  onChange: (value: number) => void
  className?: string
  disabled?: boolean
}

/** Valor numérico -> string de dígitos em centavos ("1234.56" -> "123456"), pra alimentar a máscara. */
function toDigits(value: number): string {
  const cents = Math.round((value || 0) * 100)
  return String(Math.max(cents, 0))
}

/** Formata a string de dígitos como "1.234,56" enquanto o usuário digita — os 2 últimos dígitos são
 * sempre os centavos, o resto empurra a parte inteira da direita pra esquerda (mesma ideia de
 * máscara incremental usada em CEP/telefone, adaptada pra moeda). */
function formatDigits(digits: string): string {
  const padded = digits.padStart(3, '0')
  const cents = padded.slice(-2)
  const intPart = padded.slice(0, -2).replace(/^0+(?=\d)/, '')
  const intFormatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${intFormatted},${cents}`
}

/**
 * Campo monetário em PT-BR com máscara incremental — o usuário só digita números, o "." de milhar e
 * a "," decimal aparecem sozinhos conforme digita (igual CEP/telefone), sem precisar acertar a
 * pontuação na mão. Fora de foco mostra o valor formatado com o prefixo "R$" (`formatCurrency`).
 */
export function CurrencyInput({ value, onChange, className, disabled }: CurrencyInputProps) {
  const [focused, setFocused] = useState(false)
  const [digits, setDigits] = useState(() => toDigits(value))

  useEffect(() => {
    if (!focused) setDigits(toDigits(value))
  }, [value, focused])

  return (
    <Input
      className={`text-right ${className || ''}`}
      value={focused ? `R$ ${formatDigits(digits)}` : formatCurrency(value)}
      inputMode="numeric"
      disabled={disabled}
      onFocus={() => setFocused(true)}
      onChange={(e) => {
        const next = e.target.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '')
        setDigits(next)
        onChange(Number(next || '0') / 100)
      }}
      onBlur={() => setFocused(false)}
    />
  )
}
