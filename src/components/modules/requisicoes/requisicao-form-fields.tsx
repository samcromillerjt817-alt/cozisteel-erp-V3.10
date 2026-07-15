'use client'

import { Plus, Trash2 } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { DatePicker } from '@/components/form/date-picker'
import { QuantityInput } from '@/components/form/quantity-input'
import { UnitSelect } from '@/components/form/unit-select'
import { CurrencyInput } from '@/components/form/currency-input'
import type { RequisitionFormData, RequisitionItemInput } from './types'
import { EMPTY_REQUISITION_ITEM } from './types'

interface ProductionOrderOption { id: string; number: string; productName: string }
interface MaterialOption { id: string; name: string }
interface SupplierOption { id: string; corporateName: string; tradeName: string }

interface RequisicaoFormFieldsProps {
  form: RequisitionFormData
  onChange: (form: RequisitionFormData) => void
  productionOrders: ProductionOrderOption[]
  materialsFull: MaterialOption[]
  suppliers: SupplierOption[]
  onSuggestFromProductionOrder: (productionOrderId: string) => void
}

/** Campos do formulário de criação de Requisição — específico do domínio (linhas de item + sugestão
 * automática a partir de uma OP), não nasce em `platform`. */
export function RequisicaoFormFields({ form, onChange, productionOrders, materialsFull, suppliers, onSuggestFromProductionOrder }: RequisicaoFormFieldsProps) {
  function addItem() {
    onChange({ ...form, items: [...form.items, EMPTY_REQUISITION_ITEM()] })
  }
  function removeItem(idx: number) {
    onChange({ ...form, items: form.items.filter((_, i) => i !== idx) })
  }
  function updateItem(idx: number, patch: Partial<RequisitionItemInput>) {
    onChange({ ...form, items: form.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)) })
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="space-y-1.5">
          <Label>Gerar a partir de uma OP (opcional)</Label>
          <Select value={form.productionOrderId} onValueChange={onSuggestFromProductionOrder}>
            <SelectTrigger className="w-full"><SelectValue placeholder="Selecione uma Ordem de Produção" /></SelectTrigger>
            <SelectContent>{productionOrders.map((po) => <SelectItem key={po.id} value={po.id}>{po.number} — {po.productName}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Necessário até</Label>
          <DatePicker value={form.neededBy} onChange={(v) => onChange({ ...form, neededBy: v })} />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label>Observações</Label>
          <Textarea rows={2} value={form.notes} onChange={(e) => onChange({ ...form, notes: e.target.value })} />
        </div>
      </div>

      <div className="border-t pt-4 mt-2 space-y-3">
        <Label className="text-sm font-semibold">Itens</Label>
        {form.items.map((item, idx) => (
          <div key={idx} className="grid grid-cols-2 sm:grid-cols-6 gap-2 items-end border rounded p-2">
            <div className="sm:col-span-2 space-y-1.5">
              <Label className="text-xs">Matéria-prima</Label>
              <Select value={item.materialId} onValueChange={(v) => updateItem(idx, { materialId: v })}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{materialsFull.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Qtd</Label><QuantityInput value={item.quantity} onChange={(v) => updateItem(idx, { quantity: v })} /></div>
            <div className="space-y-1.5"><Label className="text-xs">Unid.</Label><UnitSelect value={item.unit} onChange={(v) => updateItem(idx, { unit: v })} /></div>
            <div className="space-y-1.5">
              <Label className="text-xs">Fornecedor</Label>
              <Select value={item.supplierId || undefined} onValueChange={(v) => updateItem(idx, { supplierId: v })}>
                <SelectTrigger className="w-full"><SelectValue placeholder="A definir" /></SelectTrigger>
                <SelectContent>{suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.corporateName || s.tradeName}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="flex gap-1">
              <div className="space-y-1 flex-1"><Label className="text-xs">Preço est.</Label><CurrencyInput value={item.estimatedPrice} onChange={(v) => updateItem(idx, { estimatedPrice: v })} /></div>
              <Button variant="ghost" size="icon" className="mb-0.5" onClick={() => removeItem(idx)} title="Remover item"><Trash2 className="w-4 h-4 text-destructive" /></Button>
            </div>
          </div>
        ))}
        <Button size="sm" variant="outline" onClick={addItem}><Plus className="w-4 h-4 mr-1" /> Adicionar item</Button>
      </div>
    </div>
  )
}
