import { bomRevisionRepository } from '@/app/repositories/bom-revision.repository'
import { bomLineRepository } from '@/app/repositories/bom-line.repository'
import { bomLineSubstituteRepository } from '@/app/repositories/bom-line-substitute.repository'
import { operationTypeRepository } from '@/app/repositories/operation-type.repository'
import { productOperationRepository } from '@/app/repositories/product-operation.repository'
import { productRepository } from '@/app/repositories/product.repository'
import { materialRepository } from '@/app/repositories/material.repository'
import { NotFoundException, BadRequestException } from '@/app/exceptions'
import { statusHistoryService } from '@/app/services/status-history.service'
import { checkTransition } from '@/lib/status-machine'
import type { CreateBomRevisionDto, BomLineDto, CreateOperationTypeDto, ProductOperationDto } from '@/app/dto'

/** Incremento usado ao auto-atribuir sequenceOrder (10, 20, 30...) — permite inserir uma operação
 * no meio no futuro sem renumerar as existentes. */
const SEQUENCE_STEP = 10

/**
 * Transições permitidas da Revisão de Engenharia (ADR-005). Uma revisão `released` é imutável —
 * mudanças de estrutura exigem uma revisão nova (`draft`), nunca reabrir a antiga. `release()`
 * garante, numa transação, que só existe uma revisão `released` por produto por vez.
 *
 * `pending_approval` (ADR-023, item 4) é um status intermediário OPCIONAL, não uma etapa obrigatória:
 * `draft → released` direto continua permitido (mesmo comportamento de antes desta mudança, mesmo
 * princípio de "política inicial simples que preserva o comportamento atual" já aplicado à Alçada,
 * Parte 5). Quem quiser um passo de revisão explícito usa `pending_approval` no meio; quem não quiser,
 * ignora e libera direto — igual sempre foi.
 */
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  draft: ['pending_approval', 'released', 'obsolete'],
  pending_approval: ['released', 'draft', 'obsolete'],
  released: ['obsolete'],
  obsolete: [],
}

interface BomRevisionRecord {
  id: string
  productId: string
  revisionCode: string
  status: string
}

interface BomLineRecord {
  id: string
  bomRevisionId: string
  lineType: string
  materialId: string | null
}

interface BomLineForCompare {
  lineType: string
  materialId: string | null
  componentProductId: string | null
  quantity: number
  unit: string
  scrapPct: number
  material: { name: string } | null
  componentProduct: { name: string } | null
}

class BomService {
  async listRevisions(productId: string) {
    const product = await productRepository.findById(productId)
    if (!product) throw new NotFoundException('Produto não encontrado')
    return bomRevisionRepository.findManyByProduct(productId)
  }

  async getRevision(id: string) {
    const revision = await bomRevisionRepository.findByIdDetailed(id)
    if (!revision) throw new NotFoundException('Revisão de engenharia não encontrada')
    return revision
  }

