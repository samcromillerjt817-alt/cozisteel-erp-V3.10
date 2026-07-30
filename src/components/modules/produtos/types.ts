// Módulo Produtos (Fase 11.5, Subetapa 11.5.7 — propagação do template; o mais complexo dos 4 —
// imagens + BOM/matérias-primas consumidas).

export interface ProductImage {
  id: string
  url: string
  isPrimary: boolean
}

export interface ProductMaterialLink {
  materialId: string
  quantity: number
  unit: string
  scrapPct: number
  material?: { name: string }
}

export interface ProductListRow {
  id: string
  internalCode: string
  name: string
  salePrice: number
  weight: number
  category?: { name: string } | null
  images?: ProductImage[]
}

// Controle por campo de personalização do Catálogo Digital Público (ADR-026) — pedido do usuário
// pra impedir valor absurdo (ex.: largura de 100m): admin escolhe, por campo, se o cliente pode
// digitar livre, se o campo fica travado no padrão do produto, ou se só pode escolher entre opções
// pré-cadastradas. Ausência de entrada pra um campo = 'livre' (comportamento de sempre).
export type CustomizationFieldMode = 'livre' | 'bloqueado' | 'selecao'
export interface CustomizationFieldConfig {
  mode: CustomizationFieldMode
  options: string[]
}
export const CATALOG_CUSTOMIZATION_FIELDS: { key: string; label: string }[] = [
  { key: 'width', label: 'Largura' },
  { key: 'height', label: 'Altura' },
  { key: 'length', label: 'Comprimento' },
  { key: 'material', label: 'Material' },
  { key: 'finish', label: 'Acabamento' },
  { key: 'voltage', label: 'Voltagem' },
  { key: 'operationSide', label: 'Lado de operação' },
  { key: 'accessories', label: 'Acessórios' },
]
export type CatalogCustomizationConfig = Record<string, CustomizationFieldConfig>

export interface ProductFormData {
  internalCode: string
  name: string
  description: string
  categoryId: string
  materialId: string
  unit: string
  costPrice: number
  salePrice: number
  width: number
  height: number
  length: number
  thickness: number
  weight: number
  ncm: string
  ipi: number
  icms: number
  finish: string
  family: string
  line: string
  notes: string
  // Catálogo Digital Público (ADR-026) — nada aparece publicamente até showInCatalog ser marcado.
  showInCatalog: boolean
  catalogOrder: number
  catalogFeatured: boolean
  catalogDescription: string
  catalogPriceMode: string
  catalogAllowCustomization: boolean
  catalogCustomizationConfig: CatalogCustomizationConfig
}

export const EMPTY_PRODUCT_FORM: ProductFormData = {
  internalCode: '', name: '', description: '', categoryId: '', materialId: '', unit: 'UN',
  costPrice: 0, salePrice: 0, width: 0, height: 0, length: 0, thickness: 0, weight: 0,
  ncm: '', ipi: 0, icms: 0, finish: '', family: '', line: '', notes: '',
  showInCatalog: false, catalogOrder: 0, catalogFeatured: false, catalogDescription: '',
  catalogPriceMode: 'sob_consulta', catalogAllowCustomization: true, catalogCustomizationConfig: {},
}

export interface ProductListItem extends ProductListRow {
  categoryId?: string
  materialId?: string
  description?: string
  unit?: string
  costPrice?: number
  width?: number
  height?: number
  length?: number
  thickness?: number
  ncm?: string
  ipi?: number
  icms?: number
  finish?: string
  family?: string
  line?: string
  notes?: string
  showInCatalog?: boolean
  catalogOrder?: number
  catalogFeatured?: boolean
  catalogDescription?: string
  catalogPriceMode?: string
  catalogAllowCustomization?: boolean
  catalogCustomizationConfig?: CatalogCustomizationConfig | null
}

/** A linha da listagem já traz todos os campos do formulário (mesmo comportamento de antes desta
 * migração — `openEditProduct` nunca teve o bug de campo perdido que `openEditClient` tinha, então
 * não há necessidade de buscar o registro completo por id aqui, diferente de Clientes/Fornecedores/
 * Materiais). */
export function productToFormData(product: ProductListItem): ProductFormData {
  return {
    internalCode: product.internalCode || '',
    name: product.name || '',
    description: product.description || '',
    categoryId: product.categoryId || '',
    materialId: product.materialId || '',
    unit: product.unit || 'UN',
    costPrice: product.costPrice || 0,
    salePrice: product.salePrice || 0,
    width: product.width || 0,
    height: product.height || 0,
    length: product.length || 0,
    thickness: product.thickness || 0,
    weight: product.weight || 0,
    ncm: product.ncm || '',
    ipi: product.ipi || 0,
    icms: product.icms || 0,
    finish: product.finish || '',
    family: product.family || '',
    line: product.line || '',
    notes: product.notes || '',
    showInCatalog: product.showInCatalog || false,
    catalogOrder: product.catalogOrder || 0,
    catalogFeatured: product.catalogFeatured || false,
    catalogDescription: product.catalogDescription || '',
    catalogPriceMode: product.catalogPriceMode || 'sob_consulta',
    catalogAllowCustomization: product.catalogAllowCustomization ?? true,
    catalogCustomizationConfig: product.catalogCustomizationConfig || {},
  }
}
