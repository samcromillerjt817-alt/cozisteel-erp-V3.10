import { productionOrderRepository } from '@/app/repositories/production-order.repository'
import { bomRevisionRepository } from '@/app/repositories/bom-revision.repository'
import { bomLineRepository } from '@/app/repositories/bom-line.repository'
import { productMaterialRepository } from '@/app/repositories/product-material.repository'
import { materialRepository } from '@/app/repositories/material.repository'
import { productRepository } from '@/app/repositories/product.repository'
import { purchaseOrderRepository } from '@/app/repositories/purchase-order.repository'
import { supplierMaterialRepository } from '@/app/repositories/supplier-material.repository'
import { BadRequestException } from '@/app/exceptions'

export type MrpItemType = 'material' | 'product'
export type MrpSuggestionType = 'purchase' | 'production'

export interface MrpDemandSource {
  productionOrderId: string
  quantity: number
}

export interface MrpCalculatedSuggestion {
  itemType: MrpItemType
  materialId: string | null
  productId: string | null
  suggestionType: MrpSuggestionType
  quantityNeeded: number
  quantityAvailable: number
  quantityReserved: number
  quantityShortfall: number
  productTypeSnapshot: string | null
  supplierId: string | null
  supplierNameSnapshot: string | null
  sources: MrpDemandSource[]
}

export interface MrpCalculationResult {
  openOrdersConsidered: number
  suggestions: MrpCalculatedSuggestion[]
}

interface BomLineRecord {
  lineType: string
  materialId: string | null
  componentProductId: string | null
  quantity: number
  scrapPct: number
}

interface OpenProductionOrderRecord {
  id: string
  productId: string | null
  quantity: number
  quantityCompleted: number
  bomRevisionId: string | null
}

type ItemKey = string // `material:<id>` | `product:<id>`

function materialKey(id: string): ItemKey {
  return `material:${id}`
}
function productKey(id: string): ItemKey {
  return `product:${id}`
}
function parseKey(key: ItemKey): { itemType: MrpItemType; id: string } {
  const separatorIndex = key.indexOf(':')
  return { itemType: key.slice(0, separatorIndex) as MrpItemType, id: key.slice(separatorIndex + 1) }
}
function lineChildKey(line: BomLineRecord): ItemKey {
  return line.lineType === 'material' ? materialKey(line.materialId as string) : productKey(line.componentProductId as string)
}

function groupSourcesByOrder(sources: MrpDemandSource[]): MrpDemandSource[] {
  const totals = new Map<string, number>()
  for (const source of sources) {
    totals.set(source.productionOrderId, (totals.get(source.productionOrderId) || 0) + source.quantity)
  }
  return Array.from(totals.entries()).map(([productionOrderId, quantity]) => ({ productionOrderId, quantity }))
}

/**
 * Motor de Cálculo do MRP (Fase 6, Subetapa 2, ADR-007) — função pura, nada é lido para ser
 * escrito de volta: não grava `MrpRun`/`MrpSuggestion`, não altera estoque, não cria Requisição
 * ou Pedido de Compra. A persistência do resultado é responsabilidade exclusiva da Subetapa 3.
 *
 * Algoritmo em duas fases: Fase A (bootstrap) explode cada OP aberta individualmente contra a
 * sua própria `bomRevisionId` congelada — nunca a revisão ativa "de agora" do produto, mesmo
 * princípio já validado na Reserva de Material (ADR-006). A partir do nível 1, o processamento
 * usa baixo nível de código (low-level coding): cada item só é líquido contra estoque depois que
 * TODOS os pais possíveis (em qualquer ramo, em qualquer OP) já depositaram sua demanda — sem
 * essa ordem, um item usado em mais de um ramo/profundidade seria processado com demanda ainda
 * incompleta. Deliberadamente não reaproveita `bom-explosion.service.ts` (Reserva): aquele motor
 * sempre desce até matéria-prima ignorando estoque de subconjunto intermediário — correto para
 * reservar contra o saldo físico de UMA OP, mas incompatível com o netting por nível que o MRP
 * precisa (ver ADR-007, seção "Netting multinível").
 */
