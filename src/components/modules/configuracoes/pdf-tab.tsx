'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { AsyncButton } from '@/components/domain/async-button'
import { PageHeader } from '@/components/platform/page-header'
import { useSettings } from './use-settings'

/** Aba "PDF" de Configurações — mesmo `SystemSetting` de Empresa, aba independente (Subetapa
 * 11.5.9) — corrige o bug em que esta aba só "funcionava" porque Empresa sempre carregava primeiro. */
export function PdfTab() {
  const { settings, setSettings, saving, save } = useSettings()

  return (
    <div className="space-y-4">
      <PageHeader title="Configuração de PDF" />
      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="space-y-1.5">
            <Label>Título do Documento</Label>
            <Input value={settings.pdfTitle || ''} onChange={(e) => setSettings({ ...settings, pdfTitle: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Rodapé</Label>
            <Textarea rows={3} value={settings.pdfFooter || ''} onChange={(e) => setSettings({ ...settings, pdfFooter: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Termos e Condições Gerais</Label>
            <Textarea rows={4} value={settings.pdfTerms || ''} onChange={(e) => setSettings({ ...settings, pdfTerms: e.target.value })} />
          </div>
          <div className="flex justify-end">
            <AsyncButton onClick={save} loading={saving}>Salvar</AsyncButton>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
