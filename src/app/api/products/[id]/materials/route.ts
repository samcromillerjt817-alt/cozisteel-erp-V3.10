import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, unauthorized, ok, created, badRequest, notFound } from '@/lib/api-utils'
import { validateDto, productMaterialSchema } from '@/app/dto'
import { auditService } from '@/app/services/audit.service'

type RouteContext = { params: Promise<{ id: string }> }

/** Lists the raw materials (matérias-primas) consumed by a product */
export async function GET(_req: NextRequest, ctx: RouteContext) {
  try {
    await requireAuth()
    const { id: productId } = await ctx.params

    const items = await db.productMaterial.findMany({
      where: { productId },
      include: { material: true },
      orderBy: { createdAt: 'asc' },
    })

    return ok(items)
  } catch (error) {
    if (error instanceof Error && error.name === 'UnauthorizedError') return unauthorized()
    console.error('GET /api/products/[id]/materials error:', error)
    return badRequest('Erro ao buscar matérias-primas do produto')
  }
}

/** Adds (or updates) a raw-material consumption entry for a product */
export async function POST(req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requireAuth()
    const { id: productId } = await ctx.params
    const body = await req.json()
    const data = validateDto(productMaterialSchema, body)

    const product = await db.product.findUnique({ where: { id: productId } })
    if (!product) return notFound('Produto não encontrado')

    const material = await db.material.findUnique({ where: { id: data.materialId } })
    if (!material) return notFound('Matéria-prima não encontrada')

    const link = await db.productMaterial.upsert({
      where: { productId_materialId: { productId, materialId: data.materialId } },
      update: {
        quantity: data.quantity,
        unit: data.unit,
        scrapPct: data.scrapPct,
        notes: data.notes,
      },
      create: {
        productId,
        materialId: data.materialId,
        quantity: data.quantity,
        unit: data.unit,
        scrapPct: data.scrapPct,
        notes: data.notes,
      },
      include: { material: true },
    })

    await auditService.log({
      userId: user.id,
      action: 'UPDATE',
      module: 'produtos',
      entityId: productId,
      entityName: product.name,
      details: `Matéria-prima "${material.name}" vinculada ao produto (qtd ${data.quantity} ${data.unit})`,
    })

    return created(link)
  } catch (error) {
    if (error instanceof Error && error.name === 'UnauthorizedError') return unauthorized()
    if (error instanceof Error && error.name === 'BadRequestException') return badRequest(error.message)
    console.error('POST /api/products/[id]/materials error:', error)
    return badRequest('Erro ao vincular matéria-prima ao produto')
  }
}
