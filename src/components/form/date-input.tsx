'use client'

import { Input } from '@/components/ui/input'

/** Aplica máscara DD/MM/AAAA com auto-inserção de barras conforme o usuário digita. */
export function maskDate(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8)
  if (digits.length <= 2) return digits
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`
}

/** Confirma que uma string DD/MM/AAAA representa uma data real (não só o formato). */
export function isValidDate(value: string): boolean {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value)
  if (!match) return false
  const day = parseInt(match[1], 10)
  const month = parseInt(match[2], 10)
  const year = parseInt(match[3], 10)
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
}

interface DateInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}

/**
 * Campo de data em texto livre com máscara DD/MM/AAAA (ADR-014) — resolve a inconsistência em que
 * digitar "04012002" nunca virava "04/01/2002" em vários formulários do sistema. Não substitui os
 * campos que já usam `<input type="date">` nativo (ex.: Ordem de Produção) — esses continuam como
 * estão, comportamento de date-picker do navegador é uma escolha válida e diferente desta.
 */
export function DateInput({ value, onChange, placeholder = 'dd/mm/aaaa', className }: DateInputProps) {
  return (
    <Input
      value={value}
      placeholder={placeholder}
      maxLength={10}
      inputMode="numeric"
      className={className}
      onChange={(e) => onChange(maskDate(e.target.value))}
    />
  )
}