  /**
   * Diff estrutural entre duas revisões do MESMO produto (ADR-023, item 4) — nunca entre produtos
   * diferentes, comparação não faria sentido. Chave da linha é o item referenciado (material ou
   * componente), não o id da linha em si (uma linha recriada do zero pra mesma matéria-prima deve
   * aparecer como "alterada", não como remover+adicionar).
   */
  async compareRevisions(fromId: string, toId: string) {
    const [from, to] = await Promise.all([
      bomRevisionRepository.findByIdDetailed(fromId) as Promise<{ productId: string; revisionCode: string; lines: BomLineForCompare[] } | null>,
      bomRevisionRepository.findByIdDetailed(toId) as Promise<{ productId: string; revisionCode: string; lines: BomLineForCompare[] } | null>,
    ])
    if (!from) throw new NotFoundException('Revisão de origem não encontrada')
    if (!to) throw new NotFoundException('Revisão de destino não encontrada')
    if (from.productId !== to.productId) {
      throw new BadRequestException('Só é possível comparar revisões do mesmo produto')
    }

    const lineKey = (line: BomLineForCompare) => (line.lineType === 'material' ? `material:${line.materialId}` : `component:${line.componentProductId}`)
    const lineLabel = (line: BomLineForCompare) => line.material?.name || line.componentProduct?.name || '-'

    const fromByKey = new Map(from.lines.map((l) => [lineKey(l), l]))
    const toByKey = new Map(to.lines.map((l) => [lineKey(l), l]))

    const added = to.lines.filter((l) => !fromByKey.has(lineKey(l))).map((l) => ({ name: lineLabel(l), quantity: l.quantity, unit: l.unit }))
    const removed = from.lines.filter((l) => !toByKey.has(lineKey(l))).map((l) => ({ name: lineLabel(l), quantity: l.quantity, unit: l.unit }))
    const changed = from.lines
      .filter((l) => toByKey.has(lineKey(l)))
      .map((l) => ({ from: l, to: toByKey.get(lineKey(l)) as BomLineForCompare }))
      .filter(({ from: f, to: t }) => f.quantity !== t.quantity || f.unit !== t.unit || f.scrapPct !== t.scrapPct)
      .map(({ from: f, to: t }) => ({
        name: lineLabel(f),
        quantityFrom: f.quantity, quantityTo: t.quantity,
        unitFrom: f.unit, unitTo: t.unit,
        scrapPctFrom: f.scrapPct, scrapPctTo: t.scrapPct,
      }))

    return {
      fromRevisionCode: from.revisionCode,
      toRevisionCode: to.revisionCode,
      added,
      removed,
      changed,
      unchangedCount: from.lines.length - removed.length - changed.length,
    }
  }

  async createRevision(productId: string, data: CreateBomRevisionDto, userId: string) {
    const product = await productRepository.findById(productId)
    if (!product) throw new NotFoundException('Produto não encontrado')

    const existing = await bomRevisionRepository.findByProductAndCode(productId, data.revisionCode)
    if (existing) throw new BadRequestException(`Já existe uma revisão "${data.revisionCode}" para este produto`)

    return bomRevisionRepository.createDraft({
      productId,
      revisionCode: data.revisionCode,
      status: 'draft',
      notes: data.notes,
      createdById: userId,
    })
  }

  /** Só revisões em rascunho podem ser editadas — uma vez liberada, é imutável (histórico). */
  async updateRevision(id: string, data: { notes?: string; effectiveFrom?: Date | null }) {
    const revision = (await bomRevisionRepository.findById(id)) as BomRevisionRecord | null
    if (!revision) throw new NotFoundException('Revisão de engenharia não encontrada')
    if (revision.status !== 'draft') {
      throw new BadRequestException('Apenas revisões em rascunho podem ser editadas')
    }

    const updateData: Record<string, unknown> = {}
    if (data.notes !== undefined) updateData.notes = data.notes
    if (data.effectiveFrom !== undefined) updateData.effectiveFrom = data.effectiveFrom

    return bomRevisionRepository.updateFields(id, updateData)
  }

  async deleteRevision(id: string) {
    const revision = (await bomRevisionRepository.findById(id)) as BomRevisionRecord | null
    if (!revision) throw new NotFoundException('Revisão de engenharia não encontrada')
    if (revision.status !== 'draft') {
      throw new BadRequestException('Apenas revisões em rascunho podem ser excluídas — revisões liberadas ou obsoletas são histórico')
    }
    await bomRevisionRepository.delete(id)
    return { success: true }
  }

  /**
   * `released` obsoleta automaticamente qualquer outra revisão ativa do mesmo produto (garante
   * "só uma revisão ativa por vez" sem apagar histórico — a anterior vira `obsolete`, não some).
   */
  async changeStatus(id: string, status: string, userId: string, reason = '') {
    const revision = (await bomRevisionRepository.findById(id)) as BomRevisionRecord | null
    if (!revision) throw new NotFoundException('Revisão de engenharia não encontrada')

    const transitionError = checkTransition(revision.status, status, ALLOWED_TRANSITIONS)
    if (transitionError) throw new BadRequestException(transitionError)

    await statusHistoryService.record('bom_revision', id, revision.status, status, userId, reason)

    if (status === 'released') {
      return bomRevisionRepository.release(id, revision.productId, userId)
    }

    return bomRevisionRepository.updateFields(id, { status })
  }

  // ── Linhas da revisão (material ou componente) ──

