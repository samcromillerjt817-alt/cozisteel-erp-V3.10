import { NextRequest } from 'next/server'
import { requireAuth, checkPermission, ok, handleRouteError } from '@/lib/api-utils'
import type { Module } from '@/app/middleware/rbac'
import { getAllAlerts } from '@/app/services/dashboard-widgets.service'
import type { DashboardAlertData } from '@/app/services/dashboard-types'
import '@/app/services/dashboard-bootstrap'

/**
 * Alertas com severidade de todos os domínios, para o sino de notificações da barra lateral
 * (Fase 11.5, Subetapa 11.5.10) — substitui as 2 buscas manuais que existiam em `page.tsx`. Cada
 * alerta só aparece se o usuário tiver permissão de leitura no módulo de destino (`linkToModule`),
 * nunca a permissão genérica de "dashboard" (que é universal a todo perfil).
 */
export async function GET(_req: NextRequest) {
  try {
    const user = await requireAuth()
    const widgets = await getAllAlerts()
    const visible = widgets.filter((w) => checkPermission(user, (w.data as DashboardAlertData).linkToModule as Module, 'read'))
    return ok({ widgets: visible })
  } catch (error) {
    return handleRouteError(error, 'Erro ao buscar alertas')
  }
}
