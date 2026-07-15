import { z } from 'zod'
import { BadRequestException } from '@/app/exceptions'

export const createQuoteItemSchema = z.object({
  productId: z.string().optional(),
  code: z.string().default(''),
  description: z.string().default(''),
  quantity: z.number().min(0).default(1),
  unit: z.string().default('UN'),
  unitPrice: z.number().min(0).default(0),
  order: z.number().int().min(0).default(0),
  notes: z.string().default(''),
})

export const createQuoteSchema = z.object({
  clientId: z.string().optional(),
  status: z.string().default('draft'),
  validUntil: z.string().optional().default(''),
  clientName: z.string().default(''),
  clientContact: z.string().default(''),
  clientAddress: z.string().default(''),
  clientNeighborhood: z.string().default(''),
  clientCep: z.string().default(''),
  clientCnpj: z.string().default(''),
  clientEmail: z.string().default(''),
  clientPhone: z.string().default(''),
  discountType: z.string().default('value'),
  discountValue: z.number().min(0).default(0),
  freightMode: z.string().default('combined'),
  freightText: z.string().default('A COMBINAR'),
  freightValue: z.number().min(0).default(0),
  warranty: z.string().default(''),
  validity: z.string().default(''),
  deliveryTime: z.string().default(''),
  paymentTerms: z.string().default(''),
  generalConditions: z.string().default(''),
  notes: z.string().default(''),
  photoNote: z.string().default(''),
  internalNotes: z.string().default(''),
  items: z.array(createQuoteItemSchema).default([]),
})

export const updateQuoteSchema = createQuoteSchema.partial().extend({
  items: z.array(createQuoteItemSchema).optional(),
})

export const createProductSchema = z.object({
  internalCode: z.string().default(''),
  sku: z.string().default(''),
  barcode: z.string().default(''),
  name: z.string().min(1, 'Nome é obrigatório'),
  description: z.string().default(''),
  categoryId: z.string().optional().nullable(),
  materialId: z.string().optional().nullable(),
  unit: z.string().default('UN'),
  costPrice: z.number().min(0).default(0),
  salePrice: z.number().min(0).default(0),
  width: z.number().min(0).default(0),
  height: z.number().min(0).default(0),
  length: z.number().min(0).default(0),
  thickness: z.number().min(0).default(0),
  weight: z.number().min(0).default(0),
  ncm: z.string().default(''),
  ipi: z.number().min(0).max(100).default(0),
  icms: z.number().min(0).max(100).default(0),
  finish: z.string().default(''),
  family: z.string().default(''),
  line: z.string().default(''),
  notes: z.string().default(''),
})

export const createClientSchema = z.object({
  type: z.string().default('company'),
  corporateName: z.string().default(''),
  tradeName: z.string().default(''),
  cpfCnpj: z.string().default(''),
  ie: z.string().default(''),
  im: z.string().default(''),
  email: z.string().default(''),
  phone: z.string().default(''),
  phone2: z.string().default(''),
  contactName: z.string().default(''),
  contactPhone: z.string().default(''),
  contactEmail: z.string().default(''),
  zipCode: z.string().default(''),
  address: z.string().default(''),
  number: z.string().default(''),
  complement: z.string().default(''),
  neighborhood: z.string().default(''),
  city: z.string().default(''),
  state: z.string().default(''),
  notes: z.string().default(''),
  internalCode: z.string().default(''),
  situacaoCadastral: z.string().default(''),
  cnaeCode: z.string().default(''),
  cnaeDescription: z.string().default(''),
})

export const createMaterialSchema = z.object({
  internalCode: z.string().default(''),
  name: z.string().min(1, 'Nome é obrigatório'),
  categoryId: z.string().optional().nullable(),
  density: z.number().min(0).default(0),
  description: z.string().default(''),
  unit: z.string().default('KG'),
  stockQty: z.number().min(0).default(0),
  minStockQty: z.number().min(0).default(0),
  costPrice: z.number().min(0).default(0),
  notes: z.string().default(''),
  active: z.boolean().default(true),
})

export const updateMaterialSchema = createMaterialSchema.partial()

