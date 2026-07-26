import { NextRequest } from 'next/server'
import { requireAuth, ok, badRequest, handleRouteError } from '@/lib/api-utils'
import { statusHistoryService } from '@/app/services/status-history.service'

/** GET /api/status-history?entityType=quote&entityId=xxx — timeline de transições de status de uma
 * entidade (ADR-022, Fase UX-2, achado #14). Mesma permissão de qualquer leitura de detalhe
 * (`requireAuth`, sem checagem de módulo específico) — quem já pode ver o registro na tela de origem
 * pode ver seu histórico. */
export async function GET(req: NextRequest) {
  try {
    await requireAuth()
    const { searchParams } = new URL(req.url)
    const entityType = searchParams.get('entityType')
    const entityId = searchParams.get('entityId')
    if (!entityType || !entityId) return badRequest('Informe entityType e entityId')

    return ok(await statusHistoryService.list(entityType, entityId))
  } catch (error) {
    return handleRouteError(error, 'Erro ao buscar histórico de status')
  }
}