  private async assertDraft(bomRevisionId: string) {
    const revision = (await bomRevisionRepository.findById(bomRevisionId)) as BomRevisionRecord | null
    if (!revision) throw new NotFoundException('Revisão de engenharia não encontrada')
    if (revision.status !== 'draft') {
      throw new BadRequestException('A estrutura só pode ser alterada enquanto a revisão está em rascunho')
    }
    return revision
  }

  private async validateLineReference(revision: BomRevisionRecord, data: BomLineDto) {
    if (data.lineType === 'material') {
      const material = await materialRepository.findById(data.materialId as string)
      if (!material) throw new NotFoundException('Matéria-prima não encontrada')
    } else {
      if (data.componentProductId === revision.productId) {
        throw new BadRequestException('Um produto não pode ser componente de si mesmo')
      }
      const component = await productRepository.findById(data.componentProductId as string)
      if (!component) throw new NotFoundException('Produto componente não encontrado')
    }
  }

  async listLines(bomRevisionId: string) {
    const revision = await bomRevisionRepository.findById(bomRevisionId)
    if (!revision) throw new NotFoundException('Revisão de engenharia não encontrada')
    return bomLineRepository.findManyByRevision(bomRevisionId)
  }

  async addLine(bomRevisionId: string, data: BomLineDto) {
    const revision = (await this.assertDraft(bomRevisionId)) as BomRevisionRecord
    await this.validateLineReference(revision, data)

    return bomLineRepository.createLine({
      bomRevisionId,
      lineType: data.lineType,
      materialId: data.lineType === 'material' ? data.materialId : null,
      componentProductId: data.lineType === 'component' ? data.componentProductId : null,
      quantity: data.quantity,
      unit: data.unit,
      scrapPct: data.scrapPct,
      order: data.order,
      notes: data.notes,
    })
  }

  async updateLine(bomRevisionId: string, lineId: string, data: BomLineDto) {
    const revision = (await this.assertDraft(bomRevisionId)) as BomRevisionRecord
    const line = (await bomLineRepository.findById(lineId)) as BomLineRecord | null
    if (!line || line.bomRevisionId !== bomRevisionId) throw new NotFoundException('Linha de estrutura não encontrada')

    await this.validateLineReference(revision, data)

    return bomLineRepository.updateLine(lineId, {
      lineType: data.lineType,
      materialId: data.lineType === 'material' ? data.materialId : null,
      componentProductId: data.lineType === 'component' ? data.componentProductId : null,
      quantity: data.quantity,
      unit: data.unit,
      scrapPct: data.scrapPct,
      order: data.order,
      notes: data.notes,
    })
  }

  async removeLine(bomRevisionId: string, lineId: string) {
    await this.assertDraft(bomRevisionId)
    const line = (await bomLineRepository.findById(lineId)) as BomLineRecord | null
    if (!line || line.bomRevisionId !== bomRevisionId) throw new NotFoundException('Linha de estrutura não encontrada')

    await bomLineRepository.delete(lineId)
    return { success: true }
  }

  // ── Materiais substitutos de uma linha de material (ADR-023, item 4) — só informativo, não
  // consumido por MRP/Reserva/Produção nesta versão (ver comentário no schema). ──

  private async findLineOrThrow(bomRevisionId: string, lineId: string): Promise<BomLineRecord> {
    const line = (await bomLineRepository.findById(lineId)) as BomLineRecord | null
    if (!line || line.bomRevisionId !== bomRevisionId) throw new NotFoundException('Linha de estrutura não encontrada')
    if (line.lineType !== 'material') throw new BadRequestException('Só linhas de matéria-prima podem ter substitutos')
    return line
  }

  async listSubstitutes(bomRevisionId: string, lineId: string) {
    await this.findLineOrThrow(bomRevisionId, lineId)
    return bomLineSubstituteRepository.findManyByLine(lineId)
  }

