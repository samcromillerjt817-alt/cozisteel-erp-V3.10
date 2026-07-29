import { NextRequest } from 'next/server'
import { requireModulePermission, ok, badRequest, handleRouteError } from '@/lib/api-utils'
import { adminWriteQueryService } from '@/app/services/admin-write-query.service'
import { auditService } from '@/app/services/audit.service'

/**
 * Console de escrita controlado (ADR-021 addendum) — mesma permissão do console de leitura e das
 * receitas (`sistema:manage`, só admin). `commit: false` (ou ausente) sempre faz preview — roda a
 * instrução de verdade dentro de uma transação e desfaz, nunca persiste. Só grava em `AuditLog`
 * quando `commit: true` realmente comita.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireModulePermission('sistema', 'manage')
    const body = await req.json()
    const sql = typeof body?.sql === 'string' ? body.sql : ''
    const commit = body?.commit === true
    if (!sql.trim()) return badRequest('Informe uma instrução SQL')

    const result = await adminWriteQueryService.run(sql, commit)

    if (result.committed) {
      await auditService.log({
        userId: user.id,
        action: 'CORRECAO_DIRETA',
        module: 'sistema',
        entityName: result.table,
        details: `Console de escrita: ${sql.slice(0, 300)} (${result.affectedCount} linha(s) afetada(s))`,
        beforeValue: { rows: result.beforeRows },
        afterValue: { rows: result.afterRows },
      })
    }

    return ok(result)
  } catch (error) {
    return handleRouteError(error, 'Erro ao executar instrução')
  }
}
