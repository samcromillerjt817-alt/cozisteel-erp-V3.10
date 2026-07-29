interface DashboardHeaderProps {
  activeProfileLabel: string
}

/** Cabeçalho do Dashboard — antes era só um <h2>Dashboard</h2> solto. Título fixo + subtítulo
 * contextual (perfil ativo, mesmo rótulo já mostrado na aba selecionada) — nada inventado, só torna
 * explícito o que já era visível na aba ativa. */
export function DashboardHeader({ activeProfileLabel }: DashboardHeaderProps) {
  return (
    <div>
      <h2 className="text-2xl font-bold">Dashboard</h2>
      <p className="text-sm text-muted-foreground">{activeProfileLabel}</p>
    </div>
  )
}
