import { NextRequest } from 'next/server'
import { requireModulePermission, ok, badRequest, handleRouteError } from '@/lib/api-utils'
import { adminRecipesService, type RecipeId } from '@/app/services/admin-recipes.service'

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requireModulePermission('sistema', 'manage')
    const { id } = await ctx.params
    const body = await req.json().catch(() => ({}))

    switch (id as RecipeId) {
      case 'unstick-patch-status':
        return ok(await adminRecipesService.applyUnstickPatchStatus(user.id))
      case 'reconcile-patch-log': {
        const backupTar = typeof body?.backupTar === 'string' ? body.backupTar : ''
        if (!backupTar) return badRequest('Informe o backupTar')
        return ok(await adminRecipesService.applyReconcilePatchLog(backupTar, user.id))
      }
      case 'recalculate-batch-cost': {
        const productBatchId = typeof body?.productBatchId === 'string' ? body.productBatchId : ''
        if (!productBatchId) return badRequest('Informe o productBatchId')
        return ok(await adminRecipesService.applyRecalculateBatchCost(productBatchId, user.id))
      }
      default:
        return badRequest('Receita desconhecida')
    }
  } catch (error) {
    return handleRouteError(error, 'Erro ao aplicar receita')
  }
}
