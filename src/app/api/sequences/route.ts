import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { requireAuth, unauthorized, ok, badRequest, notFound } from '@/lib/api-utils'
import { auditService } from '@/app/services/audit.service'

export async function GET(_req: NextRequest) {
  try {
    await requireAuth()

    const sequences = await db.numberSequence.findMany({
      include: { user: { select: { id: true, name: true } } },
      orderBy: { documentType: 'asc' },
    })

    return ok(sequences)
  } catch (error) {
    if (error instanceof Error && error.name === 'UnauthorizedError') return unauthorized()
    console.error('GET /api/sequences error:', error)
    return badRequest('Erro ao buscar sequências')
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await requireAuth()
    const body = await req.json()
    const { id, ...data } = body

    if (!id) return badRequest('ID é obrigatório')

    const seq = await db.numberSequence.findUnique({ where: { id } })
    if (!seq) return notFound('Sequência não encontrada')

    const updateData: Record<string, unknown> = {}
    if (data.prefix !== undefined) updateData.prefix = data.prefix
    if (data.suffix !== undefined) updateData.suffix = data.suffix
    if (data.nextNumber !== undefined) updateData.nextNumber = data.nextNumber
    if (data.digits !== undefined) updateData.digits = data.digits
    if (data.increment !== undefined) updateData.increment = data.increment
    if (data.resetAnnual !== undefined) updateData.resetAnnual = data.resetAnnual
    if (data.resetMonthly !== undefined) updateData.resetMonthly = data.resetMonthly
    updateData.updatedBy = user.id

    const updated = await db.numberSequence.update({
      where: { id },
      data: updateData,
      include: { user: { select: { id: true, name: true } } },
    })

    await auditService.log({
      userId: user.id,
      action: 'UPDATE',
      module: 'sequencias',
      entityId: id,
      entityName: seq.documentType,
      details: `Sequência ${seq.documentType} atualizada`,
    })

    return ok(updated)
  } catch (error) {
    if (error instanceof Error && error.name === 'UnauthorizedError') return unauthorized()
    console.error('PUT /api/sequences error:', error)
    return badRequest('Erro ao atualizar sequência')
  }
}