export const createSupplierSchema = z.object({
  internalCode: z.string().default(''),
  corporateName: z.string().default(''),
  tradeName: z.string().default(''),
  cpfCnpj: z.string().default(''),
  ie: z.string().default(''),
  email: z.string().default(''),
  phone: z.string().default(''),
  phone2: z.string().default(''),
  contactName: z.string().default(''),
  contactPhone: z.string().default(''),
  contactEmail: z.string().default(''),
  zipCode: z.string().default(''),
  address: z.string().default(''),
  number: z.string().default(''),
  complement: z.string().default(''),
  neighborhood: z.string().default(''),
  city: z.string().default(''),
  state: z.string().default(''),
  paymentTerms: z.string().default(''),
  leadTimeDays: z.number().int().min(0).default(0),
  notes: z.string().default(''),
  active: z.boolean().default(true),
  situacaoCadastral: z.string().default(''),
  cnaeCode: z.string().default(''),
  cnaeDescription: z.string().default(''),
})

export const updateSupplierSchema = createSupplierSchema.partial()

export const supplierMaterialSchema = z.object({
  materialId: z.string().min(1, 'Material é obrigatório'),
  supplierCode: z.string().default(''),
  lastPrice: z.number().min(0).default(0),
  leadTimeDays: z.number().int().min(0).default(0),
  isPreferred: z.boolean().default(false),
  notes: z.string().default(''),
})

export const productMaterialSchema = z.object({
  materialId: z.string().min(1, 'Matéria-prima é obrigatória'),
  quantity: z.number().positive('Quantidade deve ser maior que zero').default(1),
  unit: z.string().default('KG'),
  scrapPct: z.number().min(0).max(100).default(0),
  notes: z.string().default(''),
})

// Tipos de Requisição corporativa (Fase 7, ADR-009) — Tipo representa a origem/departamento da
// solicitação, não uma regra rígida de fluxo nesta fase.
export const REQUISITION_TIPOS = ['PRODUCAO', 'MANUTENCAO', 'ALMOXARIFADO', 'ENGENHARIA', 'SERVICOS', 'OUTROS'] as const

export const requisitionItemSchema = z
  .object({
    materialId: z.string().optional().nullable(),
    description: z.string().default(''), // usado quando materialId é nulo — item não-estocável (Fase 7)
    supplierId: z.string().optional().nullable(),
    quantity: z.number().positive('Quantidade deve ser maior que zero'),
    unit: z.string().default('KG'),
    estimatedPrice: z.number().min(0).default(0),
    notes: z.string().default(''),
  })
  .refine((data) => Boolean(data.materialId) || Boolean(data.description.trim()), {
    message: 'Informe a matéria-prima ou uma descrição do item',
    path: ['materialId'],
  })

export const createRequisitionSchema = z.object({
  tipo: z.enum(REQUISITION_TIPOS).default('PRODUCAO'),
  // "mrp" nunca é aceito aqui de propósito — só a criação Service-a-Service via MrpSuggestion usa esse
  // valor (RequisitionService.createFromMrpSuggestion), que não passa por este DTO.
  originModule: z.enum(['manual', 'production_order']).default('manual'),
  productionOrderId: z.string().optional().nullable(),
  neededBy: z.string().default(''),
  notes: z.string().default(''),
  items: z.array(requisitionItemSchema).min(1, 'Pelo menos um item é obrigatório'),
})

export const updateRequisitionSchema = z.object({
  neededBy: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(requisitionItemSchema).optional(),
})

export const receivePurchaseOrderItemSchema = z.object({
  purchaseOrderItemId: z.string().min(1, 'Item é obrigatório'),
  quantityReceived: z.number().positive('Quantidade recebida deve ser maior que zero'),
  // Fase 10, ADR-013 — opcionais: só têm efeito quando o material do item é lotControlled. Sem
  // batchNumber, o lote recebe um código gerado internamente (NumberingService).
  batchNumber: z.string().optional(),
  expiresAt: z.string().optional(),
})

export const receivePurchaseOrderSchema = z.object({
  items: z.array(receivePurchaseOrderItemSchema).min(1, 'Informe ao menos um item recebido'),
})

export const produceProductionOrderSchema = z.object({
  quantity: z.number().positive('Quantidade produzida deve ser maior que zero'),
  clientRequestId: z.string().optional(),
})

