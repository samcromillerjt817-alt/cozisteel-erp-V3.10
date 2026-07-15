import { NextRequest } from 'next/server'
import { requireAuth, requireRole, ok, handleRouteError } from '@/lib/api-utils'
import { userService } from '@/app/services/user.service'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: RouteContext) {
  try {
    await requireAuth()
    const { id } = await ctx.params
    const user = await userService.getById(id)
    return ok(user)
  } catch (error) {
    return handleRouteError(error, 'Erro ao buscar usuário')
  }
}

// Correção de segurança (Fase 1, ADR-001 log 2026-07-09): antes só exigia login (requireAuth),
// permitindo que qualquer usuário autenticado editasse role/senha/status de qualquer outro usuário.
export async function PUT(req: NextRequest, ctx: RouteContext) {
  try {
    await requireRole('admin')
    const { id } = await ctx.params
    const body = await req.json()
    const updated = await userService.update(id, body)
    return ok(updated)
  } catch (error) {
    return handleRouteError(error, 'Erro ao atualizar usuário')
  }
}

// Correção de segurança (Fase 1, ADR-001 log 2026-07-09): antes só exigia login (requireAuth),
// permitindo que qualquer usuário autenticado excluísse qualquer outro usuário.
export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  try {
    const currentUser = await requireRole('admin')
    const { id } = await ctx.params
    const result = await userService.delete(id, currentUser.id)
    return ok(result)
  } catch (error) {
    return handleRouteError(error, 'Erro ao excluir usuário')
  }
}
