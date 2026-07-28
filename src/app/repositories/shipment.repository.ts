import { db } from '@/lib/db'
import { BaseRepository } from './base.repository'

const DETAIL_INCLUDE = {
  salesOrder: { select: { id: true, number: true, clientName: true, status: true } },
  user: { select: { id: true, name: true } },
  items: { include: { salesOrderItem: { select: { id: true, description: true, code: true, unit: true } } } },
}

class ShipmentRepository extends BaseRepository<typeof db.shipment> {
  constructor() {
    super(db.shipment)
  }

  findByIdDetailed(id: string) {
    return this.delegate.findUnique({ where: { id }, include: DETAIL_INCLUDE })
  }

  /** ADR-023 (item 6) — expedições de UM pedido, mais recente primeiro (histórico de entregas parciais). */
  findManyBySalesOrder(salesOrderId: string) {
    return this.delegate.findMany({ where: { salesOrderId }, include: DETAIL_INCLUDE, orderBy: { createdAt: 'desc' } })
  }

  createDetailed(data: Record<string, unknown>) {
    return this.delegate.create({ data: data as any, include: DETAIL_INCLUDE })
  }

  updateDetailed(id: string, data: Record<string, unknown>) {
    return this.delegate.update({ where: { id }, data, include: DETAIL_INCLUDE })
  }
}

export const shipmentRepository = new ShipmentRepository()
