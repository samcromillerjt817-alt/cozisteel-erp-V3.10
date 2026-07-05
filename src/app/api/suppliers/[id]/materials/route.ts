import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, unauthorized, ok, created, badRequest, notFound } from '@/lib/api-utils'
import { validateDto, supplierMaterialSchema } from '@/app/dto'
import { auditService } from '@/app/services/audit.service'

type RouteContext = { params: Promise<{ id: string }> }

/** Lists all materials (matérias-primas) linked to a supplier */
export async function GET(_req: NextRequest, ctx: RouteContext) {
  try {
    await requireAuth()
    const { id: supplierId } = await ctx.params

    const links = await db.supplierMaterial.findMany({
      where: { supplierId },
      include: { material: true },
      orderBy: { updatedAt: 'desc' },
    })

    return ok(links)
  } catch (error) {
    if (error instanceof Error && error.name === 'UnauthorizedError') return unauthorized()
    console.error('GET /api/suppliers/[id]/materials error:', error)
    return badRequest('Erro ao buscar materiais do fornecedor')
  }
}

/** Links a raw material to a supplier (or updates the link if it already exists) */
export async function POST(req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requireAuth()
    const { id: supplierId } = await ctx.params
    const body = await req.json()
    const data = validateDto(supplierMaterialSchema, body)

    const supplier = await db.supplier.findUnique({ where: { id: supplierId } })
    if (!supplier) return notFound('Fornecedor não encontrado')

    const material = await db.material.findUnique({ where: { id: data.materialId } })
    if (!material) return notFound('Matéria-prima não encontrada')

    // If this link is set as preferred, unset any other preferred supplier for this material
    if (data.isPreferred) {
      await db.supplierMaterial.updateMany({
        where: { materialId: data.materialId, NOT: { supplierId } },
        data: { isPreferred: false },
      })
    }

    const link = await db.supplierMaterial.upsert({
      where: { supplierId_materialId: { supplierId, materialId: data.materialId } },
      update: {
        supplierCode: data.supplierCode,
        lastPrice: data.lastPrice,
        leadTimeDays: data.leadTimeDays,
        isPreferred: data.isPreferred,
        notes: data.notes,
      },
      create: {
        supplierId,
        materialId: data.materialId,
        supplierCode: data.supplierCode,
        lastPrice: data.lastPrice,
        leadTimeDays: data.leadTimeDays,
        isPreferred: data.isPreferred,
        notes: data.notes,
      },
      include: { material: true },
    })

    await auditService.log({
      userId: user.id,
      action: 'UPDATE',
      module: 'fornecedores',
      entityId: supplierId,
      entityName: supplier.corporateName || supplier.tradeName,
      details: `Vínculo com matéria-prima "${material.name}" atualizado (preço R$ ${data.lastPrice.toFixed(2)})`,
    })

    return created(link)
  } catch (error) {
    if (error instanceof Error && error.name === 'UnauthorizedError') return unauthorized()
    if (error instanceof Error && error.name === 'BadRequestException') return badRequest(error.message)
    console.error('POST /api/suppliers/[id]/materials error:', error)
    return badRequest('Erro ao vincular matéria-prima ao fornecedor')
  }
}
