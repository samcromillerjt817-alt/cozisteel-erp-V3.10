import { batchTraceabilityRepository } from '@/app/repositories/batch-traceability.repository'
import { NotFoundException, BadRequestException } from '@/app/exceptions'

export interface MaterialBatchTraceNode {
  materialBatchId: string
  materialId: string
  materialName: string
  batchNumber: string
  supplierId: string | null
  supplierName: string | null
  purchaseOrderId: string | null
  purchaseOrderNumber: string | null
  receivedAt: Date
  quantityReceived: number
  quantityAvailable: number
  unitCost: number
}

export interface ProductBatchTraceNode {
  productBatchId: string
  productId: string
  productName: string
  productionOrderId: string
  productionOrderNumber: string
  batchNumber: string
  quantityProduced: number
  producedAt: Date
}

export interface TraceabilityEdge {
  quantityConsumed: number
  consumedAt: Date
  /** 1 = consumo direto da origem; 2 = consumo de quem consumiu a origem; etc. */
  depth: number
}

export interface ForwardTraceResult {
  origin: MaterialBatchTraceNode
  consumedBy: Array<{ productBatch: ProductBatchTraceNode; edge: TraceabilityEdge }>
}

export interface BackwardTraceResult {
  origin: ProductBatchTraceNode
  materialOrigins: Array<{ materialBatch: MaterialBatchTraceNode; edge: TraceabilityEdge }>
  subassemblyBatches: Array<{ productBatch: ProductBatchTraceNode; edge: TraceabilityEdge }>
}

interface RawMaterialBatch {
  id: string
  batchNumber: string
  supplierId: string | null
  purchaseOrderId: string | null
  receivedAt: Date
  quantityReceived: number
  quantityAvailable: number
  unitCost: number
  material: { id: string; name: string }
  supplier: { id: string; corporateName: string; tradeName: string } | null
  purchaseOrder: { id: string; number: string } | null
}

interface RawProductBatch {
  id: string
  batchNumber: string
  quantityProduced: number
  producedAt: Date
  product: { id: string; name: string }
  productionOrder: { id: string; number: string }
}

/**
 * Fase 10, Subetapa 4 (ADR-013) — consultas de rastreabilidade de lote, forward e backward,
 * profundidade arbitrária. Puramente de leitura, sem rota de API ainda (mesma disciplina de fechar
 * o domínio antes de expor UI já usada nas Fases 4-6). Percorre a árvore em largura (nível a nível,
 * não nó a nó) — cada nível é UMA query via `Repository` com `IN (...)`, nunca uma por nó, para não
 * incorrer em N+1 independentemente da largura da árvore naquele nível.
 *
 * Complexidade: O(profundidade) idas ao banco, uma por nível — nunca O(nós). Custo de cada query é
 * proporcional à largura do nível (`IN` sobre os ids daquele nível), então o total é O(arestas
 * realmente percorridas na árvore de consumo alcançável a partir da origem) — mesma categoria de
 * custo já aceita para a explosão de BOM (`bomExplosionService`) e a reconciliação de reserva
 * (`ReservationReconciliationService`), não uma característica nova desta subetapa. Otimização
 * futura possível, não implementada agora: cache por `(materialBatchId|productBatchId)` se a mesma
 * consulta for repetida com frequência (ex.: uma tela de auditoria abrindo a mesma árvore várias
 * vezes) — hoje cada chamada recalcula do zero, aceitável para uma capacidade ainda sem UI/API.
 */
class BatchTraceabilityService {
  /** Proteção adicional além da detecção de ciclo por conjunto visitado — mesmo espírito defensivo
   * de `bomExplosionService`, que também assume que um ciclo genuíno não deveria ser alcançável (a
   * ordem de criação dos lotes torna um ciclo estruturalmente impossível: um `ProductBatch` só pode
   * consumir lotes já existentes no momento da sua criação, nunca um criado depois dele), mas
   * detecta e recusa em vez de entrar em loop infinito caso um dado corrompido viole essa garantia. */
  private static readonly MAX_DEPTH = 100

  private toMaterialBatchNode(raw: RawMaterialBatch): MaterialBatchTraceNode {
    return {
      materialBatchId: raw.id,
      materialId: raw.material.id,
      materialName: raw.material.name,
      batchNumber: raw.batchNumber,
      supplierId: raw.supplierId,
      supplierName: raw.supplier ? raw.supplier.corporateName || raw.supplier.tradeName : null,
      purchaseOrderId: raw.purchaseOrderId,
      purchaseOrderNumber: raw.purchaseOrder?.number ?? null,
      receivedAt: raw.receivedAt,
      quantityReceived: raw.quantityReceived,
      quantityAvailable: raw.quantityAvailable,
      unitCost: raw.unitCost,
    }
  }

  private toProductBatchNode(raw: RawProductBatch): ProductBatchTraceNode {
    return {
      productBatchId: raw.id,
      productId: raw.product.id,
      productName: raw.product.name,
      productionOrderId: raw.productionOrder.id,
      productionOrderNumber: raw.productionOrder.number,
      batchNumber: raw.batchNumber,
      quantityProduced: raw.quantityProduced,
      producedAt: raw.producedAt,
    }
  }

  /** Ordenação determinística: sempre por profundidade, depois por número de lote — mesmo conjunto
   * de dados produz sempre a mesma ordem, independente da ordem física de retorno do banco. */
  private sortByDepthThenBatchNumber<T extends { edge: TraceabilityEdge; batchNumber: string }>(items: T[]): T[] {
    return [...items].sort((a, b) => a.edge.depth - b.edge.depth || a.batchNumber.localeCompare(b.batchNumber))
  }

