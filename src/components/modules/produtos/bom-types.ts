// ADR-023 (item 4, "completar a BOM formal") — motor de engenharia (BomRevision/BomLine/
// ProductOperation) existia desde a Fase 4 (ADR-005), sem nenhuma tela. Primeira UI.

export const BOM_STATUS_LABELS: Record<string, string> = {
  draft: 'Rascunho', pending_approval: 'Em aprovação', released: 'Liberada', obsolete: 'Obsoleta',
}

// Espelha ALLOWED_TRANSITIONS de bom.service.ts — draft → released direto continua permitido
// (pending_approval é opcional, não obrigatório).
export const BOM_STATUS_TRANSITIONS: Record<string, string[]> = {
  draft: ['pending_approval', 'released', 'obsolete'],
  pending_approval: ['released', 'draft', 'obsolete'],
  released: ['obsolete'],
  obsolete: [],
}

export interface BomRevisionRow {
  id: string
  productId: string
  revisionCode: string
  status: string
  effectiveFrom: string | null
  notes: string
  createdAt: string
  releasedAt: string | null
  createdBy: { id: string; name: string } | null
  releasedBy: { id: string; name: string } | null
  _count?: { lines: number }
}

export interface BomLineRow {
  id: string
  bomRevisionId: string
  lineType: 'material' | 'component'
  materialId: string | null
  componentProductId: string | null
  quantity: number
  unit: string
  scrapPct: number
  order: number
  notes: string
  material: { id: string; name: string; unit: string } | null
  componentProduct: { id: string; name: string; internalCode: string; unit: string } | null
  substitutes: BomLineSubstituteRow[]
}

export interface BomLineSubstituteRow {
  id: string
  bomLineId: string
  materialId: string
  notes: string
  material: { id: string; name: string; unit: string }
}

export interface BomOperationRow {
  id: string
  bomRevisionId: string
  operationTypeId: string
  sequenceOrder: number
  description: string
  setupTimeMinutes: number
  runTimeMinutesPerUnit: number
  workCenter: string
  notes: string
  operationType: { id: string; name: string }
}

export interface OperationTypeOption {
  id: string
  name: string
}

export interface BomRevisionDetail extends BomRevisionRow {
  lines: BomLineRow[]
  operations: BomOperationRow[]
}

export interface BomCompareResult {
  fromRevisionCode: string
  toRevisionCode: string
  added: { name: string; quantity: number; unit: string }[]
  removed: { name: string; quantity: number; unit: string }[]
  changed: {
    name: string
    quantityFrom: number; quantityTo: number
    unitFrom: string; unitTo: string
    scrapPctFrom: number; scrapPctTo: number
  }[]
  unchangedCount: number
}
