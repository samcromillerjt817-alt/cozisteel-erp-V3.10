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

export const requisitionItemSchema = z.object({
  materialId: z.string().min(1, 'Matéria-prima é obrigatória'),
  supplierId: z.string().optional().nullable(),
  quantity: z.number().positive('Quantidade deve ser maior que zero'),
  unit: z.string().default('KG'),
  estimatedPrice: z.number().min(0).default(0),
  notes: z.string().default(''),
})

export const createRequisitionSchema = z.object({
  originModule: z.string().default('manual'),
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

export const createUserSchema = z.object({
  username: z.string().min(3, 'Username deve ter no mínimo 3 caracteres'),
  name: z.string().min(2, 'Nome é obrigatório'),
  email: z.union([z.string().email('E-mail inválido'), z.literal('')]).optional().default(''),
  password: z.string().min(6, 'Senha deve ter no mínimo 6 caracteres'),
  role: z.string().default('user'),
  active: z.boolean().default(true),
})

export type CreateQuoteDto = z.infer<typeof createQuoteSchema>
export type UpdateQuoteDto = z.infer<typeof updateQuoteSchema>
export type CreateProductDto = z.infer<typeof createProductSchema>
export type CreateClientDto = z.infer<typeof createClientSchema>
export type CreateUserDto = z.infer<typeof createUserSchema>

export function validateDto<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data)
  if (!result.success) {
    const firstError = result.error.issues[0]
    throw new BadRequestException(firstError?.message || 'Dados inválidos')
  }
  return result.data
}