  /** Forward: dado um `MaterialBatch`, todos os `ProductBatch` que dependem dele, em qualquer profundidade. */
  async traceForward(materialBatchId: string): Promise<ForwardTraceResult> {
    const originRaw = (await batchTraceabilityRepository.findMaterialBatchById(materialBatchId)) as RawMaterialBatch | null
    if (!originRaw) throw new NotFoundException('Lote de matéria-prima não encontrado')
    const origin = this.toMaterialBatchNode(originRaw)

    const consumedBy: Array<{ productBatch: ProductBatchTraceNode; edge: TraceabilityEdge; batchNumber: string }> = []
    const visited = new Set<string>()

    let depth = 1
    let frontier = (await batchTraceabilityRepository.findConsumptionsOfMaterialBatches([materialBatchId])) as Array<{
      productBatchId: string
      quantityConsumed: number
      createdAt: Date
      productBatch: RawProductBatch
    }>

    while (frontier.length > 0) {
      if (depth > BatchTraceabilityService.MAX_DEPTH) {
        throw new BadRequestException('Profundidade máxima de rastreabilidade excedida — possível ciclo não detectado nos dados')
      }

      const nextFrontierIds: string[] = []
      for (const consumption of frontier) {
        if (visited.has(consumption.productBatchId)) {
          throw new BadRequestException(
            `Ciclo detectado na rastreabilidade de lote: o lote de produto "${consumption.productBatchId}" já apareceu neste mesmo caminho`
          )
        }
        visited.add(consumption.productBatchId)
        const node = this.toProductBatchNode(consumption.productBatch)
        consumedBy.push({ productBatch: node, edge: { quantityConsumed: consumption.quantityConsumed, consumedAt: consumption.createdAt, depth }, batchNumber: node.batchNumber })
        nextFrontierIds.push(consumption.productBatchId)
      }

      const nextLevel = (await batchTraceabilityRepository.findConsumptionsAsComponent(nextFrontierIds)) as Array<{
        productBatchId: string
        quantityConsumed: number
        createdAt: Date
        productBatch: RawProductBatch
      }>
      frontier = nextLevel
      depth++
    }

    return { origin, consumedBy: this.sortByDepthThenBatchNumber(consumedBy).map(({ productBatch, edge }) => ({ productBatch, edge })) }
  }

  /** Backward: dado um `ProductBatch`, todos os `MaterialBatch` de origem, em qualquer profundidade,
   * incluindo os `ProductBatch` intermediários (subconjuntos) atravessados no caminho. */
  async traceBackward(productBatchId: string): Promise<BackwardTraceResult> {
    const originRaw = (await batchTraceabilityRepository.findProductBatchById(productBatchId)) as RawProductBatch | null
    if (!originRaw) throw new NotFoundException('Lote de produto não encontrado')
    const origin = this.toProductBatchNode(originRaw)

    const materialOrigins: Array<{ materialBatch: MaterialBatchTraceNode; edge: TraceabilityEdge; batchNumber: string }> = []
    const subassemblyBatches: Array<{ productBatch: ProductBatchTraceNode; edge: TraceabilityEdge; batchNumber: string }> = []
    const visited = new Set<string>([productBatchId])

    let depth = 1
    let frontierIds = [productBatchId]

    while (frontierIds.length > 0) {
      if (depth > BatchTraceabilityService.MAX_DEPTH) {
        throw new BadRequestException('Profundidade máxima de rastreabilidade excedida — possível ciclo não detectado nos dados')
      }

      const consumptions = (await batchTraceabilityRepository.findConsumptionsByProductBatches(frontierIds)) as Array<{
        itemType: string
        quantityConsumed: number
        createdAt: Date
        materialBatch: RawMaterialBatch | null
        consumedProductBatch: RawProductBatch | null
      }>

      const nextFrontierIds: string[] = []
      for (const consumption of consumptions) {
        if (consumption.itemType === 'material' && consumption.materialBatch) {
          const node = this.toMaterialBatchNode(consumption.materialBatch)
          materialOrigins.push({ materialBatch: node, edge: { quantityConsumed: consumption.quantityConsumed, consumedAt: consumption.createdAt, depth }, batchNumber: node.batchNumber })
        } else if (consumption.consumedProductBatch) {
          const subId = consumption.consumedProductBatch.id
          if (visited.has(subId)) {
            throw new BadRequestException(
              `Ciclo detectado na rastreabilidade de lote: o lote de produto "${subId}" já apareceu neste mesmo caminho`
            )
          }
          visited.add(subId)
          const node = this.toProductBatchNode(consumption.consumedProductBatch)
          subassemblyBatches.push({ productBatch: node, edge: { quantityConsumed: consumption.quantityConsumed, consumedAt: consumption.createdAt, depth }, batchNumber: node.batchNumber })
          nextFrontierIds.push(subId)
        }
      }

      frontierIds = nextFrontierIds
      depth++
    }

    return {
      origin,
      materialOrigins: this.sortByDepthThenBatchNumber(materialOrigins).map(({ materialBatch, edge }) => ({ materialBatch, edge })),
      subassemblyBatches: this.sortByDepthThenBatchNumber(subassemblyBatches).map(({ productBatch, edge }) => ({ productBatch, edge })),
    }
  }
}

export const batchTraceabilityService = new BatchTraceabilityService()
