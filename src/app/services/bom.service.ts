import { bomRevisionRepository } from '@/app/repositories/bom-revision.repository'
import { bomLineRepository } from '@/app/repositories/bom-line.repository'
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
 */
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  draft: ['released', 'obsolete'],
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
  async changeStatus(id: string, status: string, userId: string) {
    const revision = (await bomRevisionRepository.findById(id)) as BomRevisionRecord | null
    if (!revision) throw new NotFoundException('Revisão de engenharia não encontrada')

    const transitionError = checkTransition(revision.status, status, ALLOWED_TRANSITIONS)
    if (transitionError) throw new BadRequestException(transitionError)

    await statusHistoryService.record('bom_revision', id, revision.status, status, userId)

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
