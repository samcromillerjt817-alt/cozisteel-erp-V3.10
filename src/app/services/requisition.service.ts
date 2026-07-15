import { requisitionRepository } from '@/app/repositories/requisition.repository'
import { productionOrderRepository } from '@/app/repositories/production-order.repository'
import { materialRepository } from '@/app/repositories/material.repository'
import { supplierRepository } from '@/app/repositories/supplier.repository'
import { numberingService } from '@/app/services/numbering.service'
import { auditService } from '@/app/services/audit.service'
import { statusHistoryService } from '@/app/services/status-history.service'
import { domainEvents, DOMAIN_EVENTS } from '@/lib/domain-events'
import type { RequisicaoAprovadaParaCompraPayload, RequisicaoCriadaPayload } from '@/lib/domain-events'
import { NotFoundException, BadRequestException } from '@/app/exceptions'
import { checkTransition } from '@/lib/status-machine'
import { formatDate } from '@/lib/format'
import type { CreateRequisitionDto, UpdateRequisitionDto } from '@/app/dto'

export interface ListRequisitionsInput {
  status?: string
  search?: string
  productionOrderId?: string
  page: number
  limit: number
}

/** Allowed forward transitions in the requisition approval/purchase flow */
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  draft: ['sent', 'cancelled'],
  sent: ['approved', 'cancelled', 'draft'],
  approved: ['ordered', 'cancelled'],
  ordered: ['cancelled'], // fulfillment agora rastreado no(s) PurchaseOrder(s) vinculado(s)
  cancelled: [],
}

interface RequisitionRecord {
  id: string
  number: string
  status: string
  tipo: string
  originModule: string
  items: Array<{
    id: string
    materialId: string | null
    supplierId: string | null
    quantity: number
    unit: string
    estimatedPrice: number
    originMrpSuggestionId: string | null
  }>
}

interface RequisitionWithItems {
  id: string
  number: string
  status: string
  originModule: string
  items: Array<{ id: string; supplierId: string | null; materialId: string | null; quantity: number; unit: string; estimatedPrice: number }>
}

