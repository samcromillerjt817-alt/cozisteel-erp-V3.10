'use client'

import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { QuantityInput } from '@/components/form/quantity-input'
import { UnitSelect } from '@/components/form/unit-select'
import { PRIORITY_LABELS, type ProductionOrderFormData } from './types'

interface ProductOption { id: string; name: string }
interface SalesOrderOption { id: string; number: string; clientName: string; items?: { id: string; description: string; quantity: number; unit: string; productId: string | null }[] }

interface ProducaoFormFieldsProps {
  form: ProductionOrderFormData
  onChange: (form: ProductionOrderFormData) => void
  products: ProductOption[]
  salesOrders: SalesOrderOption[]
  isEditing: boolean
  selectedSalesOrderId: string
  onSelectedSalesOrderChange: (id: string) => void
  onPickSalesOrderItem: (salesOrderId: string, itemId: string) => void
}

/** Campos do formulário de criar/editar Ordem de Produção — específico do domínio. Status não é mais
 * um campo aqui (Subetapa 11.5.8): a transição de status e o registro de produção parcial vivem no
 * `DetailDrawer`, mesma decisão de unificação já aplicada em Compras/Requisições. */
export function ProducaoFormFields({ form, onChange, products, salesOrders, isEditing, selectedSalesOrderId, onSelectedSalesOrderChange, onPickSalesOrderItem }: ProducaoFormFieldsProps) {
  return (
    <div className="space-y-4">
      {!isEditing && (
        <div className="border rounded-lg p-3 space-y-2 bg-muted/30">
          <Label className="text-xs font-semibold">Gerar a partir do Pedido de Venda (opcional)</Label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Select value={selectedSalesOrderId || undefined} onValueChange={onSelectedSalesOrderChange}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Selecione um Pedido de Venda" /></SelectTrigger>
              <SelectContent>{salesOrders.map((so) => <SelectItem key={so.id} value={so.id}>{so.number} — {so.clientName}</SelectItem>)}</SelectContent>
            </Select>
            {selectedSalesOrderId && (
              <Select onValueChange={(v) => onPickSalesOrderItem(selectedSalesOrderId, v)}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Selecione o item/produto" /></SelectTrigger>
                <SelectContent>
                  {(salesOrders.find((s) => s.id === selectedSalesOrderId)?.items || []).map((item) => (
                    <SelectItem key={item.id} value={item.id}>{item.description} (qtd {item.quantity})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="space-y-1.5">
          <Label>Produto</Label>
          <Select value={form.productId} onValueChange={(v) => onChange({ ...form, productId: v, productName: products.find((p) => p.id === v)?.name || '' })}>
            <SelectTrigger className="w-full"><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>{products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5"><Label>Quantidade</Label><QuantityInput min={0.01} value={form.quantity} onChange={(v) => onChange({ ...form, quantity: v })} /></div>
        <div className="space-y-1.5"><Label>Unidade</Label><UnitSelect value={form.unit} onChange={(v) => onChange({ ...form, unit: v })} /></div>
        <div className="space-y-1.5">
          <Label>Prioridade</Label>
          <Select value={form.priority} onValueChange={(v) => onChange({ ...form, priority: v })}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>{Object.entries(PRIORITY_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5"><Label>Data</Label><Input type="date" value={form.date} onChange={(e) => onChange({ ...form, date: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>Prazo</Label><Input type="date" value={form.dueDate} onChange={(e) => onChange({ ...form, dueDate: e.target.value })} /></div>
        <div className="space-y-1 sm:col-span-2"><Label>Descrição</Label><Textarea rows={2} value={form.description} onChange={(e) => onChange({ ...form, description: e.target.value })} /></div>
        <div className="space-y-1 sm:col-span-2"><Label>Observações</Label><Textarea rows={3} value={form.notes} onChange={(e) => onChange({ ...form, notes: e.target.value })} /></div>
      </div>
    </div>
  )
}
