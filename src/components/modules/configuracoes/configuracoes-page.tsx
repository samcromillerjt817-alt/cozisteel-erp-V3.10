'use client'

import { EmpresaTab } from './empresa-tab'
import { NumeracaoTab } from './numeracao-tab'
import { PdfTab } from './pdf-tab'
import { CusteioTab } from './custeio-tab'
import { SistemaTab } from './sistema-tab'
import { AtualizacoesTab } from './atualizacoes-tab'
import { DiagnosticoTab } from './diagnostico-tab'
import { ConsoleTab } from './console-tab'
import { CorrecoesTab } from './correcoes-tab'

export type ConfigSubModule = 'empresa' | 'numeracao' | 'pdf' | 'custeio' | 'sistema' | 'atualizacoes' | 'diagnostico' | 'console' | 'correcoes'

interface ConfiguracoesPageProps {
  /** Qual sub-aba mostrar — a navegação em si (os links) continua na barra lateral em `page.tsx`,
   * fora da área de conteúdo (é shell de navegação, Subetapa 11.5.10, não um dado deste módulo). */
  configSub: ConfigSubModule
  isAdmin: boolean
}

/**
 * Módulo Configurações (Fase 11.5, Subetapa 11.5.9 — normalização final: as 5 sub-abas no mesmo
 * padrão). Cada aba é autocontida — busca seus próprios dados, sem estado compartilhado entre elas
 * (nem entre Empresa e PDF, que agora buscam `settings` cada uma a sua vez, ver `use-settings.ts`).
 */
export function ConfiguracoesPage({ configSub, isAdmin }: ConfiguracoesPageProps) {
  switch (configSub) {
    case 'empresa':
      return <EmpresaTab />
    case 'numeracao':
      return <NumeracaoTab />
    case 'pdf':
      return <PdfTab />
    case 'custeio':
      return <CusteioTab />
    case 'sistema':
      return <SistemaTab />
    case 'atualizacoes':
      return <AtualizacoesTab isAdmin={isAdmin} />
    case 'diagnostico':
      return <DiagnosticoTab />
    case 'console':
      return isAdmin ? <ConsoleTab /> : <RestritoAdmin />
    case 'correcoes':
      return isAdmin ? <CorrecoesTab /> : <RestritoAdmin />
  }
}

function RestritoAdmin() {
  return <p className="text-sm text-muted-foreground p-6">Acesso restrito a administradores.</p>
}
