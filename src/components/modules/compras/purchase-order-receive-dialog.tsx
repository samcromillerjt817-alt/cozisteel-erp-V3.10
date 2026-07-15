'use client'

import { FormDialog } from '@/components/domain/form-dialog'
import { Label } from '@/components/ui/label'
import { QuantityInput } from '@/components/form/quantity-input'
import type { PurchaseOrderRecord } from './types'

interface PurchaseOrderReceiveDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  purchaseOrder: PurchaseOrderRecord | null
  quantities: Record<string, number>
  onQuantityChange: (itemId: string, value: number) => void
  onConfirm: () => void
  saving: boolean
}

/** Extraído do bloco inline de `page.tsx` (Subetapa 11.5.8) — mesmo comportamento, agora reutilizável
 * como o disparo tanto da ação rápida na linha da tabela quanto de dentro do `DetailDrawer`. */
export function PurchaseOrderReceiveDialog({ open, onOpenChange, purchaseOrder, quantities, onQuantityChange, onConfirm, saving }: PurchaseOrderReceiveDialogProps) {
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Receber Pedido de Compra — ${purchaseOrder?.number || ''}`}
      maxWidth="sm:max-w-2xl"
      onSave={onConfirm}
      saving={saving}
      saveLabel="Confirmar Recebimento"
    >
      {purchaseOrder && (
        <div className="space-y-3">
          {purchaseOrder.items.map((item) => {
            const outstanding = Math.max(0, item.quantity - item.quantityReceived)
            return (
              <div key={item.id} className="grid grid-cols-2 sm:grid-cols-5 gap-2 items-end border rounded p-2">
                <div className="sm:col-span-2">
                  <Label className="text-xs">Matéria-prima</Label>
                  <p className="text-sm font-medium">{item.material?.name}</p>
                </div>
                <div><Label className="text-xs">Qtd Pedida</Label><p className="text-sm">{item.quantity} {item.unit}</p></div>
                <div><Label className="text-xs">Já Recebida</Label><p className="text-sm">{item.quantityReceived} {item.unit}</p></div>
                <div className="space-y-1">
                  <Label className="text-xs">Qtd a Receber</Label>
                  <QuantityInput
                    max={outstanding}
                    value={quantities[item.id] ?? outstanding}
                    onChange={(v) => onQuantityChange(item.id, v)}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </FormDialog>
  )
}
