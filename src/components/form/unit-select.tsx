'use client'

import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'

/** Mesmo domínio fechado já documentado no schema (Material.unit): KG, UN, M, M2, M3, L, CHAPA. */
const UNITS = ['KG', 'UN', 'M', 'M2', 'M3', 'L', 'CHAPA']

interface UnitSelectProps {
  value: string
  onChange: (value: string) => void
  className?: string
}

/** Select de unidade de medida (ADR-014) — substitui o campo de texto livre usado em 4 formulários
 * apesar de "Unidade" ser, na prática, um domínio fechado de poucos valores. */
export function UnitSelect({ value, onChange, className }: UnitSelectProps) {
  return (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger className={className}><SelectValue placeholder="Unidade" /></SelectTrigger>
      <SelectContent>
        {UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
      </SelectContent>
    </Select>
  )
}
