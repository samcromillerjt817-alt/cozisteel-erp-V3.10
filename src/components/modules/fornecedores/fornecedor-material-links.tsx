import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { CurrencyInput } from '@/components/form/currency-input'
import { formatCurrency } from '@/lib/format'
import type { SupplierMaterialLink } from './types'

interface FornecedorMaterialLinksProps {
  links: SupplierMaterialLink[]
  materialsFull: { id: string; name: string }[]
  onLink: (data: { materialId: string; lastPrice: number; leadTimeDays: number; isPreferred: boolean }) => void
  onUnlink: (materialId: string) => void
}

// Vínculo de matérias-primas fornecidas — específico do domínio Fornecedor, vive dentro do
// `FormDialog` (não é um drill-down "pesado" o suficiente para justificar `DetailDrawer` nesta fase —
// ver ADR-018 §6, Subetapa 11.5.8 reserva isso para Requisições/Compras/Produção).
export function FornecedorMaterialLinks({ links, materialsFull, onLink, onUnlink }: FornecedorMaterialLinksProps) {
  const [materialId, setMaterialId] = useState('')
  const [lastPrice, setLastPrice] = useState(0)
  const [leadTimeDays, setLeadTimeDays] = useState(0)
  const [isPreferred, setIsPreferred] = useState(false)

  function handleLink() {
    if (!materialId) return
    onLink({ materialId, lastPrice, leadTimeDays, isPreferred })
    setMaterialId('')
    setLastPrice(0)
    setLeadTimeDays(0)
    setIsPreferred(false)
  }

  return (
    <div className="border-t pt-4 mt-2 space-y-3">
      <Label className="text-sm font-semibold">Matérias-primas fornecidas</Label>
      {links.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhuma matéria-prima vinculada ainda.</p>
      ) : (
        <div className="space-y-1.5">
          {links.map((l) => (
            <div key={l.materialId} className="flex items-center justify-between text-sm bg-muted/50 rounded px-3 py-1.5">
              <span>{l.material?.name} — {formatCurrency(l.lastPrice)} {l.isPreferred ? '★ preferencial' : ''}</span>
              <Button variant="ghost" size="icon" onClick={() => onUnlink(l.materialId)} title="Remover"><Trash2 className="w-4 h-4 text-destructive" /></Button>
            </div>
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 items-end">
        <div className="sm:col-span-2 space-y-1.5">
          <Label className="text-xs">Matéria-prima</Label>
          <Select value={materialId} onValueChange={setMaterialId}>
            <SelectTrigger className="w-full"><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>{materialsFull.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5"><Label className="text-xs">Preço</Label><CurrencyInput value={lastPrice} onChange={setLastPrice} /></div>
        <div className="space-y-1.5"><Label className="text-xs">Prazo (dias)</Label><Input type="number" value={leadTimeDays} onChange={(e) => setLeadTimeDays(parseInt(e.target.value) || 0)} /></div>
        <div className="flex items-center gap-2 pb-2">
          <input type="checkbox" id="pref" checked={isPreferred} onChange={(e) => setIsPreferred(e.target.checked)} />
          <Label htmlFor="pref" className="text-xs">Preferencial</Label>
        </div>
      </div>
      <Button size="sm" variant="outline" onClick={handleLink}>Vincular matéria-prima</Button>
    </div>
  )
}
