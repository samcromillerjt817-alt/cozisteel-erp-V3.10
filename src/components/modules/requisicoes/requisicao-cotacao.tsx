'use client'

import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { CurrencyInput } from '@/components/form/currency-input'
import { formatCurrency } from '@/lib/format'
import type { RequisitionRecord, NewQuoteDraft } from './types'

interface SupplierOption { id: string; corporateName: string; tradeName: string }

interface RequisicaoCotacaoProps {
  requisition: RequisitionRecord
  drafts: Record<string, NewQuoteDraft>
  onDraftChange: (itemId: string, patch: Partial<NewQuoteDraft>) => void
  onAddQuote: (itemId: string) => void
  onSelectQuote: (itemId: string, quoteId: string) => void
  suppliers: SupplierOption[]
}

/** Conteúdo de cotação dentro do `DetailDrawer` (Subetapa 11.5.8) — antes era um segundo `Dialog`
 * aninhado, aberto a partir da linha da tabela. Mesmo comportamento, mesma API de backend. */
export function RequisicaoCotacao({ requisition, drafts, onDraftChange, onAddQuote, onSelectQuote, suppliers }: RequisicaoCotacaoProps) {
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Registre o preço cotado com cada fornecedor para cada matéria-prima e selecione a cotação
        vencedora. Ao selecionar, o fornecedor e o preço são gravados no item — isso vira o Pedido de
        Compra ao avançar o status da requisição.
      </p>
      {requisition.items.map((item) => {
        const draft = drafts[item.id] || { supplierId: '', price: 0, leadTimeDays: 0 }
        return (
          <div key={item.id} className="border rounded-lg p-4 space-y-3">
            <div className="flex justify-between items-baseline">
              <h4 className="font-semibold">{item.material?.name}</h4>
              <span className="text-sm text-muted-foreground">Necessário: {item.quantity} {item.unit}</span>
            </div>

            {item.quotes.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhuma cotação registrada ainda.</p>
            ) : (
              <div className="space-y-1">
                {item.quotes.map((q) => (
                  <div key={q.id} className={`flex items-center justify-between text-sm rounded px-3 py-2 ${q.isSelected ? 'bg-emerald-50 border border-emerald-300' : 'bg-muted/50'}`}>
                    <span>
                      {q.supplier?.corporateName || q.supplier?.tradeName} — {formatCurrency(q.price)}
                      {q.leadTimeDays > 0 ? ` · ${q.leadTimeDays} dias` : ''}
                      {q.isSelected ? ' — ★ Vencedora' : ''}
                    </span>
                    {!q.isSelected && (
                      <Button size="sm" variant="outline" onClick={() => onSelectQuote(item.id, q.id)}>Selecionar</Button>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end pt-2 border-t">
              <div className="sm:col-span-2 space-y-1">
                <Label className="text-xs">Fornecedor</Label>
                <Select value={draft.supplierId || undefined} onValueChange={(v) => onDraftChange(item.id, { supplierId: v })}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.corporateName || s.tradeName}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Preço</Label>
                <CurrencyInput value={draft.price} onChange={(v) => onDraftChange(item.id, { price: v })} />
              </div>
              <div className="flex gap-1">
                <div className="space-y-1 flex-1">
                  <Label className="text-xs">Prazo (dias)</Label>
                  <Input type="number" value={draft.leadTimeDays || ''} onChange={(e) => onDraftChange(item.id, { leadTimeDays: parseInt(e.target.value) || 0 })} />
                </div>
                <Button size="sm" variant="outline" className="mb-0.5" onClick={() => onAddQuote(item.id)}>Adicionar</Button>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
