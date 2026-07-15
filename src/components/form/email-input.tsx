'use client'

import { Input } from '@/components/ui/input'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

interface EmailInputProps {
  value: string
  onChange: (value: string) => void
  className?: string
}

/** Campo de e-mail com validação de formato consistente (ADR-014) — antes, 2 de 5 ocorrências não
 * tinham nem `type="email"`, então ficavam sem qualquer validação nativa do navegador. */
export function EmailInput({ value, onChange, className }: EmailInputProps) {
  const invalid = value.length > 0 && !EMAIL_REGEX.test(value)
  return (
    <Input
      type="email"
      value={value}
      className={`${invalid ? 'border-destructive' : ''} ${className || ''}`}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}
