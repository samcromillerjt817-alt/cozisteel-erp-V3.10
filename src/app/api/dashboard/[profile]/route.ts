import { NextRequest } from 'next/server'
import { requireModulePermission, ok, handleRouteError } from '@/lib/api-utils'
import { BadRequestException, ForbiddenException } from '@/app/exceptions'
import { canAccessProfile } from '@/app/services/dashboard-access.service'
import { getDashboard, getDiretoriaSummary } from '@/app/services/dashboard-widgets.service'
import { centroOperacoesService } from '@/app/services/centro-operacoes.service'
import { resolveDashboardPeriod } from '@/lib/dashboard-period'
import { DASHBOARD_PROFILES, type DashboardProfile } from '@/app/services/dashboard-types'
import '@/app/services/dashboard-bootstrap'

type RouteContext = { params: Promise<{ profile: string }> }

export async function GET(req: NextRequest, ctx: RouteContext) {
  try {
    const user = await requireModulePermission('dashboard', 'read')
    const { profile } = await ctx.params

    if (!DASHBOARD_PROFILES.includes(profile as DashboardProfile)) {
      throw new BadRequestException('Perfil de dashboard inválido')
    }
    const dashboardProfile = profile as DashboardProfile

    if (!canAccessProfile(user.role, dashboardProfile)) {
      throw new ForbiddenException('Você não tem acesso a este dashboard')
    }

    // Única fonte de resolução do período (ADR-017, Subetapa 6) — nenhuma rota faz seu próprio
    // `new Date(param)`; `?period=30d|90d|custom&from=&to=`.
    const { searchParams } = new URL(req.url)
    const period = resolveDashboardPeriod(searchParams)

    // Diretoria (ADR-019, Subetapa 7.5) e Centro de Operações (ADR-024) têm formato de resposta
    // próprio (síntese, não composição de widgets) — mesma rota, mesmo RBAC/resolução de período,
    // payload diferente só para esses dois perfis. Centro de Operações ignora `period` de propósito
    // nesta fase (pipeline/KPIs são retrato do AGORA, não uma agregação por período).
    const payload =
      dashboardProfile === 'diretoria'
        ? await getDiretoriaSummary(period)
        : dashboardProfile === 'centro-operacoes'
          ? await centroOperacoesService.getPayload()
          : await getDashboard(dashboardProfile, period)

    return ok(payload)
  } catch (error) {
    return handleRouteError(error, 'Erro ao buscar dashboard')
  }
}
