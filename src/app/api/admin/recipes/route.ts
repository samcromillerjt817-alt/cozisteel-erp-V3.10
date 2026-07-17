import { requireModulePermission, ok, handleRouteError } from '@/lib/api-utils'
import { adminRecipesService } from '@/app/services/admin-recipes.service'

export async function GET() {
  try {
    await requireModulePermission('sistema', 'manage')
    return ok(adminRecipesService.list())
  } catch (error) {
    return handleRouteError(error, 'Erro ao listar receitas de correção')
  }
}
