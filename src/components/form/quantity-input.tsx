'use client'

import { Input } from '@/components/ui/input'

interface QuantityInputProps {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  className?: string
}

/** Campo de quantidade/decimal com min/max aplicados por padrão (ADR-014) — antes, só 1 campo em
 * todo o sistema tinha `max`; o resto aceitava negativo ou excesso sem aviso. */
export function QuantityInput({ value, onChange, min = 0, max, step = 0.01, className }: QuantityInputProps) {
  return (
    <Input
      type="number"
      inputMode="decimal"
      value={value}
      min={min}
      max={max}
      step={step}
      className={className}
      onChange={(e) => {
        const parsed = parseFloat(e.target.value)
        if (isNaN(parsed)) { onChange(0); return }
        let clamped = parsed
        if (min !== undefined) clamped = Math.max(min, clamped)
        if (max !== undefined) clamped = Math.min(max, clamped)
        onChange(clamped)
      }}
    />
  )
}