class MrpCalculationService {
  async calculate(): Promise<MrpCalculationResult> {
    const openOrders = (await productionOrderRepository.findManyOpenForMrp()) as OpenProductionOrderRecord[]

    const grossDemand = new Map<ItemKey, number>()
    const demandSources = new Map<ItemKey, MrpDemandSource[]>()

    const addDemand = (key: ItemKey, quantity: number, sources: MrpDemandSource[]) => {
      if (quantity <= 0) return
      grossDemand.set(key, (grossDemand.get(key) || 0) + quantity)
      const existing = demandSources.get(key) || []
      demandSources.set(key, existing.concat(sources))
    }

    // ── Fase A: bootstrap — uma vez por OP, sempre pela revisão congelada ──
    // Fase 9, ADR-011: usa o saldo RESTANTE de cada OP (quantity - quantityCompleted), nunca a
    // quantidade cheia — uma OP parcialmente produzida só demanda o que ainda falta. Uma OP que já
    // atingiu 100% (remaining <= 0) some completamente da demanda, sem precisar de tratamento
    // especial (addDemand já ignora quantidades <= 0).
    for (const op of openOrders) {
      if (!op.productId) continue
      const remaining = op.quantity - op.quantityCompleted
      if (remaining <= 0) continue

      if (!op.bomRevisionId) {
        // Comportamento herdado: produto sem engenharia formal ainda usa a "receita" viva
        // (ProductMaterial), um nível só — igual a RequisitionService.suggestForProductionOrder() hoje.
        const recipe = (await productMaterialRepository.findManyByProduct(op.productId)) as Array<{
          materialId: string
          quantity: number
          scrapPct: number
        }>
        for (const pm of recipe) {
          const qty = pm.quantity * (1 + pm.scrapPct / 100) * remaining
          addDemand(materialKey(pm.materialId), qty, [{ productionOrderId: op.id, quantity: qty }])
        }
        continue
      }

      const lines = (await bomLineRepository.findManyByRevision(op.bomRevisionId)) as BomLineRecord[]
      for (const line of lines) {
        const qty = line.quantity * (1 + line.scrapPct / 100) * remaining
        addDemand(lineChildKey(line), qty, [{ productionOrderId: op.id, quantity: qty }])
      }
    }

    // ── Passo 1: baixo nível de código — descobre a profundidade máxima de cada item, com
    // detecção de ciclo por ramo (mesma disciplina de bom-explosion.service.ts) ──
    const levels = await this.computeLowLevelCodes(Array.from(grossDemand.keys()))
    const sortedItems = Array.from(levels.keys()).sort((a, b) => (levels.get(a) as number) - (levels.get(b) as number))

    // Soma do RESTANTE de outras OPs abertas produzindo cada produto — usado como "inProduction"
    // ao vivo (seção 4/7 do ADR-007): supre parte da demanda dependente sem precisar do campo
    // persistido Product.inProductionQty (que continua sem gatilho automático, Fase 5). Fase 9,
    // ADR-011: uma OP de 100 com 70 já produzidas só oferece 30 de supply futuro, não 100 — o que
    // já foi produzido já virou estoque físico (contado em stockQty/freeStock), não é mais "em
    // produção".
    const openQuantityByProduct = new Map<string, number>()
    for (const op of openOrders) {
      if (!op.productId) continue
      const remaining = op.quantity - op.quantityCompleted
      if (remaining <= 0) continue
      openQuantityByProduct.set(op.productId, (openQuantityByProduct.get(op.productId) || 0) + remaining)
    }

    const suggestions: MrpCalculatedSuggestion[] = []

    // ── Passo 2: nivelar e explodir, do nível mais raso ao mais profundo ──
    for (const key of sortedItems) {
      const needed = grossDemand.get(key) || 0
      if (needed <= 0) continue

      const { itemType, id } = parseKey(key)

      let stockQty = 0
      let reservedQty = 0
      let productType: string | null = null
      let activeRevisionId: string | null = null

      if (itemType === 'material') {
        const material = (await materialRepository.findById(id)) as { stockQty: number; reservedQty: number } | null
        if (!material) continue
        stockQty = material.stockQty
        reservedQty = material.reservedQty
      } else {
        const product = (await productRepository.findById(id)) as
          | { stockQty: number; reservedQty: number; productType: string }
          | null
        if (!product) continue
        stockQty = product.stockQty
        reservedQty = product.reservedQty
        productType = product.productType
        const revision = (await bomRevisionRepository.findActiveByProduct(id)) as { id: string } | null
        activeRevisionId = revision?.id ?? null
      }

      const freeStock = Math.max(0, stockQty - reservedQty)
      const onOrder = itemType === 'material' ? await this.calcOnOrderForMaterial(id) : 0
      const inProduction = itemType === 'product' ? openQuantityByProduct.get(id) || 0 : 0
      const available = freeStock + onOrder + inProduction
      const shortfall = Math.max(0, needed - reservedQty - available)

      // Item plenamente coberto — não vira sugestão, e não propaga nada mais fundo.
      if (shortfall <= 0) continue

      const isFabricable = itemType === 'product' && activeRevisionId !== null

      let supplierId: string | null = null
      let supplierNameSnapshot: string | null = null
      if (!isFabricable && itemType === 'material') {
        const preferred = (await supplierMaterialRepository.findPreferredForMaterial(id)) as {
          supplierId: string
          supplier: { corporateName: string; tradeName: string }
        } | null
        if (preferred) {
          supplierId = preferred.supplierId
          supplierNameSnapshot = preferred.supplier.corporateName || preferred.supplier.tradeName
        }
      }

      suggestions.push({
        itemType,
        materialId: itemType === 'material' ? id : null,
        productId: itemType === 'product' ? id : null,
        suggestionType: isFabricable ? 'production' : 'purchase',
        quantityNeeded: needed,
        quantityAvailable: available,
        quantityReserved: reservedQty,
        quantityShortfall: shortfall,
        productTypeSnapshot: productType,
        supplierId,
        supplierNameSnapshot,
        sources: groupSourcesByOrder(demandSources.get(key) || []),
      })

      if (isFabricable && activeRevisionId) {
        // Propaga só o shortfall (netting por nível) — nunca a necessidade bruta original.
        const ratio = needed > 0 ? shortfall / needed : 0
        const parentSources = demandSources.get(key) || []
        const scaledParentSources = parentSources.map((s) => ({ productionOrderId: s.productionOrderId, quantity: s.quantity * ratio }))

        const childLines = (await bomLineRepository.findManyByRevision(activeRevisionId)) as BomLineRecord[]
        for (const line of childLines) {
          const multiplier = line.quantity * (1 + line.scrapPct / 100)
          const childQty = multiplier * shortfall
          const childSources = scaledParentSources.map((s) => ({ productionOrderId: s.productionOrderId, quantity: s.quantity * multiplier }))
          addDemand(lineChildKey(line), childQty, childSources)
        }
      }
    }

    return { openOrdersConsidered: openOrders.length, suggestions }
  }

