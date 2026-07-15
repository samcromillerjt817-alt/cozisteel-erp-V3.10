import { ShieldCheck, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import type { ProductImage } from './types'

interface ProdutoImagesProps {
  images: ProductImage[]
  uploading: boolean
  onUpload: (file: File) => void
  onSetPrimary: (imageId: string) => void
  onDelete: (imageId: string) => void
}

// Gestão de imagens do produto — específica do domínio, vive dentro do `FormDialog` (drill-down leve,
// mesma decisão de escopo de `FornecedorMaterialLinks`/`MaterialLinksReadonly`).
export function ProdutoImages({ images, uploading, onUpload, onSetPrimary, onDelete }: ProdutoImagesProps) {
  return (
    <div className="border-t pt-4 mt-2 space-y-3">
      <Label className="text-sm font-semibold">Imagens do produto</Label>
      {images.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhuma imagem enviada ainda.</p>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
          {images.map((img) => (
            <div key={img.id} className="relative group border rounded-lg overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/uploads/${img.url}`} alt="" className="w-full h-24 object-cover" />
              {img.isPrimary && <Badge className="absolute top-1 left-1 text-[10px] bg-emerald-600">Principal</Badge>}
              {/* Subetapa 11.5.11 (QA responsivo): visível por padrão até `sm` — toque não tem estado
                  de hover, então "opacity-0 até passar o mouse" deixava as ações de imagem
                  inalcançáveis em celular/tablet. Acima de `sm`, comportamento de hover original. */}
              <div className="absolute inset-0 bg-black/50 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                {!img.isPrimary && (
                  <Button size="icon" variant="secondary" className="h-7 w-7" onClick={() => onSetPrimary(img.id)} title="Definir como principal"><ShieldCheck className="w-3.5 h-3.5" /></Button>
                )}
                <Button size="icon" variant="destructive" className="h-7 w-7" onClick={() => onDelete(img.id)} title="Remover"><Trash2 className="w-3.5 h-3.5" /></Button>
              </div>
            </div>
          ))}
        </div>
      )}
      <div>
        <input
          type="file" accept="image/jpeg,image/png,image/webp,image/gif"
          id="product-image-upload" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); e.target.value = '' }}
        />
        <Button size="sm" variant="outline" disabled={uploading} onClick={() => document.getElementById('product-image-upload')?.click()}>
          {uploading ? 'Enviando...' : 'Enviar imagem'}
        </Button>
      </div>
    </div>
  )
}
