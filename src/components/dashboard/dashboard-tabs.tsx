'use client'

import { useState } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { DashboardProfileView } from '@/components/dashboard/dashboard-profile-view'
import { DashboardDiretoriaView } from '@/components/dashboard/dashboard-diretoria-view'
import { getAccessibleProfiles } from '@/app/services/dashboard-access.service'
import type { DashboardProfile } from '@/app/services/dashboard-types'

const PROFILE_LABELS: Record<DashboardProfile, string> = {
  diretoria: 'Diretoria',
  comercial: 'Comercial',
  pcp: 'PCP',
  compras: 'Compras',
  producao: 'Produção',
  estoque: 'Estoque',
  administrativo: 'Administrativo',
  financeiro: 'Financeiro',
}

/**
 * Abas por perfil do novo Dashboard (Fase 11, ADR-017, Subetapa 7) — **totalmente dirigidas pelo
 * registry** (`getAccessibleProfiles`, `dashboard-access.service.ts`, já construído na Subetapa 1):
 * nenhuma lista fixa de perfis aqui. Um perfil novo, ou uma mudança na composição perfil→Role,
 * aparece automaticamente sem tocar este componente.
 */
export function DashboardTabs({ role, onNavigate }: { role: string; onNavigate: (moduleKey: string) => void }) {
  const profiles = getAccessibleProfiles(role)
  const [active, setActive] = useState<DashboardProfile | undefined>(profiles[0])

  if (profiles.length === 0) {
    return <p className="text-muted-foreground text-center py-12">Nenhum dashboard disponível para o seu perfil de acesso</p>
  }

  return (
    <Tabs value={active} onValueChange={(value) => setActive(value as DashboardProfile)}>
      {/* ADR-019 §5 (QA responsivo, Subetapa 7.6) — admin/manager veem até 8 perfis; `TabsList` nunca
          quebra linha (`w-fit`), então em mobile isso rolava a PÁGINA INTEIRA na horizontal (o `<main>`
          tem `overflow-auto`). Rolagem contida só na faixa de abas, resto da tela intocado. */}
      <div className="overflow-x-auto -mx-1 px-1">
        <TabsList>
          {profiles.map((profile) => (
            <TabsTrigger key={profile} value={profile}>
              {PROFILE_LABELS[profile]}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {profiles.map((profile) => (
        <TabsContent key={profile} value={profile} className="mt-4">
          {profile === 'diretoria' ? (
            <DashboardDiretoriaView onNavigate={onNavigate} />
          ) : (
            <DashboardProfileView profile={profile} onNavigate={onNavigate} />
          )}
        </TabsContent>
      ))}
    </Tabs>
  )
}
