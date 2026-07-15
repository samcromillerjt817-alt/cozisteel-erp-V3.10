import { NextRequest } from 'next/server'
import { requireAuth, requireRole, ok, badRequest, forbidden, handleRouteError, ForbiddenError } from '@/lib/api-utils'
import { settingService } from '@/app/services/setting.service'

export async function GET(_req: NextRequest) {
  try {
    await requireAuth()
    const grouped = await settingService.getAllGrouped()
    return ok(grouped)
  } catch (error) {
    return handleRouteError(error, 'Erro ao buscar configurações')
  }
}

export async function PUT(req: NextRequest) {
  try {
    await requireRole('admin')
    const body = await req.json()

    if (!Array.isArray(body) || body.length === 0) {
      return badRequest('Envie um array de { key, value } para atualizar')
    }

    await settingService.setMany(body)

    return ok({ success: true, updated: body.length })
  } catch (error) {
    // Preserva a mensagem genérica original (não a mensagem específica de requireRole).
    if (error instanceof ForbiddenError) return forbidden()
    return handleRouteError(error, 'Erro ao atualizar configurações')
  }
}
