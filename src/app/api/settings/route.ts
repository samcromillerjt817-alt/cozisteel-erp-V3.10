import { NextRequest } from 'next/server'
import { requireAuth, requireRole, unauthorized, forbidden, ok, badRequest } from '@/lib/api-utils'
import { settingService } from '@/app/services/setting.service'

export async function GET(_req: NextRequest) {
  try {
    await requireAuth()
    const grouped = await settingService.getAllGrouped()
    return ok(grouped)
  } catch (error) {
    if (error instanceof Error && error.name === 'UnauthorizedError') return unauthorized()
    console.error('GET /api/settings error:', error)
    return badRequest('Erro ao buscar configurações')
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await requireRole('admin')
    const body = await req.json()

    if (!Array.isArray(body) || body.length === 0) {
      return badRequest('Envie um array de { key, value } para atualizar')
    }

    await settingService.setMany(body)

    return ok({ success: true, updated: body.length })
  } catch (error) {
    if (error instanceof Error && error.name === 'UnauthorizedError') return unauthorized()
    if (error instanceof Error && error.name === 'ForbiddenError') return forbidden()
    console.error('PUT /api/settings error:', error)
    return badRequest('Erro ao atualizar configurações')
  }
}