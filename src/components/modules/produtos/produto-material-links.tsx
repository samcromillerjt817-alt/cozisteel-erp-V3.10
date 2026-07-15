import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { QuantityInput } from '@/components/form/quantity-input'
import { UnitSelect } from '@/components/form/unit-select'
import { PercentInput } from '@/components/form/percent-input'
import type { ProductMaterialLink } from './types'

interface ProdutoMaterialLinksProps {
  links: ProductMaterialLink[]
  materialsFull: { id: string; name: string }[]
  onLink: (data: { materialId: string; quantity: number; unit: string; scrapPct: number }) => void
  onUnlink: (materialId: string) => void
}

// Receita de consumo (BOM simples) — matérias-primas consumidas pelo produto. Drill-down leve dentro
// do `FormDialog`, mesmo tratamento de `FornecedorMaterialLinks` (ADR-018 §6).
export function ProdutoMaterialLinks({ links, materialsFull, onLink, onUnlink }: ProdutoMaterialLinksProps) {
  const [materialId, setMaterialId] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [unit, setUnit] = useState('KG')
  const [scrapPct, setScrapPct] = useState(0)

  function handleLink() {
    if (!materialId) return
    onLink({ materialId, quantity, unit, scrapPct })
    setMaterialId('')
    setQuantity(1)
    setUnit('KG')
    setScrapPct(0)
  }

  return (
    <div className="border-t pt-4 mt-2 space-y-3">
      <Label className="text-sm font-semibold">Matérias-primas consumidas (receita)</Label>
      {links.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhuma matéria-prima vinculada ainda.</p>
      ) : (
        <div className="space-y-1.5">
          {links.map((l) => (
            <div key={l.materialId} className="flex items-center justify-between text-sm bg-muted/50 rounded px-3 py-1.5">
              <span>{l.material?.name} — {l.quantity} {l.unit} {l.scrapPct > 0 ? `(+${l.scrapPct}% perda)` : ''}</span>
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
        <div className="space-y-1.5"><Label className="text-xs">Qtd</Label><QuantityInput value={quantity} onChange={setQuantity} /></div>
        <div className="space-y-1.5"><Label className="text-xs">Unidade</Label><UnitSelect value={unit} onChange={setUnit} /></div>
        <div className="space-y-1.5"><Label className="text-xs">% Perda</Label><PercentInput value={scrapPct} onChange={setScrapPct} /></div>
      </div>
      <Button size="sm" variant="outline" onClick={handleLink}>Vincular matéria-prima</Button>
    </div>
  )
}
