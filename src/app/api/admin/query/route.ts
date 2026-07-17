import { NextRequest } from 'next/server'
import { requireModulePermission, ok, badRequest, handleRouteError } from '@/lib/api-utils'
import { adminQueryService } from '@/app/services/admin-query.service'
import { auditService } from '@/app/services/audit.service'

export async function POST(req: NextRequest) {
  try {
    const user = await requireModulePermission('sistema', 'manage')
    const body = await req.json()
    const sql = typeof body?.sql === 'string' ? body.sql : ''
    if (!sql.trim()) return badRequest('Informe uma consulta SQL')

    const result = await adminQueryService.runReadOnlyQuery(sql)

    await auditService.log({
      userId: user.id,
      action: 'CONSULTA',
      module: 'sistema',
      details: `Console SQL: ${sql.slice(0, 200)}`,
    })

    return ok(result)
  } catch (error) {
    return handleRouteError(error, 'Erro ao executar consulta')
  }
}
