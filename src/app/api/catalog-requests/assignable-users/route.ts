import { requireModulePermission, ok, handleRouteError } from '@/lib/api-utils'
import { catalogRequestService } from '@/app/services/catalog-request.service'

/** Lista mínima de usuários que podem ser responsáveis por um Orçamento (ADR-026, Fase 4) — evita
 *  abrir `/api/users` (admin/manager-only) pra quem só tem permissão de `catalogo`. */
export async function GET() {
  try {
    await requireModulePermission('catalogo', 'read')
    const users = await catalogRequestService.listAssignableUsers()
    return ok({ data: users })
  } catch (error) {
    return handleRouteError(error, 'Erro ao buscar usuários')
  }
}
