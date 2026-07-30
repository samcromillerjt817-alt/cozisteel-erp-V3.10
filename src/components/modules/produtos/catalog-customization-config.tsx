import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { CATALOG_CUSTOMIZATION_FIELDS, type CatalogCustomizationConfig, type CustomizationFieldMode } from './types'

interface CatalogCustomizationConfigFieldsProps {
  value: CatalogCustomizationConfig
  onChange: (value: CatalogCustomizationConfig) => void
}

const MODE_LABELS: Record<CustomizationFieldMode, string> = {
  livre: 'Livre',
  bloqueado: 'Bloqueado (usa o padrão do produto)',
  selecao: 'Seleção (lista de opções)',
}

/**
 * Um controle por campo de personalização do Catálogo Digital Público (ADR-026) — pra cada um dos 8
 * campos que o cliente pode preencher ao pedir um produto personalizado, o admin escolhe: Livre
 * (como sempre foi), Bloqueado (o cliente nem vê o campo — vale o valor padrão do produto) ou
 * Seleção (o cliente só escolhe entre as opções digitadas aqui, nunca texto livre). A validação de
 * verdade (impedir um valor fora da lista ou um campo bloqueado sendo burlado) acontece no servidor
 * (`catalog-request.service.ts`), isso aqui só configura a regra.
 */
export function CatalogCustomizationConfigFields({ value, onChange }: CatalogCustomizationConfigFieldsProps) {
  function setMode(field: string, mode: CustomizationFieldMode) {
    const current = value[field] || { mode: 'livre' as CustomizationFieldMode, options: [] }
    onChange({ ...value, [field]: { ...current, mode } })
  }

  function setOptionsText(field: string, text: string) {
    const current = value[field] || { mode: 'selecao' as CustomizationFieldMode, options: [] }
    const options = text.split(',').map((o) => o.trim()).filter(Boolean)
    onChange({ ...value, [field]: { ...current, options } })
  }

  return (
    <div className="space-y-3 sm:col-span-2">
      <Label className="text-sm font-medium text-muted-foreground">Personalização por campo</Label>
      <div className="space-y-2">
        {CATALOG_CUSTOMIZATION_FIELDS.map(({ key, label }) => {
          const fieldConfig = value[key] || { mode: 'livre' as CustomizationFieldMode, options: [] }
          return (
            <div key={key} className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-md border p-3">
              <span className="text-sm font-medium sm:w-40 shrink-0">{label}</span>
              <Select value={fieldConfig.mode} onValueChange={(v) => setMode(key, v as CustomizationFieldMode)}>
                <SelectTrigger className="w-full sm:w-56"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(MODE_LABELS) as CustomizationFieldMode[]).map((mode) => (
                    <SelectItem key={mode} value={mode}>{MODE_LABELS[mode]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fieldConfig.mode === 'selecao' && (
                <Input
                  className="flex-1"
                  placeholder="Opções separadas por vírgula (ex.: 120, 150, 180)"
                  value={fieldConfig.options.join(', ')}
                  onChange={(e) => setOptionsText(key, e.target.value)}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
