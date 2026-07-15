// Módulo Materiais (Fase 11.5, Subetapa 11.5.7 — propagação do template; filtro mais rico da
// auditoria original: busca + categoria + checkbox de estoque baixo).

export interface MaterialSupplierLink {
  supplierId: string
  lastPrice: number
  isPreferred: boolean
  supplier?: { corporateName: string; tradeName: string }
}

export interface MaterialProductLink {
  productId: string
  quantity: number
  unit: string
  scrapPct: number
  product?: { name: string }
}

export interface MaterialListRow {
  id: string
  internalCode: string
  name: string
  categoryId: string
  category?: { name: string } | null
  stockQty: number
  minStockQty: number
  costPrice: number
  unit: string
  _count?: { suppliers: number; products: number }
}

export interface MaterialRecord extends MaterialListRow {
  density: number
  description: string
  notes: string
  active: boolean
  suppliers: MaterialSupplierLink[]
  productMaterials: MaterialProductLink[]
}

export interface MaterialFormData {
  internalCode: string
  name: string
  categoryId: string
  density: number
  description: string
  unit: string
  stockQty: number
  minStockQty: number
  costPrice: number
  notes: string
}

export const EMPTY_MATERIAL_FORM: MaterialFormData = {
  internalCode: '', name: '', categoryId: '', density: 0, description: '', unit: 'KG',
  stockQty: 0, minStockQty: 0, costPrice: 0, notes: '',
}

export function materialToFormData(material: MaterialRecord): MaterialFormData {
  return {
    internalCode: material.internalCode || '',
    name: material.name || '',
    categoryId: material.categoryId || '',
    density: material.density || 0,
    description: material.description || '',
    unit: material.unit || 'KG',
    stockQty: material.stockQty || 0,
    minStockQty: material.minStockQty || 0,
    costPrice: material.costPrice || 0,
    notes: material.notes || '',
  }
}
