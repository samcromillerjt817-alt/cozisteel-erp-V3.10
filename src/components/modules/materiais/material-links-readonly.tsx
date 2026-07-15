import { Label } from '@/components/ui/label'
import { formatCurrency } from '@/lib/format'
import type { MaterialSupplierLink, MaterialProductLink } from './types'

interface MaterialLinksReadonlyProps {
  suppliers: MaterialSupplierLink[]
  products: MaterialProductLink[]
}

// Painel somente-leitura de vínculos — Fornecedores/Produtos que referenciam esta matéria-prima. Não
// é um drill-down "pesado" (não edita nada aqui, só orienta onde editar) — fica dentro do próprio
// `FormDialog`, mesma decisão de escopo de `FornecedorMaterialLinks` (ADR-018 §6).
export function MaterialLinksReadonly({ suppliers, products }: MaterialLinksReadonlyProps) {
  return (
    <div className="border-t pt-4 mt-2 space-y-4">
      <div>
        <Label className="text-sm font-semibold">Fornecedores desta matéria-prima</Label>
        {suppliers.length === 0 ? (
          <p className="text-xs text-muted-foreground mt-1">Nenhum fornecedor vinculado ainda — vincule pela tela de Fornecedores.</p>
        ) : (
          <div className="space-y-1 mt-2">
            {suppliers.map((l) => (
              <div key={l.supplierId} className="flex items-center justify-between text-sm bg-muted/50 rounded px-3 py-1.5">
                <span>{l.supplier?.corporateName || l.supplier?.tradeName} — {formatCurrency(l.lastPrice)} {l.isPreferred ? '★ preferencial' : ''}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div>
        <Label className="text-sm font-semibold">Produtos que consomem esta matéria-prima</Label>
        {products.length === 0 ? (
          <p className="text-xs text-muted-foreground mt-1">Nenhum produto vinculado ainda — vincule pela tela de Produtos.</p>
        ) : (
          <div className="space-y-1 mt-2">
            {products.map((l) => (
              <div key={l.productId} className="flex items-center justify-between text-sm bg-muted/50 rounded px-3 py-1.5">
                <span>{l.product?.name} — {l.quantity} {l.unit}/un {l.scrapPct > 0 ? `(+${l.scrapPct}% perda)` : ''}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