class RequisitionService {
  async list({ status, search, productionOrderId, page, limit }: ListRequisitionsInput) {
    const where: Record<string, unknown> = {}
    if (status) where.status = status
    if (productionOrderId) where.productionOrderId = productionOrderId
    if (search) {
      where.OR = [
        { number: { contains: search } },
        { notes: { contains: search } },
      ]
    }
    const { data, total } = await requisitionRepository.findManyPaginated(where, (page - 1) * limit, limit)
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) }
  }

  async getById(id: string) {
    const requisition = await requisitionRepository.findByIdDetailed(id)
    if (!requisition) throw new NotFoundException('Requisição não encontrada')
    return requisition
  }

  async create(data: CreateRequisitionDto, userId: string) {
    if (data.productionOrderId) {
      const po = await productionOrderRepository.findById(data.productionOrderId)
      if (!po) throw new BadRequestException('Ordem de produção informada não existe')
    }

    for (const item of data.items) {
      if (!item.materialId) continue // item não-estocável (Fase 7, ADR-009) — usa `description`, não há o que validar
      const material = await materialRepository.findById(item.materialId)
      if (!material) throw new BadRequestException(`Matéria-prima ${item.materialId} não encontrada`)
    }

    const number = await numberingService.getNextNumber('requisicao')

    const requisition = (await requisitionRepository.createWithItems({
      number,
      status: 'draft',
      tipo: data.tipo,
      originModule: data.originModule,
      productionOrderId: data.productionOrderId || null,
      date: formatDate(new Date()),
      neededBy: data.neededBy,
      notes: data.notes,
      userId,
      items: {
        create: data.items.map((item) => ({
          materialId: item.materialId || null,
          description: item.description,
          supplierId: item.supplierId || null,
          quantity: item.quantity,
          unit: item.unit,
          estimatedPrice: item.estimatedPrice,
          notes: item.notes,
        })),
      },
    })) as RequisitionRecord

    await auditService.log({
      userId,
      action: 'CREATE',
      module: 'requisicoes',
      entityId: requisition.id,
      entityName: requisition.number,
      details: `Requisição ${requisition.number} criada com ${data.items.length} item(ns) de matéria-prima`,
    })

    // Emitido sem consumidor nesta fase (ADR-003) — preparação para MRP/notificação futuros.
    await domainEvents.publish<RequisicaoCriadaPayload, void>(DOMAIN_EVENTS.REQUISICAO_CRIADA, {
      requisitionId: requisition.id,
      requisitionNumber: requisition.number,
      userId,
    })

    return requisition
  }

  /**
   * Cria uma Requisição Tipo="PRODUCAO" a partir de uma MrpSuggestion de compra aprovada
   * (Fase 7, ADR-009). `originModule: "mrp"` — a regra de atendimento por estoque (`changeStatus`)
   * pula a checagem para esta Requisição, porque o motor de cálculo do MRP já descontou estoque/
   * reservas/compras/produção em andamento; `quantityShortfall` já É a necessidade líquida final.
   */
  async createFromMrpSuggestion(
    suggestion: {
      id: string
      materialId: string | null
      quantityShortfall: number
      supplierId: string | null
      material: { name: string; unit: string } | null
    },
    userId: string
  ) {
    if (!suggestion.materialId) {
      throw new BadRequestException('Sugestão sem matéria-prima vinculada não pode virar Requisição nesta fase')
    }

    const number = await numberingService.getNextNumber('requisicao')

    const requisition = (await requisitionRepository.createFromMrpSuggestion(
      {
        number,
        status: 'draft',
        tipo: 'PRODUCAO',
        originModule: 'mrp',
        date: formatDate(new Date()),
        neededBy: '',
        notes: 'Gerada automaticamente a partir de uma sugestão aprovada do MRP',
        userId,
        items: {
          create: [
            {
              materialId: suggestion.materialId,
              supplierId: suggestion.supplierId,
              quantity: suggestion.quantityShortfall,
              unit: suggestion.material?.unit || 'KG',
              estimatedPrice: 0,
              notes: '',
              originMrpSuggestionId: suggestion.id,
            },
          ],
        },
      },
      suggestion.id
    )) as RequisitionRecord

    await auditService.log({
      userId,
      action: 'CREATE',
      module: 'requisicoes',
      entityId: requisition.id,
      entityName: requisition.number,
      details: `Requisição ${requisition.number} gerada a partir de sugestão aprovada do MRP (${suggestion.material?.name || suggestion.materialId})`,
    })

    await domainEvents.publish<RequisicaoCriadaPayload, void>(DOMAIN_EVENTS.REQUISICAO_CRIADA, {
      requisitionId: requisition.id,
      requisitionNumber: requisition.number,
      userId,
    })

    return requisition
  }

  /** Only draft requisitions can have their items edited — once sent/approved, use the status route to advance the flow. */
  async update(id: string, data: UpdateRequisitionDto, userId: string) {
    const target = (await requisitionRepository.findById(id)) as RequisitionRecord | null
    if (!target) throw new NotFoundException('Requisição não encontrada')
    if (target.status !== 'draft') {
      throw new BadRequestException('Apenas requisições em rascunho podem ser editadas')
    }

    const updateData: Record<string, unknown> = {}
    if (data.neededBy !== undefined) updateData.neededBy = data.neededBy
    if (data.notes !== undefined) updateData.notes = data.notes

    if (data.items) {
      await requisitionRepository.deleteAllItems(id)
      updateData.items = {
        create: data.items.map((item) => ({
          materialId: item.materialId || null,
          description: item.description,
          supplierId: item.supplierId || null,
          quantity: item.quantity,
          unit: item.unit,
          estimatedPrice: item.estimatedPrice,
          notes: item.notes,
        })),
      }
    }

    const updated = await requisitionRepository.updateWithItems(id, updateData)

    await auditService.log({
      userId,
      action: 'UPDATE',
      module: 'requisicoes',
      entityId: id,
      entityName: target.number,
      details: `Requisição ${target.number} atualizada`,
    })

    return updated
  }

  async delete(id: string, userId: string) {
    const requisition = (await requisitionRepository.findById(id)) as RequisitionRecord | null
    if (!requisition) throw new NotFoundException('Requisição não encontrada')
    if (!['draft', 'cancelled'].includes(requisition.status)) {
      throw new BadRequestException('Apenas requisições em rascunho ou canceladas podem ser excluídas')
    }

    await requisitionRepository.delete(id)

    await auditService.log({
      userId,
      action: 'DELETE',
      module: 'requisicoes',
      entityId: id,
      entityName: requisition.number,
      details: `Requisição ${requisition.number} excluída`,
    })

    return { success: true }
  }

  /**
   * Ao avançar a Requisição para "ordered": calcula o atendimento por estoque disponível (Fase 7,
   * ADR-009) — só o saldo faltante (`quantityToPurchase`) vira Pedido de Compra, nunca a quantidade
   * cheia. Requisições originadas do MRP (`originModule === "mrp"`) pulam essa checagem: o motor de
   * cálculo já descontou estoque/reservas/compras/produção em andamento, refazer o desconto aqui
   * subtrairia o mesmo saldo duas vezes. Publica o evento `requisicao.aprovada_para_compra`
   * (ADR-003) — quem consome (PurchaseOrderService) é resolvido em
   * `register-domain-event-handlers.ts`, não importado aqui.
   */
  async changeStatus(id: string, status: string, userId: string) {
    const requisition = (await requisitionRepository.findByIdWithItems(id)) as RequisitionWithItems | null
    if (!requisition) throw new NotFoundException('Requisição não encontrada')

    const transitionError = checkTransition(requisition.status, status, ALLOWED_TRANSITIONS)
    if (transitionError) throw new BadRequestException(transitionError)

    const skipStockCheck = requisition.originModule === 'mrp'

    if (status === 'ordered') {
      // Só itens que de fato vão precisar de compra exigem cotação vencedora — itens sem
      // matéria-prima nunca viram Pedido de Compra nesta fase (Compras segue limitado a Material),
      // e um item cujo saldo em estoque já cobre tudo não precisa de fornecedor nenhum.
      const itemsNeedingSupplier = []
      for (const item of requisition.items) {
        if (!item.materialId) continue
        if (skipStockCheck) {
          itemsNeedingSupplier.push(item)
          continue
        }
        const material = (await materialRepository.findById(item.materialId)) as { stockQty: number } | null
        const projectedToPurchase = Math.max(0, item.quantity - (material?.stockQty ?? 0))
        if (projectedToPurchase > 0) itemsNeedingSupplier.push(item)
      }
      const itemsWithoutWinner = itemsNeedingSupplier.filter((i) => !i.supplierId)
      if (itemsWithoutWinner.length > 0) {
        throw new BadRequestException('Todos os itens que ainda precisam de compra devem ter uma cotação vencedora selecionada antes de avançar para "Pedido feito"')
      }
    }

    let updated: { items: Array<{ id: string; materialId: string | null; supplierId: string | null; quantity: number; quantityToPurchase: number; unit: string; estimatedPrice: number }> }
    if (status === 'ordered') {
      updated = (await requisitionRepository.advanceToOrderedWithFulfillment(
        id,
        requisition.number,
        requisition.items,
        userId,
        skipStockCheck
      )) as typeof updated
    } else {
      const updateData: Record<string, unknown> = { status }
      if (status === 'approved') {
        updateData.approvedBy = userId
        updateData.approvedAt = new Date()
      }
      updated = (await requisitionRepository.updateStatus(id, updateData)) as typeof updated
    }

    await statusHistoryService.record('requisition', id, requisition.status, status, userId)

    await auditService.log({
      userId,
      action: 'PATCH',
      module: 'requisicoes',
      entityId: id,
      entityName: requisition.number,
      details: `Status da requisição ${requisition.number} alterado de "${requisition.status}" para "${status}"`,
      beforeValue: { status: requisition.status },
      afterValue: { status },
    })

    let generatedPurchaseOrders: Array<{ id: string; number: string }> = []
    if (status === 'ordered' && requisition.status !== 'ordered') {
      // Só itens com matéria-prima e saldo de fato faltante viram linha de Pedido de Compra —
      // quantityToPurchase (não a quantidade cheia) é o que alimenta a compra.
      const itemsToPurchase = updated.items
        .filter((i) => i.materialId && i.quantityToPurchase > 0)
        .map((i) => ({
          id: i.id,
          supplierId: i.supplierId,
          materialId: i.materialId as string,
          quantity: i.quantityToPurchase,
          unit: i.unit,
          estimatedPrice: i.estimatedPrice,
        }))

      const results = itemsToPurchase.length > 0
        ? await domainEvents.publish<RequisicaoAprovadaParaCompraPayload, Array<{ id: string; number: string }>>(
            DOMAIN_EVENTS.REQUISICAO_APROVADA_PARA_COMPRA,
            { requisitionId: id, requisitionNumber: requisition.number, userId, items: itemsToPurchase }
          )
        : []
      generatedPurchaseOrders = results.flat()

      if (generatedPurchaseOrders.length > 0) {
        await auditService.log({
          userId,
          action: 'CREATE',
          module: 'compras',
          entityId: id,
          entityName: requisition.number,
          details: `${generatedPurchaseOrders.length} Pedido(s) de Compra gerado(s) automaticamente a partir da requisição ${requisition.number}: ${generatedPurchaseOrders.map((o) => o.number).join(', ')}`,
        })
      }
    }

    return { ...(updated as object), generatedPurchaseOrders }
  }

  /** Lists all supplier quotes (cotações) registered for a requisition item */
  async listItemQuotes(itemId: string) {
    return requisitionRepository.listItemQuotes(itemId)
  }

  /** Registers a new supplier quote (cotação) for a requisition item */
  async createItemQuote(
    requisitionId: string,
    itemId: string,
    body: { supplierId?: string; price?: number; leadTimeDays?: number; notes?: string },
    userId: string
  ) {
    if (!body.supplierId) throw new BadRequestException('Fornecedor é obrigatório')
    if (typeof body.price !== 'number' || body.price <= 0) throw new BadRequestException('Preço deve ser maior que zero')

    const item = (await requisitionRepository.findItemById(itemId)) as { requisitionId: string } | null
    if (!item || item.requisitionId !== requisitionId) throw new NotFoundException('Item de requisição não encontrado')

    const supplier = (await supplierRepository.findById(body.supplierId)) as { corporateName: string; tradeName: string } | null
    if (!supplier) throw new NotFoundException('Fornecedor não encontrado')

    const quote = await requisitionRepository.createItemQuote({
      requisitionItemId: itemId,
      supplierId: body.supplierId,
      price: body.price,
      leadTimeDays: body.leadTimeDays || 0,
      notes: body.notes || '',
    })

    await auditService.log({
      userId,
      action: 'CREATE',
      module: 'requisicoes',
      entityId: requisitionId,
      entityName: supplier.corporateName || supplier.tradeName,
      details: `Cotação registrada: "${supplier.corporateName || supplier.tradeName}" — R$ ${body.price.toFixed(2)}`,
    })

    return quote
  }

  /**
   * Marca a cotação como vencedora e grava o fornecedor/preço escolhidos de volta
   * no RequisitionItem — a partir daí ele representa o Pedido de Compra definitivo.
   */
  async selectItemQuote(itemId: string, quoteId: string, userId: string) {
    const quote = (await requisitionRepository.findItemQuoteById(quoteId)) as {
      requisitionItemId: string
      supplierId: string
      price: number
      supplier: { corporateName: string; tradeName: string }
    } | null
    if (!quote || quote.requisitionItemId !== itemId) throw new NotFoundException('Cotação não encontrada')

    const item = (await requisitionRepository.selectItemQuote(itemId, quoteId, quote.supplierId, quote.price)) as {
      material: { name: string }
    }

    await auditService.log({
      userId,
      action: 'UPDATE',
      module: 'requisicoes',
      entityId: itemId,
      entityName: item.material.name,
      details: `Cotação vencedora selecionada: "${quote.supplier.corporateName || quote.supplier.tradeName}" — R$ ${quote.price.toFixed(2)} para "${item.material.name}"`,
    })

    return item
  }

  /**
   * Calcula, a partir da "receita" de matéria-prima do produto (ProductMaterial) e da
   * quantidade da Ordem de Produção, a necessidade de cada matéria-prima, compara com o
   * saldo em estoque e sugere o fornecedor preferencial quando houver.
   */
  async suggestForProductionOrder(productionOrderId: string) {
    const productionOrder = (await productionOrderRepository.findById(productionOrderId, {
      product: {
        include: {
          materials: {
            include: {
              material: {
                include: {
                  suppliers: { where: { isPreferred: true }, take: 1 },
                },
              },
            },
          },
        },
      },
    })) as {
      quantity: number
      quantityCompleted: number
      product: {
        name: string
        materials: Array<{
          materialId: string
          quantity: number
          scrapPct: number
          unit: string
          material: { name: string; stockQty: number; costPrice: number; suppliers: Array<{ supplierId: string; lastPrice: number }> }
        }>
      } | null
    } | null

    if (!productionOrder) throw new NotFoundException('Ordem de produção não encontrada')
    if (!productionOrder.product) {
      throw new BadRequestException('Esta ordem de produção não está vinculada a um produto cadastrado')
    }
    if (productionOrder.product.materials.length === 0) {
      return {
        productionOrderId,
        productName: productionOrder.product.name,
        items: [],
        message: 'Este produto não possui matérias-primas vinculadas (cadastre em Produto > Matérias-primas).',
      }
    }

    // Fase 9, ADR-011: usa o saldo RESTANTE da OP (quantity - quantityCompleted), nunca a
    // quantidade cheia — uma OP parcialmente produzida só precisa do que falta produzir.
    const remainingQuantity = productionOrder.quantity - productionOrder.quantityCompleted

    const items = productionOrder.product.materials.map((pm) => {
      const grossNeeded = pm.quantity * remainingQuantity * (1 + pm.scrapPct / 100)
      const missingQty = Math.max(0, grossNeeded - pm.material.stockQty)
      const preferredSupplier = pm.material.suppliers[0]

      return {
        materialId: pm.materialId,
        materialName: pm.material.name,
        unit: pm.unit,
        neededQty: Number(grossNeeded.toFixed(4)),
        currentStock: pm.material.stockQty,
        missingQty: Number(missingQty.toFixed(4)),
        suggestedSupplierId: preferredSupplier?.supplierId || null,
        estimatedPrice: preferredSupplier?.lastPrice || pm.material.costPrice || 0,
      }
    })

    return {
      productionOrderId,
      productName: productionOrder.product.name,
      quantity: productionOrder.quantity,
      items: items.filter((i) => i.missingQty > 0),
      allItems: items,
    }
  }
}

export const requisitionService = new RequisitionService()
