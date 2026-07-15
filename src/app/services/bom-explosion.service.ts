import { bomRevisionRepository } from '@/app/repositories/bom-revision.repository'
import { bomLineRepository } from '@/app/repositories/bom-line.repository'
import { BadRequestException } from '@/app/exceptions'

export interface BomExplosionResult {
  /** materialId → quantidade bruta agregada (soma de todas as ocorrências, em qualquer nível) */
  materialNeeds: Map<string, number>
  /** productId → quantidade agregada, para componentes sem revisão liberada própria (não explode mais fundo) */
  productNeeds: Map<string, number>
}

interface BomLineRecord {
  lineType: string
  materialId: string | null
  componentProductId: string | null
  quantity: number
  scrapPct: number
}

/**
 * Explosão recursiva de BOM (Fase 5, ADR-006): dado um produto e uma quantidade, percorre as
 * `BomLine` da revisão `released` daquele produto, agregando a necessidade bruta de matéria-prima
 * e de produtos-componente sem revisão própria. Não persiste nada — função pura de leitura, reutilizável
 * pela reserva (Subetapa 3) e futuramente pelo MRP.
 */
class BomExplosionService {
  /** Explode a partir da revisão ATUALMENTE liberada do produto — uso geral (pré-visualização, etc). */
  async explode(productId: string, quantity: number): Promise<BomExplosionResult> {
    const result: BomExplosionResult = { materialNeeds: new Map(), productNeeds: new Map() }
    await this.explodeInto(productId, quantity, new Set(), result)
    return result
  }

  /**
   * Explode a partir de uma revisão ESPECÍFICA já conhecida (não busca "a ativa" do produto) —
   * usado pela Reserva de Material (ADR-006): uma OP deve sempre honrar a `BomRevision` congelada
   * em `ProductionOrder.bomRevisionId` no momento da sua criação, nunca a revisão que porventura
   * esteja liberada AGORA para o produto (que pode ter mudado desde então). Os níveis abaixo do
   * topo (subconjuntos) continuam resolvendo pela revisão ativa deles mesmos — não existe hoje um
   * conceito de "congelado" abaixo do topo, só `ProductionOrder` tem essa referência.
   */
  async explodeRevision(bomRevisionId: string, quantity: number, rootProductId: string): Promise<BomExplosionResult> {
    const result: BomExplosionResult = { materialNeeds: new Map(), productNeeds: new Map() }
    await this.explodeInto(rootProductId, quantity, new Set(), result, bomRevisionId)
    return result
  }

  /**
   * `path` é a cadeia de produtos já visitados NESTE ramo específico da árvore (não globalmente) —
   * dois ramos irmãos podem legitimamente conter o mesmo componente (estrutura em losango) sem que
   * isso seja um ciclo. Só uma ocorrência repetida NO MESMO ramo é um ciclo de verdade (direto ou
   * indireto, não importa a profundidade).
   */
  private async explodeInto(
    productId: string,
    quantity: number,
    path: Set<string>,
    result: BomExplosionResult,
    pinnedRevisionId?: string
  ): Promise<void> {
    if (path.has(productId)) {
      throw new BadRequestException(
        `Ciclo detectado na estrutura do produto: "${productId}" já aparece como ancestral desta mesma árvore de componentes`
      )
    }
    const nextPath = new Set(path)
    nextPath.add(productId)

    const revision = pinnedRevisionId
      ? ((await bomRevisionRepository.findById(pinnedRevisionId)) as { id: string } | null)
      : ((await bomRevisionRepository.findActiveByProduct(productId)) as { id: string } | null)
    if (!revision) return // sem revisão — nada a explodir a partir daqui (ver productNeeds do chamador)

    const lines = (await bomLineRepository.findManyByRevision(revision.id)) as BomLineRecord[]

    for (const line of lines) {
      const lineQty = line.quantity * (1 + line.scrapPct / 100) * quantity

      if (line.lineType === 'material') {
        const materialId = line.materialId as string
        result.materialNeeds.set(materialId, (result.materialNeeds.get(materialId) || 0) + lineQty)
        continue
      }

      const componentProductId = line.componentProductId as string
      const subRevision = (await bomRevisionRepository.findActiveByProduct(componentProductId)) as { id: string } | null
      if (subRevision) {
        await this.explodeInto(componentProductId, lineQty, nextPath, result)
      } else {
        result.productNeeds.set(componentProductId, (result.productNeeds.get(componentProductId) || 0) + lineQty)
      }
    }
  }
}

export const bomExplosionService = new BomExplosionService()
