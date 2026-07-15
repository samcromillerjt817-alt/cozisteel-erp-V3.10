import { materialReservationRepository } from '@/app/repositories/material-reservation.repository'
import { productionOrderRepository } from '@/app/repositories/production-order.repository'
import { bomExplosionService } from '@/app/services/bom-explosion.service'
import { NotFoundException } from '@/app/exceptions'

interface ProductionOrderForReservation {
  id: string
  number: string
  productId: string | null
  quantity: number
  bomRevisionId: string | null
}

/**
 * Reserva de Material (Fase 5, ADR-006). Nenhuma reserva bloqueia a criação ou o andamento da OP —
 * reserva parcial (shortfall > 0) é um resultado normal, não um erro. Não integra com Compras/MRP
 * ainda (fora do escopo desta fase).
 */
class MaterialReservationService {
  /**
   * Explode a BOM da revisão CONGELADA na OP (`ProductionOrder.bomRevisionId`) — nunca a revisão
   * atualmente liberada do produto, que pode ter mudado desde a criação da OP — e reserva o que
   * der do saldo disponível. Idempotente: chamar de novo para a mesma OP sem nada ter mudado não
   * duplica reserva nem gera movimento novo; chamar depois que chegou saldo novo (retentativa/
   * "reabertura", ver ADR-006) só reserva o delta que faltava.
   */
  async reserveForProductionOrder(productionOrderId: string, userId: string) {
    const order = (await productionOrderRepository.findById(productionOrderId)) as ProductionOrderForReservation | null
    if (!order) throw new NotFoundException('Ordem de produção não encontrada')

    // Sem produto ou sem revisão vinculada — OP sem engenharia formal, comportamento herdado
    // preservado (nada a reservar, nenhuma quebra de compatibilidade).
    if (!order.productId || !order.bomRevisionId) return []

    const explosion = await bomExplosionService.explodeRevision(order.bomRevisionId, order.quantity, order.productId)

    const needs: Array<{ itemType: 'material' | 'product'; itemId: string; quantityNeeded: number }> = []
    for (const [materialId, quantityNeeded] of explosion.materialNeeds) {
      needs.push({ itemType: 'material', itemId: materialId, quantityNeeded })
    }
    for (const [componentProductId, quantityNeeded] of explosion.productNeeds) {
      needs.push({ itemType: 'product', itemId: componentProductId, quantityNeeded })
    }

    if (needs.length === 0) return []

    return materialReservationRepository.reserveMany(order.id, order.number, needs, userId)
  }

  /**
   * Libera toda reserva ainda ativa de uma OP — cancelamento. Preserva histórico (nunca apaga
   * `MaterialReservation`, só zera o reservado e marca `released`, gerando o `StockMovement`
   * RELEASE correspondente). Idempotente: chamar de novo numa OP já liberada não gera duplicidade.
   */
  async releaseForProductionOrder(productionOrderId: string, userId: string, reason: string) {
    const order = await productionOrderRepository.findById(productionOrderId)
    if (!order) throw new NotFoundException('Ordem de produção não encontrada')

    return materialReservationRepository.releaseMany(productionOrderId, userId, reason)
  }

  async listReservations(productionOrderId: string) {
    return materialReservationRepository.findManyByOrder(productionOrderId)
  }
}

export const materialReservationService = new MaterialReservationService()
