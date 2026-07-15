import { db } from '@/lib/db'
import type { Prisma } from '@prisma/client'
import { BaseRepository } from './base.repository'

type Tx = Prisma.TransactionClient

interface ReservationNeed {
  itemType: 'material' | 'product'
  itemId: string
  quantityNeeded: number
}

class MaterialReservationRepository extends BaseRepository<typeof db.materialReservation> {
  constructor() {
    super(db.materialReservation)
  }

  findManyByOrder(productionOrderId: string) {
    return this.delegate.findMany({ where: { productionOrderId } })
  }

  /**
   * Reserva TODOS os itens necessários de uma OP numa única transação (ADR-001, princípio 3;
   * ADR-006 — "toda reserva deve ocorrer dentro de uma única transação") — atômico: ou o conjunto
   * inteiro de itens desta tentativa de reserva é processado, ou nada é gravado. Cada item é
   * idempotente individualmente (ver `reserveItemWithTx`).
   */
  async reserveMany(productionOrderId: string, orderNumber: string, needs: ReservationNeed[], userId: string) {
    return db.$transaction(async (tx) => {
      const results = []
      for (const need of needs) {
        results.push(await this.reserveItemWithTx(tx, productionOrderId, orderNumber, need.itemType, need.itemId, need.quantityNeeded, userId))
      }
      return results
    })
  }

  /**
   * Reserva (ou complementa) UM item, dentro de uma transação já aberta pelo chamador.
   * Idempotente: se a necessidade não mudou e não há saldo novo pra reservar, não escreve nada —
   * nem StockMovement, nem atualização de saldo, nem toque na linha de MaterialReservation.
   */
  private async reserveItemWithTx(
    tx: Tx,
    productionOrderId: string,
    orderNumber: string,
    itemType: 'material' | 'product',
    itemId: string,
    quantityNeeded: number,
    userId: string
  ) {
    const existing = await tx.materialReservation.findFirst({
      where: {
        productionOrderId,
        itemType,
        materialId: itemType === 'material' ? itemId : null,
        productId: itemType === 'product' ? itemId : null,
      },
    })

    const itemRecord =
      itemType === 'material'
        ? await tx.material.findUnique({ where: { id: itemId } })
        : await tx.product.findUnique({ where: { id: itemId } })
    if (!itemRecord) return existing // item sumiu — não deveria acontecer; não derruba a reserva dos outros itens da OP

    const availableQty = Math.max(0, itemRecord.stockQty - itemRecord.reservedQty)
    const alreadyReserved = existing?.quantityReserved ?? 0
    const remainingNeed = Math.max(0, quantityNeeded - alreadyReserved)
    const deltaToReserve = Math.min(remainingNeed, availableQty)

    // Idempotência total: nada novo pra reservar E a necessidade não mudou desde a última vez → no-op puro.
    const isNoOp = deltaToReserve === 0 && existing !== null && existing.quantityNeeded === quantityNeeded
    if (isNoOp) return existing

    if (deltaToReserve > 0) {
      const updatedItem =
        itemType === 'material'
          ? await tx.material.update({ where: { id: itemId }, data: { reservedQty: { increment: deltaToReserve } } })
          : await tx.product.update({ where: { id: itemId }, data: { reservedQty: { increment: deltaToReserve } } })

      await tx.stockMovement.create({
        data: {
          itemType,
          materialId: itemType === 'material' ? itemId : null,
          productId: itemType === 'product' ? itemId : null,
          type: 'RESERVE',
          quantity: deltaToReserve,
          balanceAfter: updatedItem.stockQty - updatedItem.reservedQty,
          reason: `Reserva para Ordem de Produção ${orderNumber}`,
          referenceType: 'production_order',
          referenceId: productionOrderId,
          userId,
        },
      })
    }

    const newReserved = alreadyReserved + deltaToReserve
    const newShortfall = Math.max(0, quantityNeeded - newReserved)
    const newStatus = newShortfall === 0 ? 'reserved' : 'partial'

    if (existing) {
      return tx.materialReservation.update({
        where: { id: existing.id },
        data: { quantityNeeded, quantityReserved: newReserved, quantityShortfall: newShortfall, status: newStatus },
      })
    }

    return tx.materialReservation.create({
      data: {
        productionOrderId,
        itemType,
        materialId: itemType === 'material' ? itemId : null,
        productId: itemType === 'product' ? itemId : null,
        quantityNeeded,
        quantityReserved: newReserved,
        quantityShortfall: newShortfall,
        status: newStatus,
      },
    })
  }

  /**
   * Libera TODA reserva ainda ativa de uma OP numa única transação — cancelamento. Preserva
   * histórico (nunca apaga `MaterialReservation`, só zera o reservado e marca `released`).
   * Idempotente: se já não há nada ativo, a transação não escreve nada.
   *
   * `consumed` é um estado TERMINAL (ADR-012, decisão do usuário 2026-07-10): uma reserva já gasta
   * em produção nunca é tocada aqui, mesmo que a OP seja cancelada depois — cancelamento nunca
   * reclassifica "consumido de fato" como "liberado sem uso". `reserved`/`partial` continuam sendo
   * liberados normalmente.
   */
  async releaseMany(productionOrderId: string, userId: string, reason: string) {
    return db.$transaction(async (tx) => {
      const reservations = await tx.materialReservation.findMany({
        where: { productionOrderId, status: { notIn: ['released', 'consumed'] } },
      })
      const results = []
      for (const reservation of reservations) {
        results.push(await this.releaseItemWithTx(tx, reservation, userId, reason))
      }
      return results
    })
  }

  private async releaseItemWithTx(
    tx: Tx,
     
    reservation: any,
    userId: string,
    reason: string
  ) {
    if (reservation.quantityReserved > 0) {
      const itemId = reservation.itemType === 'material' ? reservation.materialId : reservation.productId
      const updatedItem =
        reservation.itemType === 'material'
          ? await tx.material.update({ where: { id: itemId }, data: { reservedQty: { decrement: reservation.quantityReserved } } })
          : await tx.product.update({ where: { id: itemId }, data: { reservedQty: { decrement: reservation.quantityReserved } } })

      await tx.stockMovement.create({
        data: {
          itemType: reservation.itemType,
          materialId: reservation.itemType === 'material' ? itemId : null,
          productId: reservation.itemType === 'product' ? itemId : null,
          type: 'RELEASE',
          quantity: reservation.quantityReserved,
          balanceAfter: updatedItem.stockQty - updatedItem.reservedQty,
          reason,
          referenceType: 'production_order',
          referenceId: reservation.productionOrderId,
          userId,
        },
      })
    }

    return tx.materialReservation.update({
      where: { id: reservation.id },
      data: { quantityReserved: 0, quantityShortfall: reservation.quantityNeeded, status: 'released' },
    })
  }
}

export const materialReservationRepository = new MaterialReservationRepository()
