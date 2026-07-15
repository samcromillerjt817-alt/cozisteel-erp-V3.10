'use client'

import { Input } from '@/components/ui/input'
import { maskPhone } from '@/lib/masks'

interface PhoneInputProps {
  value: string
  onChange: (value: string) => void
  className?: string
}

/** Campo de telefone com máscara sempre aplicada (ADR-014) — antes, 1 de 5 ocorrências de telefone
 * no sistema não usava `maskPhone`, apesar de existir e ser usado nos outros 4. */
export function PhoneInput({ value, onChange, className }: PhoneInputProps) {
  return (
    <Input
      value={value}
      placeholder="(00) 00000-0000"
      inputMode="numeric"
      className={className}
      onChange={(e) => onChange(maskPhone(e.target.value))}
    />
  )
}
