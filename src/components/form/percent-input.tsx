'use client'

import { Input } from '@/components/ui/input'

interface PercentInputProps {
  value: number
  onChange: (value: number) => void
  className?: string
}

/** Campo de percentual com clamp 0–100 e símbolo % sempre visível (ADR-014). */
export function PercentInput({ value, onChange, className }: PercentInputProps) {
  return (
    <div className="relative">
      <Input
        type="number"
        inputMode="decimal"
        value={value}
        min={0}
        max={100}
        step={0.01}
        className={`pr-8 ${className || ''}`}
        onChange={(e) => {
          const parsed = parseFloat(e.target.value)
          const clamped = isNaN(parsed) ? 0 : Math.min(100, Math.max(0, parsed))
          onChange(clamped)
        }}
      />
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">%</span>
    </div>
  )
}
