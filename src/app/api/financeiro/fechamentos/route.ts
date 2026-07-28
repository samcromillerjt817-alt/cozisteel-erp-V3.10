import { NextRequest } from 'next/server'
import { requireModulePermission, ok, created, handleRouteError } from '@/lib/api-utils'
import { validateDto, periodClosingSchema } from '@/app/dto'
import { periodClosingService } from '@/app/services/period-closing.service'

/** ADR-023 (item 6, Decisão #5) — fechamento mensal por competência. `manage` (não só `update`) —
 * trava/destrava competência é decisão sensível o bastante para exigir a mesma permissão especial da
 * alçada e da Central de Administração. */
export async function GET() {
  try {
    await requireModulePermission('financeiro', 'read')
    const closings = await periodClosingService.list()
    return ok(closings)
  } catch (error) {
    return handleRouteError(error, 'Erro ao buscar fechamentos de competência')
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireModulePermission('financeiro', 'manage')
    const body = await req.json()
    const data = validateDto(periodClosingSchema, body)

    const closing = await periodClosingService.close(data.period, user.id, data.notes)
    return created(closing)
  } catch (error) {
    return handleRouteError(error, 'Erro ao fechar competência')
  }
}
