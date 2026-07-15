import { NextRequest } from 'next/server'
import { requireAuth, requireModulePermission, ok, handleRouteError } from '@/lib/api-utils'
import { sequenceService } from '@/app/services/sequence.service'

export async function GET(_req: NextRequest) {
  try {
    await requireAuth()
    const sequences = await sequenceService.list()
    return ok(sequences)
  } catch (error) {
    return handleRouteError(error, 'Erro ao buscar sequências')
  }
}

// Correção de segurança (Fase 1, ADR-001 log 2026-07-09): antes só exigia login (requireAuth),
// permitindo que qualquer usuário autenticado reconfigurasse a numeração de documentos do sistema.
// requireModulePermission('sequencias','update') só é concedido ao papel admin no RBAC atual.
export async function PUT(req: NextRequest) {
  try {
    const user = await requireModulePermission('sequencias', 'update')
    const body = await req.json()
    const { id, ...data } = body
    const updated = await sequenceService.update(id, data, user.id)
    return ok(updated)
  } catch (error) {
    return handleRouteError(error, 'Erro ao atualizar sequência')
  }
}
