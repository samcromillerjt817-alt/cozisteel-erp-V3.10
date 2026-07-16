'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { AsyncButton } from '@/components/domain/async-button'
import { CurrencyInput } from '@/components/form/currency-input'
import { PercentInput } from '@/components/form/percent-input'
import { PageHeader } from '@/components/platform/page-header'
import { useSettings } from './use-settings'

/**
 * Aba "Custeio" de Configurações (Fase 12, Subetapa 8, ADR-020) — as 2 únicas variáveis de política
 * decididas com o usuário: taxa única de mão de obra e percentual único de overhead, ambas globais
 * (nada por centro de trabalho/categoria, nada de apontamento manual ou CostCenter — decisões
 * resolvidas, ver ADR-020 Parte 5). Lidas por `CostingService` no momento da produção de cada lote;
 * mudar aqui nunca recalcula lotes já produzidos (mesma imutabilidade de `materialCost`).
 */
export function CusteioTab() {
  const { settings, setSettings, loading, saving, save } = useSettings()

  return (
    <div className="space-y-4">
      <PageHeader
        title="Custeio de Produção"
        description="Taxa de mão de obra e percentual de overhead usados no custo padrão de cada lote produzido. Alterar aqui não recalcula lotes já produzidos."
      />
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {[1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      ) : (
        <>
          <Card><CardContent className="p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <Label>Taxa de Mão de Obra (R$/hora)</Label>
                <CurrencyInput
                  value={parseFloat(settings['custeio.laborRatePerHour'] || '0')}
                  onChange={(v) => setSettings({ ...settings, 'custeio.laborRatePerHour': String(v) })}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Overhead (% sobre custo de material)</Label>
                <PercentInput
                  value={parseFloat(settings['custeio.overheadPercent'] || '0')}
                  onChange={(v) => setSettings({ ...settings, 'custeio.overheadPercent': String(v) })}
                />
              </div>
            </div>
          </CardContent></Card>
          <div className="flex justify-end">
            <AsyncButton onClick={save} loading={saving}>Salvar Configurações</AsyncButton>
          </div>
        </>
      )}
    </div>
  )
}
