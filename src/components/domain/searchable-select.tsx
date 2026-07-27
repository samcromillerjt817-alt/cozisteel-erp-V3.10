'use client'

import { useEffect, useState } from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '@/components/ui/command'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { cn } from '@/lib/utils'

export interface SearchableSelectHit<T = unknown> {
  id: string
  label: string
  /** Registro bruto do catálogo (ex.: o `Client`/`Product` inteiro) — a busca já traz o objeto
   * completo, então quem seleciona pode preencher outros campos (CNPJ, endereço, etc.) sem precisar
   * de uma segunda chamada por id. */
  data: T
}

interface SearchableSelectProps<T = unknown> {
  value: string
  /** Texto de exibição do item já selecionado — o caller já guarda isso separadamente (ex.:
   * `form.clientName`), então o componente nunca precisa "adivinhar" o rótulo de algo fora da busca
   * atual (ADR-022, Fase UX-4, achado #08). */
  label: string
  onSelect: (hit: SearchableSelectHit<T>) => void
  /** Constrói a URL de busca a partir do termo já debounced — o componente não sabe nada sobre qual
   * catálogo está buscando. */
  searchUrl: (query: string) => string
  /** Extrai `{id, label, data}` da resposta bruta da API (cada catálogo tem um formato de linha
   * diferente). */
  parseResults: (json: unknown) => SearchableSelectHit<T>[]
  placeholder?: string
  emptyMessage?: string
  disabled?: boolean
}

/**
 * Combobox com busca server-side (ADR-022, Fase UX-4, achado #08) — os `<Select>` simples de
 * Cliente/Produto/Fornecedor/Ordem de Produção só listavam os primeiros registros (limite padrão de
 * paginação do backend), sem nenhuma forma de achar um item fora desse topo. Reaproveita o mesmo
 * `cmdk` já usado pelo `CommandPalette`, mas com busca própria por catálogo — `shouldFilter={false}`
 * porque a filtragem é sempre no servidor, nunca no cliente.
 */
export function SearchableSelect<T = unknown>({ value, label, onSelect, searchUrl, parseResults, placeholder = 'Buscar...', emptyMessage = 'Nenhum resultado encontrado', disabled }: SearchableSelectProps<T>) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebouncedValue(query)
  const [results, setResults] = useState<SearchableSelectHit<T>[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    fetch(searchUrl(debouncedQuery))
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => { if (!cancelled && json) setResults(parseResults(json)) })
      .catch(() => { if (!cancelled) setResults([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, debouncedQuery])

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setQuery('') }}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          <span className="truncate">{value && label ? label : placeholder}</span>
          <ChevronsUpDown className="w-4 h-4 opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder={placeholder} value={query} onValueChange={setQuery} />
          <CommandList>
            {loading ? (
              <div className="py-6 text-center text-sm text-muted-foreground">Buscando...</div>
            ) : (
              <>
                <CommandEmpty>{emptyMessage}</CommandEmpty>
                <CommandGroup>
                  {results.map((hit) => (
                    <CommandItem
                      key={hit.id}
                      value={hit.id}
                      onSelect={() => { onSelect(hit); setOpen(false); setQuery('') }}
                    >
                      <Check className={cn('mr-2 h-4 w-4', value === hit.id ? 'opacity-100' : 'opacity-0')} />
                      <span className="truncate">{hit.label}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
