import { db } from '@/lib/db'

/**
 * Histórico de transição de status (ADR-001, Princípio 7 / Fase 2.1). `record()` era write-only até
 * o ADR-022 (Fase UX-2, achado #14) — gravado em toda transição desde a Fase 2, nunca exibido em
 * nenhuma tela. `list()` fecha essa lacuna: mesma tabela, sem migração, ordenado do mais antigo pro
 * mais recente (é uma linha do tempo de UMA entidade, não um log — faz mais sentido ler como história
 * do que como "mais recente primeiro").
 */
class StatusHistoryService {
  async record(entityType: string, entityId: string, fromStatus: string, toStatus: string, userId: string, reason = '') {
    return db.statusHistory.create({
      data: { entityType, entityId, fromStatus, toStatus, userId, reason },
    })
  }

  async list(entityType: string, entityId: string) {
    return db.statusHistory.findMany({
      where: { entityType, entityId },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    })
  }
}

export const statusHistoryService = new StatusHistoryService()
