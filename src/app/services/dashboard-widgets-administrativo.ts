// Widgets reais do perfil Administrativo (Fase 11, ADR-017, Subetapa 5 — último perfil de conteúdo).
// Diretoria não tem widget próprio: `getDashboard('diretoria')` já compõe a união de todos os
// widgets registrados (mecanismo construído na Subetapa 1, dashboard-widgets.service.ts), sem
// duplicar lógica e preservando a ordenação (`order`) e as permissões (`dashboard-access.service.ts`)
// já existentes — nenhuma alteração necessária para o perfil Diretoria nesta subetapa.

const RECENT_PATCH_LOG_LIMIT = 20

import { dashboardRepository } from '@/app/repositories/dashboard.repository'
import { registerWidget } from '@/app/services/dashboard-widgets.service'
import type { DashboardWidgetDTO } from '@/app/services/dashboard-types'

registerWidget({
  id: 'administrativo.usuarios-ativos-por-papel',
  sourceProfiles: ['administrativo'],
  expensive: false,
  compute: async (): Promise<DashboardWidgetDTO> => {
    const groups = await dashboardRepository.countActiveUsersByRole()
    return {
      id: 'administrativo.usuarios-ativos-por-papel',
      type: 'chart',
      title: 'Usuários ativos por papel',
      order: 10,
      data: { chartType: 'bar', series: [{ label: 'Usuários', data: groups.map((g) => ({ x: g.role, y: g._count.role })) }] },
    }
  },
})

registerWidget({
  id: 'administrativo.volume-auditoria-por-periodo',
  sourceProfiles: ['administrativo'],
  expensive: false,
  compute: async (period): Promise<DashboardWidgetDTO> => {
    const groups = await dashboardRepository.auditLogVolumeByModule(period.from, period.to)
    return {
      id: 'administrativo.volume-auditoria-por-periodo',
      type: 'chart',
      title: 'Volume de ações de auditoria por módulo',
      order: 20,
      data: { chartType: 'bar', series: [{ label: 'Ações', data: groups.map((g) => ({ x: g.module, y: g._count.module })) }] },
    }
  },
})

registerWidget({
  id: 'administrativo.sequencias-numeracao',
  sourceProfiles: ['administrativo'],
  expensive: false,
  compute: async (): Promise<DashboardWidgetDTO> => {
    const sequences = await dashboardRepository.findNumberSequences()
    return {
      id: 'administrativo.sequencias-numeracao',
      type: 'table',
      title: 'Sequências de numeração',
      order: 30,
      data: {
        columns: [{ key: 'documentType', label: 'Documento' }, { key: 'nextNumber', label: 'Próximo número' }],
        rows: sequences.map((s) => ({ documentType: s.documentType, nextNumber: `${s.prefix}${String(s.nextNumber).padStart(s.digits, '0')}${s.suffix}` })),
      },
    }
  },
})

registerWidget({
  id: 'administrativo.ultimas-execucoes-patch',
  sourceProfiles: ['administrativo'],
  expensive: false,
  compute: async (): Promise<DashboardWidgetDTO> => {
    const logs = await dashboardRepository.findRecentPatchLogs(RECENT_PATCH_LOG_LIMIT)
    return {
      id: 'administrativo.ultimas-execucoes-patch',
      type: 'table',
      title: 'Últimas execuções de patch',
      order: 40,
      data: {
        columns: [{ key: 'versoes', label: 'Versões' }, { key: 'status', label: 'Status' }, { key: 'createdAt', label: 'Data' }],
        rows: logs.map((l) => ({ versoes: `${l.fromVersion} → ${l.toVersion}`, status: l.status, createdAt: l.createdAt.toISOString() })),
      },
    }
  },
})
