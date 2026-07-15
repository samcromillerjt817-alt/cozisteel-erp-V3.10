// Módulo Fornecedores (Fase 11.5, Subetapa 11.5.7 — propagação do template).

export interface SupplierMaterialLink {
  materialId: string
  lastPrice: number
  leadTimeDays: number
  isPreferred: boolean
  material?: { id: string; name: string; unit: string; internalCode: string }
}

export interface SupplierListRow {
  id: string
  corporateName: string
  tradeName: string
  // Nullable no schema desde a correção do bug de duplicidade (CNPJ/CPF agora é `@unique` de
  // verdade — precisa de `null`, não `''`, para "sem documento"). `supplierToFormData` já normaliza
  // para `''` no formulário.
  cpfCnpj: string | null
  contactName: string
  phone: string
  _count?: { materials: number }
}

export interface SupplierRecord extends SupplierListRow {
  ie: string
  email: string
  contactPhone: string
  zipCode: string
  address: string
  neighborhood: string
  city: string
  state: string
  active: boolean
  situacaoCadastral: string
  cnaeCode: string
  cnaeDescription: string
  paymentTerms: string
  leadTimeDays: number
  notes: string
  materials: SupplierMaterialLink[]
}

const FORM_FIELD_KEYS = [
  'corporateName', 'tradeName', 'cpfCnpj', 'ie', 'email', 'phone',
  'contactName', 'contactPhone', 'zipCode', 'address', 'neighborhood', 'city', 'state',
  'situacaoCadastral', 'cnaeCode', 'cnaeDescription', 'paymentTerms', 'notes',
] as const

// Mesmo raciocínio de `ClientFormData` — o formulário sempre trabalha com `string`, só o registro é
// nullable.
export type SupplierFormData = Omit<Pick<SupplierRecord, (typeof FORM_FIELD_KEYS)[number]>, 'cpfCnpj'> & { cpfCnpj: string; leadTimeDays: number }

export const EMPTY_SUPPLIER_FORM: SupplierFormData = {
  ...FORM_FIELD_KEYS.reduce((acc, key) => {
    acc[key] = ''
    return acc
  }, {} as Record<(typeof FORM_FIELD_KEYS)[number], string>),
  leadTimeDays: 0,
}

/** Mesmo princípio de `clientToFormData` (Subetapa 11.5.6) — uma única lista de campos alimentando
 * tanto o estado vazio quanto a conversão do registro real, para nenhum campo divergir silenciosamente. */
export function supplierToFormData(supplier: SupplierRecord): SupplierFormData {
  const base = FORM_FIELD_KEYS.reduce((acc, key) => {
    acc[key] = supplier[key] || ''
    return acc
  }, {} as Record<(typeof FORM_FIELD_KEYS)[number], string>)
  return { ...base, leadTimeDays: supplier.leadTimeDays || 0 }
}
