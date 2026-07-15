import { db } from '@/lib/db'
import { BaseRepository } from './base.repository'

const LIST_INCLUDE = {
  items: { include: { material: { select: { id: true, name: true, unit: true } }, supplier: { select: { id: true, corporateName: true, tradeName: true } } } },
  productionOrder: { select: { id: true, number: true, productName: true } },
  user: { select: { id: true, name: true } },
}
const DETAIL_INCLUDE = {
  items: { include: { material: true, supplier: true, quotes: { include: { supplier: { select: { id: true, corporateName: true, tradeName: true } } }, orderBy: { price: 'asc' as const } } } },
  productionOrder: { select: { id: true, number: true, productName: true } },
  user: { select: { id: true, name: true } },
}
const MUTATION_INCLUDE = {
  items: { include: { material: true, supplier: true } },
  productionOrder: { select: { id: true, number: true } },
  user: { select: { id: true, name: true } },
}
const STATUS_INCLUDE = {
  items: { include: { material: true, supplier: true } },
  productionOrder: { select: { id: true, number: true } },
}

class RequisitionRepository extends BaseRepository<typeof db.requisition> {
  constructor() {
    super(db.requisition)
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
    return this.delegate.findUnique({ where: { id }, include: { items: { include: { material: true, supplier: true } } } })
  }

  createWithItems(data: Record<string, unknown>) {
     
    return this.delegate.create({ data: data as any, include: { items: { include: { material: true, supplier: true } }, productionOrder: { select: { id: true, number: true } }, user: { select: { id: true, name: true } } } })
  }

  deleteAllItems(requisitionId: string) {
    return db.requisitionItem.deleteMany({ where: { requisitionId } })
  }

  updateWithItems(id: string, data: Record<string, unknown>) {
    return this.delegate.update({ where: { id }, data, include: MUTATION_INCLUDE })
  }

  updateStatus(id: string, data: Record<string, unknown>) {
    return this.delegate.update({ where: { id }, data, include: STATUS_INCLUDE })
  }

  /**
   * Transição para "ordered" (Fase 7, ADR-009): calcula, por item, quanto é atendido pelo estoque
   * disponível e quanto ainda precisa ser comprado, dá baixa real no estoque da parte atendida
   * (primeira vez que Requisição move estoque) e só então avança o status — tudo numa única
   * transação. Quando `skipStockCheck` é verdadeiro (Requisição originada do MRP, que já fez esse
   * netting no próprio cálculo), nenhum estoque é reconsultado: a quantidade inteira do item vai
   * para `quantityToPurchase`, sem gerar nenhum `StockMovement`.
   */
  async advanceToOrderedWithFulfillment(
    id: string,
    requisitionNumber: string,
    items: Array<{ id: string; materialId: string | null; quantity: number }>,
    userId: string,
    skipStockCheck: boolean
  ) {
    return db.$transaction(async (tx) => {
      for (const item of items) {
        if (!item.materialId || skipStockCheck) {
          await tx.requisitionItem.update({
            where: { id: item.id },
            data: { quantityFromStock: 0, quantityToPurchase: item.quantity },
          })
          continue
        }

        const material = await tx.material.findUnique({ where: { id: item.materialId } })
        const fromStock = Math.min(item.quantity, material?.stockQty ?? 0)
        const toPurchase = item.quantity - fromStock

        await tx.requisitionItem.update({
          where: { id: item.id },
          data: { quantityFromStock: fromStock, quantityToPurchase: toPurchase },
        })

        if (fromStock > 0) {
          const updatedMaterial = await tx.material.update({
            where: { id: item.materialId },
            data: { stockQty: { decrement: fromStock } },
          })
          await tx.stockMovement.create({
            data: {
              itemType: 'material',
              materialId: item.materialId,
              type: 'OUT',
              quantity: fromStock,
              balanceAfter: updatedMaterial.stockQty,
              reason: `Atendimento por estoque — Requisição ${requisitionNumber}`,
              referenceType: 'requisition',
              referenceId: id,
              userId,
            },
          })
        }
      }

      return tx.requisition.update({ where: { id }, data: { status: 'ordered' }, include: STATUS_INCLUDE })
    })
  }

  /**
   * Cria uma Requisição a partir de uma MrpSuggestion aprovada (Fase 7, ADR-009), atualizando o
   * status da sugestão para "accepted" na MESMA transação — as duas coisas são uma única ação de
   * negócio (ADR-001, princípio 3).
   */
  async createFromMrpSuggestion(data: Record<string, unknown>, mrpSuggestionId: string) {
    return db.$transaction(async (tx) => {
       
      const requisition = await tx.requisition.create({ data: data as any, include: MUTATION_INCLUDE })
      await tx.mrpSuggestion.update({ where: { id: mrpSuggestionId }, data: { status: 'accepted' } })
      return requisition
    })
  }

  // ── Cotações de item (RequisitionItemQuote) ──
  findItemById(itemId: string) {
    return db.requisitionItem.findUnique({ where: { id: itemId } })
  }

  listItemQuotes(requisitionItemId: string) {
    return db.requisitionItemQuote.findMany({
      where: { requisitionItemId },
      include: { supplier: { select: { id: true, corporateName: true, tradeName: true } } },
      orderBy: { price: 'asc' },
    })
  }

  createItemQuote(data: { requisitionItemId: string; supplierId: string; price: number; leadTimeDays: number; notes: string }) {
    return db.requisitionItemQuote.create({
      data,
      include: { supplier: { select: { id: true, corporateName: true, tradeName: true } } },
    })
  }

  findItemQuoteById(quoteId: string) {
    return db.requisitionItemQuote.findUnique({ where: { id: quoteId }, include: { supplier: true } })
  }

  async selectItemQuote(itemId: string, quoteId: string, supplierId: string, price: number) {
    await db.requisitionItemQuote.updateMany({ where: { requisitionItemId: itemId }, data: { isSelected: false } })
    await db.requisitionItemQuote.update({ where: { id: quoteId }, data: { isSelected: true } })
    return db.requisitionItem.update({
      where: { id: itemId },
      data: { supplierId, estimatedPrice: price },
      include: { material: true, supplier: true },
    })
  }
}

export const requisitionRepository = new RequisitionRepository()
