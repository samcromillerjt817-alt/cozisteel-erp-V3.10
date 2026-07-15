import { stockRepository } from '@/app/repositories/stock.repository'
import { materialRepository } from '@/app/repositories/material.repository'
import { productRepository } from '@/app/repositories/product.repository'
import { auditService } from '@/app/services/audit.service'
import { NotFoundException, BadRequestException } from '@/app/exceptions'

export interface StockSummaryInput {
  type?: string
  search?: string
  lowStockOnly?: boolean
}

export interface ListStockMovementsInput {
  itemType?: string
  materialId?: string
  productId?: string
  page: number
  limit: number
}

interface StockItemRecord {
  id: string
  name: string
  stockQty: number
}

class StockService {
  /**
   * Ajuste manual de inventário — define o saldo para um valor absoluto (contagem física)
   * e registra a diferença como um StockMovement do tipo ADJUST, com o motivo informado.
   */
  async adjust(itemType: string, itemId: string, newQuantity: number, reason: string, userId: string) {
    if (!itemType || !['material', 'product'].includes(itemType)) {
      throw new BadRequestException('itemType deve ser "material" ou "product"')
    }
    if (!itemId) throw new BadRequestException('itemId é obrigatório')
    if (typeof newQuantity !== 'number' || newQuantity < 0) {
      throw new BadRequestException('newQuantity deve ser um número maior ou igual a zero')
    }
    if (!reason || !String(reason).trim()) {
      throw new BadRequestException('Informe o motivo do ajuste de inventário')
    }

    let previousQty = 0
    let balanceAfter = 0
    let entityName = ''

    if (itemType === 'material') {
      const material = (await materialRepository.findById(itemId)) as StockItemRecord | null
      if (!material) throw new NotFoundException('Matéria-prima não encontrada')
      previousQty = material.stockQty
      const updated = (await materialRepository.update(itemId, { stockQty: newQuantity })) as StockItemRecord
      balanceAfter = updated.stockQty
      entityName = material.name
    } else {
      const product = (await productRepository.findById(itemId)) as StockItemRecord | null
      if (!product) throw new NotFoundException('Produto não encontrado')
      previousQty = product.stockQty
      const updated = (await productRepository.update(itemId, { stockQty: newQuantity })) as StockItemRecord
      balanceAfter = updated.stockQty
      entityName = product.name
    }

    const delta = newQuantity - previousQty

    const movement = await stockRepository.createMovement({
      itemType,
      materialId: itemType === 'material' ? itemId : null,
      productId: itemType === 'product' ? itemId : null,
      type: 'ADJUST',
      quantity: Math.abs(delta),
      balanceAfter,
      reason: `Ajuste de inventário: ${reason}`,
      referenceType: 'manual',
      userId,
    })

    await auditService.log({
      userId,
      action: 'UPDATE',
      module: 'estoque',
      entityId: itemId,
      entityName,
      details: `Ajuste de inventário em "${entityName}": ${previousQty} → ${newQuantity} (${delta >= 0 ? '+' : ''}${delta}). Motivo: ${reason}`,
    })

    return { movement, previousQty, newQuantity, delta }
  }

  /** Fonte oficial de saldo disponível no ERP — reúne matéria-prima e produto acabado numa mesma visão, já sinalizando quem está abaixo do mínimo. */
  async summary({ type = 'all', search = '', lowStockOnly = false }: StockSummaryInput) {
     
    const results: any[] = []

    if (type === 'all' || type === 'material') {
      const materials = await stockRepository.findMaterials(search ? { name: { contains: search } } : undefined)
      for (const m of materials) {
        if (lowStockOnly && m.stockQty > m.minStockQty) continue
        results.push({
          itemType: 'material', id: m.id, name: m.name, internalCode: m.internalCode,
          unit: m.unit, stockQty: m.stockQty, minStockQty: m.minStockQty, costPrice: m.costPrice,
          isLow: m.stockQty <= m.minStockQty,
        })
      }
    }

    if (type === 'all' || type === 'product') {
      const products = await stockRepository.findProducts(search ? { name: { contains: search } } : undefined)
      for (const p of products) {
        if (lowStockOnly && p.stockQty > p.minStockQty) continue
        results.push({
          itemType: 'product', id: p.id, name: p.name, internalCode: p.internalCode,
          unit: p.unit, stockQty: p.stockQty, minStockQty: p.minStockQty, costPrice: p.costPrice,
          isLow: p.stockQty <= p.minStockQty,
        })
      }
    }

    return results
  }

  /** Histórico oficial de movimentações de estoque (entradas, saídas, ajustes). */
  async listMovements({ itemType, materialId, productId, page, limit }: ListStockMovementsInput) {
    const where: Record<string, unknown> = {}
    if (itemType) where.itemType = itemType
    if (materialId) where.materialId = materialId
    if (productId) where.productId = productId

    const { data, total } = await stockRepository.findManyMovementsPaginated(where, (page - 1) * limit, limit)
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) }
  }
}

export const stockService = new StockService()
