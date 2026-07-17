import { NextRequest } from 'next/server'
import { requireModulePermission, ok, handleRouteError } from '@/lib/api-utils'
import { systemDiagnosticsService } from '@/app/services/system-diagnostics.service'

export async function GET(_req: NextRequest) {
  try {
    await requireModulePermission('sistema', 'read')
    return ok(systemDiagnosticsService.getDiagnostics())
  } catch (error) {
    return handleRouteError(error, 'Erro ao buscar diagnóstico do sistema')
  }
}
