import { db } from '@/lib/db'
import { BaseRepository } from './base.repository'

const LIST_INCLUDE = {
  supplier: { select: { id: true, corporateName: true, tradeName: true } },
  requisition: { select: { id: true, number: true } },
  items: { include: { material: { select: { id: true, name: true, unit: true } } } },
  user: { select: { id: true, name: true } },
}
const DETAIL_INCLUDE = {
  supplier: true,
  requisition: { select: { id: true, number: true, status: true } },
  items: { include: { material: true, requisitionItem: { select: { id: true } } } },
  user: { select: { id: true, name: true } },
}
const MUTATION_INCLUDE = {
  items: { include: { material: true } },
  supplier: true,
}
const STATUS_INCLUDE = {
  items: { include: { material: true } },
  supplier: { select: { id: true, corporateName: true, tradeName: true } },
}
const CREATE_FROM_REQUISITION_INCLUDE = {
  items: true,
  supplier: { select: { id: true, corporateName: true, tradeName: true } },
}

class PurchaseOrderRepository extends BaseRepository<typeof db.purchaseOrder> {
  constructor() {
    super(db.purchaseOrder)
  }

  async findManyPaginated(where: Record<string, unknown>, skip: number, take: number) {
    const [data, total] = await Promise.all([
      this.delegate.findMany({ where, include: LIST_INCLUDE, orderBy: { createdAt: 'desc' }, skip, take }),
      this.delegate.count({ where }),
    ])
    return { data, total }
  }

  findByIdDetailed(id: string) {
    return this.delegate.findUnique({ where: { id }, include: DETAIL_INCLUDE })
  }

  findByIdWithItems(id: string) {
    return this.delegate.findUnique({
      where: { id },
      include: { items: { include: { material: { select: { lotControlled: true } } } } },
    })
  }

  /** Itens de Pedido de Compra ainda não recebidos/cancelados (Fase 6, ADR-007) — base do `onOrder` ao vivo do MRP. */
  findOpenItemsByMaterials(materialIds: string[]) {
    return db.purchaseOrderItem.findMany({
      where: { materialId: { in: materialIds }, purchaseOrder: { status: { notIn: ['received', 'cancelled'] } } },
      select: { materialId: true, quantity: true, quantityReceived: true },
    })
  }

  updateFields(id: string, data: Record<string, unknown>) {
    return this.delegate.update({ where: { id }, data, include: MUTATION_INCLUDE })
  }

  updateStatus(id: string, data: Record<string, unknown>) {
    return this.delegate.update({ where: { id }, data, include: STATUS_INCLUDE })
  }

  createFromRequisition(data: Record<string, unknown>) {
     
    return this.delegate.create({ data: data as any, include: CREATE_FROM_REQUISITION_INCLUDE })
  }

  /**
   * Recebimento físico de mercadoria: atualiza quantidade recebida por item, dá entrada
   * no estoque de matéria-prima e recalcula o status do pedido — tudo numa única transação
   * (ADR-001, princípio 3). Antes eram chamadas sequenciais soltas fora de transação.
   *
   * Fase 10, ADR-013: quando o material do item é `lotControlled`, cria (ou incrementa, se o
   * mesmo `batchNumber` já existir para o material — `@@unique([materialId, batchNumber])`) um
   * `MaterialBatch`, e liga o `StockMovement` diretamente a ele. `unitCost`/`receivedAt` do lote
   * NUNCA são sobrescritos num incremento — preservam o snapshot e a data do primeiro recebimento
   * daquele número de lote. `batchNumber` já vem resolvido pelo Service (fallback via
   * NumberingService quando o fornecedor não informa) — esta camada só aplica, nunca decide.
   */
  async receiveItems(
    purchaseOrder: { id: string; number: string; status: string; receivedAt: Date | null; supplierId?: string | null },
     
    itemsById: Map<string, any>,
    entries: Array<{ purchaseOrderItemId: string; quantityReceived: number; batchNumber?: string; expiresAt?: string }>,
    userId: string
  ) {
    return db.$transaction(async (tx) => {
      for (const entry of entries) {
        const item = itemsById.get(entry.purchaseOrderItemId)!
        await tx.purchaseOrderItem.update({
          where: { id: item.id },
          data: { quantityReceived: { increment: entry.quantityReceived } },
        })
        const material = await tx.material.update({
          where: { id: item.materialId },
          data: { stockQty: { increment: entry.quantityReceived } },
        })

        let materialBatchId: string | null = null
        if (item.material?.lotControlled && entry.batchNumber) {
          const existingBatch = await tx.materialBatch.findUnique({
            where: { materialId_batchNumber: { materialId: item.materialId, batchNumber: entry.batchNumber } },
          })
          if (existingBatch) {
            const incrementedBatch = await tx.materialBatch.update({
              where: { id: existingBatch.id },
              data: {
                quantityReceived: { increment: entry.quantityReceived },
                quantityAvailable: { increment: entry.quantityReceived },
              },
            })
            materialBatchId = incrementedBatch.id
          } else {
            const createdBatch = await tx.materialBatch.create({
              data: {
                materialId: item.materialId,
                batchNumber: entry.batchNumber,
                supplierId: purchaseOrder.supplierId ?? null,
                purchaseOrderId: purchaseOrder.id,
                purchaseOrderItemId: item.id,
                quantityReceived: entry.quantityReceived,
                quantityAvailable: entry.quantityReceived,
                unitCost: item.unitPrice ?? 0,
                expiresAt: entry.expiresAt ? new Date(entry.expiresAt) : null,
              },
            })
            materialBatchId = createdBatch.id
          }
        }

        await tx.stockMovement.create({
          data: {
            itemType: 'material',
            materialId: item.materialId,
            type: 'IN',
            quantity: entry.quantityReceived,
            balanceAfter: material.stockQty,
            reason: `Recebimento do pedido de compra ${purchaseOrder.number}`,
            referenceType: 'purchase_order',
            referenceId: purchaseOrder.id,
            userId,
            materialBatchId,
          },
        })
      }

      const refreshedItems = await tx.purchaseOrderItem.findMany({ where: { purchaseOrderId: purchaseOrder.id } })
      const allComplete = refreshedItems.every((i) => i.quantityReceived >= i.quantity)
      const someReceived = refreshedItems.some((i) => i.quantityReceived > 0)
      const newStatus = allComplete ? 'received' : someReceived ? 'partially_received' : purchaseOrder.status

      const updated = await tx.purchaseOrder.update({
        where: { id: purchaseOrder.id },
        data: {
          status: newStatus,
          receivedAt: newStatus === 'received' ? new Date() : purchaseOrder.receivedAt,
        },
        include: STATUS_INCLUDE,
      })

      return { updated, newStatus }
    })
  }
}

export const purchaseOrderRepository = new PurchaseOrderRepository()