  private async calcOnOrderForMaterial(materialId: string): Promise<number> {
    const items = (await purchaseOrderRepository.findOpenItemsByMaterials([materialId])) as Array<{
      materialId: string
      quantity: number
      quantityReceived: number
    }>
    return items.reduce((sum, item) => sum + Math.max(0, item.quantity - item.quantityReceived), 0)
  }

  /**
   * Profundidade MÁXIMA de cada item alcançável a partir dos itens de nível 1 (descobertos na
   * Fase A). A partir daqui, todo componente resolve sua PRÓPRIA revisão ativa — não existe mais
   * congelamento por branch neste ponto da árvore (só o vínculo OP→produto-raiz é congelado).
   */
  private async computeLowLevelCodes(initialKeys: ItemKey[]): Promise<Map<ItemKey, number>> {
    const levels = new Map<ItemKey, number>()

    const visit = async (key: ItemKey, depth: number, path: Set<ItemKey>): Promise<void> => {
      if (path.has(key)) {
        throw new BadRequestException(
          `Ciclo detectado na estrutura do MRP: "${key}" já aparece como ancestral desta mesma árvore de componentes`
        )
      }
      levels.set(key, Math.max(levels.get(key) ?? 0, depth))

      const { itemType, id } = parseKey(key)
      if (itemType !== 'product') return // matéria-prima é sempre folha

      const revision = (await bomRevisionRepository.findActiveByProduct(id)) as { id: string } | null
      if (!revision) return // sem revisão própria — folha (comprado/terceirizado)

      const nextPath = new Set(path)
      nextPath.add(key)
      const lines = (await bomLineRepository.findManyByRevision(revision.id)) as BomLineRecord[]
      for (const line of lines) {
        await visit(lineChildKey(line), depth + 1, nextPath)
      }
    }

    for (const key of initialKeys) {
      await visit(key, 1, new Set())
    }

    return levels
  }
}

export const mrpCalculationService = new MrpCalculationService()
