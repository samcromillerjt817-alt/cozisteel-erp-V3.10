import { NextRequest } from 'next/server'
import { requireModulePermission, ok, parsePagination, handleRouteError } from '@/lib/api-utils'
import { catalogRequestService } from '@/app/services/catalog-request.service'

/** Fila de triagem do Catálogo Digital Público (ADR-026, Fase 4). */
export async function GET(req: NextRequest) {
  try {
    await requireModulePermission('catalogo', 'read')
    const { searchParams } = new URL(req.url)
    const { page, limit } = parsePagination(searchParams)
    const status = searchParams.get('status') || ''

    const result = await catalogRequestService.list({ status, page, limit })
    return ok(result)
  } catch (error) {
    return handleRouteError(error, 'Erro ao buscar solicitações do catálogo')
  }
}