export const updatePurchaseOrderSchema = z.object({
  expectedDate: z.string().optional(),
  paymentTerms: z.string().optional(),
  notes: z.string().optional(),
})

// ── Financeiro (Fase 12, Subetapa 7) ──

export const registerPaymentSchema = z.object({
  amount: z.number().positive('Valor do pagamento deve ser maior que zero'),
  paidAt: z.string().min(1, 'Data do pagamento é obrigatória'),
  notes: z.string().default(''),
})

export const registerReceiptSchema = z.object({
  amount: z.number().positive('Valor do recebimento deve ser maior que zero'),
  paidAt: z.string().min(1, 'Data do recebimento é obrigatória'),
  notes: z.string().default(''),
})

export const createUserSchema = z.object({
  username: z.string().min(3, 'Username deve ter no mínimo 3 caracteres'),
  name: z.string().min(2, 'Nome é obrigatório'),
  email: z.union([z.string().email('E-mail inválido'), z.literal('')]).optional().default(''),
  password: z.string().min(6, 'Senha deve ter no mínimo 6 caracteres'),
  role: z.string().default('user'),
  active: z.boolean().default(true),
})

// ── Engenharia do Produto (Fase 4, ADR-005) ──

export const createBomRevisionSchema = z.object({
  revisionCode: z.string().min(1, 'Código da revisão é obrigatório'),
  notes: z.string().default(''),
})

export const bomLineSchema = z
  .object({
    lineType: z.enum(['material', 'component']),
    materialId: z.string().optional().nullable(),
    componentProductId: z.string().optional().nullable(),
    quantity: z.number().positive('Quantidade deve ser maior que zero').default(1),
    unit: z.string().default('UN'),
    scrapPct: z.number().min(0).max(100).default(0),
    order: z.number().int().min(0).default(0),
    notes: z.string().default(''),
  })
  .refine((data) => (data.lineType === 'material' ? !!data.materialId : !!data.componentProductId), {
    message: 'Informe materialId (linha de material) ou componentProductId (linha de componente), de acordo com lineType',
  })

export const createOperationTypeSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  description: z.string().default(''),
})

export const productOperationSchema = z.object({
  operationTypeId: z.string().min(1, 'Tipo de operação é obrigatório'),
  sequenceOrder: z.number().int().min(0).optional(), // se omitido, o Service calcula o próximo múltiplo de 10
  description: z.string().default(''),
  setupTimeMinutes: z.number().min(0).default(0),
  runTimeMinutesPerUnit: z.number().min(0).default(0),
  workCenter: z.string().default(''),
  notes: z.string().default(''),
})

export type CreateQuoteDto = z.infer<typeof createQuoteSchema>
export type UpdateQuoteDto = z.infer<typeof updateQuoteSchema>
export type CreateProductDto = z.infer<typeof createProductSchema>
export type CreateClientDto = z.infer<typeof createClientSchema>
export type CreateUserDto = z.infer<typeof createUserSchema>
export type CreateMaterialDto = z.infer<typeof createMaterialSchema>
export type CreateSupplierDto = z.infer<typeof createSupplierSchema>
export type SupplierMaterialDto = z.infer<typeof supplierMaterialSchema>
export type ProductMaterialDto = z.infer<typeof productMaterialSchema>
export type CreateRequisitionDto = z.infer<typeof createRequisitionSchema>
export type UpdateRequisitionDto = z.infer<typeof updateRequisitionSchema>
export type UpdatePurchaseOrderDto = z.infer<typeof updatePurchaseOrderSchema>
export type ReceivePurchaseOrderDto = z.infer<typeof receivePurchaseOrderSchema>
export type ProduceProductionOrderDto = z.infer<typeof produceProductionOrderSchema>
export type CreateBomRevisionDto = z.infer<typeof createBomRevisionSchema>
export type BomLineDto = z.infer<typeof bomLineSchema>
export type CreateOperationTypeDto = z.infer<typeof createOperationTypeSchema>
export type ProductOperationDto = z.infer<typeof productOperationSchema>

export function validateDto<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data)
  if (!result.success) {
    const firstError = result.error.issues[0]
    throw new BadRequestException(firstError?.message || 'Dados inválidos')
  }
  return result.data
}