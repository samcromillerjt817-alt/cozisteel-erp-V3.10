import { db } from '@/lib/db'

/**
 * Histórico de transição de status (ADR-001, Princípio 7 / Fase 2.1) — write-only por
 * enquanto, sem consulta própria: cada Service com máquina de estados grava um registro logo
 * após `checkTransition()` validar a transição, antes de decidir o que mais fazer com ela.
 */
class StatusHistoryService {
  async record(entityType: string, entityId: string, fromStatus: string, toStatus: string, userId: string) {
    return db.statusHistory.create({
      data: { entityType, entityId, fromStatus, toStatus, userId },
    })
  }
}

export const statusHistoryService = new StatusHistoryService()
