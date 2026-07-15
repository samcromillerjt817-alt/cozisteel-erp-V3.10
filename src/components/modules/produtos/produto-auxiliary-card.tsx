import { Package } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { AsyncButton } from '@/components/domain/async-button'

interface ProdutoAuxiliaryCardProps {
  categoryName: string
  categorySlug: string
  onCategoryNameChange: (v: string) => void
  onCategorySlugChange: (v: string) => void
  onSaveCategory: () => void
  savingCategory: boolean
  onGoToMateriais: () => void
}

// "Cadastros auxiliares" — cadastro rápido de categoria + atalho para Materiais. Fica ao lado da
// tabela (fora do `FormDialog`), mesma posição de antes desta migração.
export function ProdutoAuxiliaryCard({ categoryName, categorySlug, onCategoryNameChange, onCategorySlugChange, onSaveCategory, savingCategory, onGoToMateriais }: ProdutoAuxiliaryCardProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <Card>
        <CardHeader><CardTitle className="text-base">Cadastros auxiliares</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Nova categoria</Label>
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_120px] gap-2">
              <Input placeholder="Nome" value={categoryName} onChange={(e) => onCategoryNameChange(e.target.value)} />
              <Input placeholder="slug" value={categorySlug} onChange={(e) => onCategorySlugChange(e.target.value)} />
            </div>
            <AsyncButton size="sm" onClick={onSaveCategory} loading={savingCategory}>Salvar categoria</AsyncButton>
          </div>
          <div className="space-y-2">
            <Label>Matérias-primas</Label>
            <p className="text-sm text-muted-foreground">O cadastro completo de matéria-prima (estoque, custo, fornecedores) tem uma aba própria.</p>
            <Button size="sm" variant="outline" onClick={onGoToMateriais}><Package className="w-4 h-4 mr-1" /> Ir para Matérias-primas</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
