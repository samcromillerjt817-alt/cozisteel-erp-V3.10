import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { UnitSelect } from '@/components/form/unit-select'
import { QuantityInput } from '@/components/form/quantity-input'
import { CurrencyInput } from '@/components/form/currency-input'
import { PercentInput } from '@/components/form/percent-input'
import type { ProductFormData } from './types'

interface ProdutoFormFieldsProps {
  form: ProductFormData
  onChange: (form: ProductFormData) => void
  categories: { id: string; name: string }[]
  materials: { id: string; name: string }[]
}

export function ProdutoFormFields({ form, onChange, categories, materials }: ProdutoFormFieldsProps) {
  const set = <K extends keyof ProductFormData>(key: K, value: ProductFormData[K]) => onChange({ ...form, [key]: value })

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
      <div className="space-y-1.5"><Label>Código Interno</Label><Input value={form.internalCode} onChange={(e) => set('internalCode', e.target.value)} /></div>
      <div className="space-y-1.5"><Label>Nome</Label><Input value={form.name} onChange={(e) => set('name', e.target.value)} /></div>
      <div className="space-y-1 sm:col-span-2"><Label>Descrição</Label><Textarea rows={2} value={form.description} onChange={(e) => set('description', e.target.value)} /></div>
      <div className="space-y-1.5">
        <Label>Categoria</Label>
        <Select value={form.categoryId} onValueChange={(v) => set('categoryId', v)}>
          <SelectTrigger className="w-full"><SelectValue placeholder="Selecione" /></SelectTrigger>
          <SelectContent>{categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Material</Label>
        <Select value={form.materialId} onValueChange={(v) => set('materialId', v)}>
          <SelectTrigger className="w-full"><SelectValue placeholder="Selecione" /></SelectTrigger>
          <SelectContent>{materials.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5"><Label>Unidade</Label><UnitSelect value={form.unit} onChange={(v) => set('unit', v)} /></div>
      <div className="space-y-1.5"><Label>Preço Custo</Label><CurrencyInput value={form.costPrice} onChange={(v) => set('costPrice', v)} /></div>
      <div className="space-y-1.5"><Label>Preço Venda</Label><CurrencyInput value={form.salePrice} onChange={(v) => set('salePrice', v)} /></div>
      <div className="space-y-1.5"><Label>Peso (kg)</Label><QuantityInput value={form.weight} onChange={(v) => set('weight', v)} /></div>
      <div className="space-y-1.5"><Label>Largura (cm)</Label><QuantityInput value={form.width} onChange={(v) => set('width', v)} /></div>
      <div className="space-y-1.5"><Label>Altura (cm)</Label><QuantityInput value={form.height} onChange={(v) => set('height', v)} /></div>
      <div className="space-y-1.5"><Label>Comprimento (cm)</Label><QuantityInput value={form.length} onChange={(v) => set('length', v)} /></div>
      <div className="space-y-1.5"><Label>Espessura (mm)</Label><QuantityInput value={form.thickness} onChange={(v) => set('thickness', v)} /></div>
      <div className="space-y-1.5"><Label>NCM</Label><Input value={form.ncm} onChange={(e) => set('ncm', e.target.value)} /></div>
      <div className="space-y-1.5"><Label>IPI</Label><PercentInput value={form.ipi} onChange={(v) => set('ipi', v)} /></div>
      <div className="space-y-1.5"><Label>ICMS</Label><PercentInput value={form.icms} onChange={(v) => set('icms', v)} /></div>
      <div className="space-y-1.5"><Label>Acabamento</Label><Input value={form.finish} onChange={(e) => set('finish', e.target.value)} /></div>
      <div className="space-y-1.5"><Label>Família</Label><Input value={form.family} onChange={(e) => set('family', e.target.value)} /></div>
      <div className="space-y-1.5"><Label>Linha</Label><Input value={form.line} onChange={(e) => set('line', e.target.value)} /></div>
      <div className="space-y-1 sm:col-span-2"><Label>Observações</Label><Textarea rows={3} value={form.notes} onChange={(e) => set('notes', e.target.value)} /></div>
    </div>
  )
}
