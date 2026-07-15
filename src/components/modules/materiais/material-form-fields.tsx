import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { UnitSelect } from '@/components/form/unit-select'
import { QuantityInput } from '@/components/form/quantity-input'
import { CurrencyInput } from '@/components/form/currency-input'
import type { MaterialFormData } from './types'

interface MaterialFormFieldsProps {
  form: MaterialFormData
  onChange: (form: MaterialFormData) => void
  categories: { id: string; name: string }[]
}

export function MaterialFormFields({ form, onChange, categories }: MaterialFormFieldsProps) {
  const set = <K extends keyof MaterialFormData>(key: K, value: MaterialFormData[K]) => onChange({ ...form, [key]: value })

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
      <div className="space-y-1.5"><Label>Código interno</Label><Input value={form.internalCode} onChange={(e) => set('internalCode', e.target.value)} /></div>
      <div className="space-y-1.5"><Label>Nome</Label><Input value={form.name} onChange={(e) => set('name', e.target.value)} /></div>
      <div className="space-y-1.5">
        <Label>Categoria</Label>
        <Select value={form.categoryId || undefined} onValueChange={(v) => set('categoryId', v)}>
          <SelectTrigger className="w-full"><SelectValue placeholder="Sem categoria" /></SelectTrigger>
          <SelectContent>{categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5"><Label>Unidade</Label><UnitSelect value={form.unit} onChange={(v) => set('unit', v)} /></div>
      <div className="space-y-1.5"><Label>Densidade (g/cm³)</Label><QuantityInput value={form.density} onChange={(v) => set('density', v)} /></div>
      <div className="space-y-1.5"><Label>Custo unitário</Label><CurrencyInput value={form.costPrice} onChange={(v) => set('costPrice', v)} /></div>
      <div className="space-y-1.5"><Label>Estoque atual</Label><QuantityInput value={form.stockQty} onChange={(v) => set('stockQty', v)} /></div>
      <div className="space-y-1.5"><Label>Estoque mínimo</Label><QuantityInput value={form.minStockQty} onChange={(v) => set('minStockQty', v)} /></div>
      <div className="space-y-1.5 sm:col-span-2"><Label>Descrição</Label><Textarea rows={2} value={form.description} onChange={(e) => set('description', e.target.value)} /></div>
      <div className="space-y-1.5 sm:col-span-2"><Label>Observações</Label><Textarea rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} /></div>
    </div>
  )
}
