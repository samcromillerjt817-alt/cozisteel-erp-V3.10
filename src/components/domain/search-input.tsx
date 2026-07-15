import type { KeyboardEventHandler } from 'react'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'

interface SearchInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  wrapperClassName?: string
  inputClassName?: string
  onKeyDown?: KeyboardEventHandler<HTMLInputElement>
}

/** Campo de busca com ícone padrão de toda tela de listagem (Fase 13, Lote 6, ADR-015). */
export function SearchInput({
  value,
  onChange,
  placeholder = 'Buscar...',
  wrapperClassName = 'relative',
  inputClassName = 'pl-9 w-48',
  onKeyDown,
}: SearchInputProps) {
  return (
    <div className={wrapperClassName}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
      <Input placeholder={placeholder} className={inputClassName} value={value} onChange={e => onChange(e.target.value)} onKeyDown={onKeyDown} />
    </div>
  )
}
