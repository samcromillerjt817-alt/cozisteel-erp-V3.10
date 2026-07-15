'use client'

import { useState } from 'react'
import { CalendarIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { isValidDate } from './date-input'

interface DatePickerProps {
  value: string // dd/mm/aaaa — mesmo contrato de `DateInput`, para trocar um pelo outro sem tocar
  // em quem lê o valor depois (backend continua recebendo a mesma string, ex.: `parseBrDate` em
  // `report.service.ts`).
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}

function parseBrDateValue(value: string): Date | undefined {
  if (!isValidDate(value)) return undefined
  const [day, month, year] = value.split('/').map(Number)
  return new Date(year, month - 1, day)
}

function formatBrDate(date: Date): string {
  const d = String(date.getDate()).padStart(2, '0')
  const m = String(date.getMonth() + 1).padStart(2, '0')
  return `${d}/${m}/${date.getFullYear()}`
}

/**
 * Seleção de data por calendário (Fase 11.5, Subetapa 11.5.10 — achado do usuário: digitar dígito a
 * dígito num campo de texto, mesmo mascarado, é pior do que escolher visualmente). Mesmo contrato de
 * `DateInput` (string `dd/mm/aaaa`) — troca pontual, não uma substituição de todo campo de data do
 * sistema. Usa `Calendar` (shadcn/react-day-picker, instalado desde sempre e nunca usado até agora,
 * mesma situação do `Progress` antes da 11.5.8 e do `command.tsx` antes da 11.5.4).
 */
export function DatePicker({ value, onChange, placeholder = 'Selecionar data', className }: DatePickerProps) {
  const [open, setOpen] = useState(false)
  const selected = parseBrDateValue(value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={`w-full justify-start font-normal ${!value ? 'text-muted-foreground' : ''} ${className || ''}`}
        >
          <CalendarIcon className="w-4 h-4 mr-2 shrink-0" />
          {value || placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected}
          onSelect={(date) => {
            if (!date) return
            onChange(formatBrDate(date))
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