  async addSubstitute(bomRevisionId: string, lineId: string, materialId: string, notes: string) {
    await this.assertDraft(bomRevisionId)
    const line = await this.findLineOrThrow(bomRevisionId, lineId)
    if (line.materialId === materialId) {
      throw new BadRequestException('O material substituto não pode ser o mesmo material principal da linha')
    }
    const material = await materialRepository.findById(materialId)
    if (!material) throw new NotFoundException('Matéria-prima substituta não encontrada')

    const existing = await bomLineSubstituteRepository.findByLineAndMaterial(lineId, materialId)
    if (existing) throw new BadRequestException('Este material já está cadastrado como substituto desta linha')

    return bomLineSubstituteRepository.createSubstitute({ bomLineId: lineId, materialId, notes })
  }

  async removeSubstitute(bomRevisionId: string, lineId: string, substituteId: string) {
    await this.assertDraft(bomRevisionId)
    await this.findLineOrThrow(bomRevisionId, lineId)
    const substitute = (await bomLineSubstituteRepository.findById(substituteId)) as { bomLineId: string } | null
    if (!substitute || substitute.bomLineId !== lineId) throw new NotFoundException('Substituto não encontrado')

    await bomLineSubstituteRepository.delete(substituteId)
    return { success: true }
  }

  // ── Catálogo de tipos de operação (reaproveitável entre revisões/produtos) ──

  async listOperationTypes() {
    return operationTypeRepository.findManyActive()
  }

  async createOperationType(data: CreateOperationTypeDto) {
    const existing = await operationTypeRepository.findByName(data.name)
    if (existing) throw new BadRequestException(`Já existe um tipo de operação "${data.name}"`)

    return operationTypeRepository.create({ name: data.name, description: data.description })
  }

  // ── Operações da revisão (sequência + tempo padrão, sem capacidade/programação) ──

  async listOperations(bomRevisionId: string) {
    const revision = await bomRevisionRepository.findById(bomRevisionId)
    if (!revision) throw new NotFoundException('Revisão de engenharia não encontrada')
    return productOperationRepository.findManyByRevision(bomRevisionId)
  }

  async addOperation(bomRevisionId: string, data: ProductOperationDto) {
    await this.assertDraft(bomRevisionId)

    const operationType = await operationTypeRepository.findById(data.operationTypeId)
    if (!operationType) throw new NotFoundException('Tipo de operação não encontrado')

    let sequenceOrder = data.sequenceOrder
    if (sequenceOrder === undefined) {
      const maxSequence = await productOperationRepository.findMaxSequenceOrder(bomRevisionId)
      sequenceOrder = maxSequence === null ? SEQUENCE_STEP : maxSequence + SEQUENCE_STEP
    }

    return productOperationRepository.createOperation({
      bomRevisionId,
      operationTypeId: data.operationTypeId,
      sequenceOrder,
      description: data.description,
      setupTimeMinutes: data.setupTimeMinutes,
      runTimeMinutesPerUnit: data.runTimeMinutesPerUnit,
      workCenter: data.workCenter,
      notes: data.notes,
    })
  }

  async updateOperation(bomRevisionId: string, operationId: string, data: ProductOperationDto) {
    await this.assertDraft(bomRevisionId)
    const operation = (await productOperationRepository.findById(operationId)) as { bomRevisionId: string } | null
    if (!operation || operation.bomRevisionId !== bomRevisionId) throw new NotFoundException('Operação não encontrada')

    const operationType = await operationTypeRepository.findById(data.operationTypeId)
    if (!operationType) throw new NotFoundException('Tipo de operação não encontrado')

    const updateData: Record<string, unknown> = {
      operationTypeId: data.operationTypeId,
      description: data.description,
      setupTimeMinutes: data.setupTimeMinutes,
      runTimeMinutesPerUnit: data.runTimeMinutesPerUnit,
      workCenter: data.workCenter,
      notes: data.notes,
    }
    if (data.sequenceOrder !== undefined) updateData.sequenceOrder = data.sequenceOrder

    return productOperationRepository.updateOperation(operationId, updateData)
  }

  async removeOperation(bomRevisionId: string, operationId: string) {
    await this.assertDraft(bomRevisionId)
    const operation = (await productOperationRepository.findById(operationId)) as { bomRevisionId: string } | null
    if (!operation || operation.bomRevisionId !== bomRevisionId) throw new NotFoundException('Operação não encontrada')

    await productOperationRepository.delete(operationId)
    return { success: true }
  }
}

export const bomService = new BomService()
