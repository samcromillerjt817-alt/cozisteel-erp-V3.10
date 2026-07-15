'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem, CommandShortcut } from '@/components/ui/command'

export interface CommandPaletteItem {
  id: string
  label: string
  icon?: ReactNode
  keywords?: string[]
  shortcut?: string
  onSelect: () => void
}

export interface CommandPaletteGroup {
  heading: string
  items: CommandPaletteItem[]
}

interface CommandPaletteProps {
  groups: CommandPaletteGroup[]
  /** Controlado opcionalmente (ex.: abrir por um botão no header) — sem isso, o próprio componente
   * gerencia seu estado de aberto/fechado. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  placeholder?: string
  /** Notifica o texto digitado, sem o CommandPalette saber o que fazer com ele — quem monta decide se
   * busca dado externo (ex.: busca global, Subetapa 11.5.5) a partir daqui. Aditivo à API da 11.5.4,
   * nenhum consumidor existente precisa mudar. */
  onQueryChange?: (query: string) => void
}

// CommandPalette — componente de PLATAFORMA (Fase 11.5, Subetapa 11.5.4). Wrapper sobre `command.tsx`
// (primitivo shadcn/cmdk já instalado no projeto e nunca usado até agora — achado da auditoria
// original). Responsabilidade única: abrir com Cmd/Ctrl+K (ou controlado externamente) e listar
// comandos agrupados fornecidos por quem o monta — não sabe de onde vêm os comandos nem para onde
// navegam (`onSelect` é decidido inteiramente por fora, mantendo a componibilidade do ADR-018 §0.1).
// Escopo desta subetapa: só ações de navegação (nenhuma busca de dado ainda — isso é uma evolução
// futura, quando a busca global for construída).
export function CommandPalette({ groups, open, onOpenChange, placeholder = 'Digite um comando ou busque um módulo...', onQueryChange }: CommandPaletteProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const isOpen = open ?? uncontrolledOpen
  const setOpen = onOpenChange ?? setUncontrolledOpen

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setOpen(!isOpen)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, setOpen])

  return (
    <CommandDialog open={isOpen} onOpenChange={setOpen} title="Busca rápida" description={placeholder}>
      <CommandInput placeholder={placeholder} onValueChange={onQueryChange} />
      <CommandList>
        <CommandEmpty>Nenhum resultado encontrado.</CommandEmpty>
        {groups.map((group) => (
          <CommandGroup key={group.heading} heading={group.heading}>
            {group.items.map((item) => (
              <CommandItem
                key={item.id}
                value={item.label}
                keywords={item.keywords}
                onSelect={() => {
                  item.onSelect()
                  setOpen(false)
                }}
              >
                {item.icon}
                {item.label}
                {item.shortcut && <CommandShortcut>{item.shortcut}</CommandShortcut>}
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  )
}
