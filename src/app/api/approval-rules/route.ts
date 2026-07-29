import { NextRequest } from 'next/server'
import { requireModulePermission, ok, created, handleRouteError } from '@/lib/api-utils'
import { validateDto, approvalRuleSchema } from '@/app/dto'
import { approvalService } from '@/app/services/approval.service'

/** ADR-023 (item 5, "motor de alçadas configurável") — gestão administrativa das regras
 * (`ApprovalRule`), mesmo módulo/ação já usado pela Central de Administração (ADR-021). */
export async function GET() {
  try {
    await requireModulePermission('sistema', 'manage')
    const rules = await approvalService.listRules()
    return ok(rules)
  } catch (error) {
    return handleRouteError(error, 'Erro ao buscar regras de alçada')
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireModulePermission('sistema', 'manage')
    const body = await req.json()
    const data = validateDto(approvalRuleSchema, body)

    const rule = await approvalService.createRule(data)
    return created(rule)
  } catch (error) {
    return handleRouteError(error, 'Erro ao criar regra de alçada')
  }
}
