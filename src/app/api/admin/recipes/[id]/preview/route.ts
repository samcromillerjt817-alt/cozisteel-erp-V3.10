import { NextRequest } from 'next/server'
import { requireModulePermission, ok, badRequest, handleRouteError } from '@/lib/api-utils'
import { adminRecipesService, type RecipeId } from '@/app/services/admin-recipes.service'

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, ctx: RouteContext) {
  try {
    await requireModulePermission('sistema', 'manage')
    const { id } = await ctx.params
    const body = await req.json().catch(() => ({}))

    switch (id as RecipeId) {
      case 'unstick-patch-status':
        return ok(adminRecipesService.previewUnstickPatchStatus())
      case 'reconcile-patch-log':
        return ok(await adminRecipesService.previewReconcilePatchLog())
      case 'recalculate-batch-cost': {
        const productBatchId = typeof body?.productBatchId === 'string' ? body.productBatchId : ''
        if (!productBatchId) return badRequest('Informe o productBatchId')
        return ok(await adminRecipesService.previewRecalculateBatchCost(productBatchId))
      }
      default:
        return badRequest('Receita desconhecida')
    }
  } catch (error) {
    return handleRouteError(error, 'Erro ao pré-visualizar receita')
  }
}
