import { NextRequest } from 'next/server'
import { requireModulePermission, ok, handleRouteError } from '@/lib/api-utils'
import { validateDto, updateCompetenceDateSchema } from '@/app/dto'
import { financialAccountService } from '@/app/services/financial-account.service'

type RouteContext = { params: Promise<{ id: string }> }

/** ADR-023 (item 6, Decisão #5) — "alteração manual só com permissão especial e justificativa
 * obrigatória": `manage`, não `update`, e motivo sempre exigido pelo DTO. */
export async function POST(req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requireModulePermission('financeiro', 'manage')
    const { id } = await ctx.params
    const body = await req.json()
    const { competenceDate, reason } = validateDto(updateCompetenceDateSchema, body)

    const updated = await financialAccountService.updateCompetenceDate('payable', id, new Date(competenceDate), reason, user.id)
    return ok(updated)
  } catch (error) {
    return handleRouteError(error, 'Erro ao alterar competência do título a pagar')
  }
}
