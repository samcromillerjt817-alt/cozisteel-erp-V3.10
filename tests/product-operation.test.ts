import { describe, it, expect, afterAll } from 'vitest'
import { db } from '@/lib/db'
import { bomService } from '@/app/services/bom.service'
import { createTestUser, createTestProduct } from './helpers/fixtures'

/**
 * Fase 4, Subetapa 3 (ADR-005): OperationType (catálogo) + ProductOperation (tempo padrão por
 * revisão). Deliberadamente sem capacidade finita, programação, apontamento ou calendário.
 */
describe('Engenharia do Produto — Operações (Subetapa 3)', () => {
  const createdUserIds: string[] = []
  const createdProductIds: string[] = []
  const createdRevisionIds: string[] = []
  const createdOperationTypeIds: string[] = []

  afterAll(async () => {
    await db.productOperation.deleteMany({ where: { bomRevisionId: { in: createdRevisionIds } } })
    await db.bomRevision.deleteMany({ where: { id: { in: createdRevisionIds } } })
    await db.operationType.deleteMany({ where: { id: { in: createdOperationTypeIds } } })
    await db.product.deleteMany({ where: { id: { in: createdProductIds } } })
    await db.statusHistory.deleteMany({ where: { userId: { in: createdUserIds } } })
    await db.user.deleteMany({ where: { id: { in: createdUserIds } } })
  })

  it('cria um tipo de operação e rejeita nome duplicado', async () => {
    const opType = (await bomService.createOperationType({ name: 'Corte a Laser (teste)', description: '' })) as { id: string; name: string }
    createdOperationTypeIds.push(opType.id)

    expect(opType.name).toBe('Corte a Laser (teste)')
    await expect(bomService.createOperationType({ name: 'Corte a Laser (teste)', description: '' })).rejects.toThrow(
      /Já existe um tipo de operação/
    )
  })

  it('auto-atribui sequenceOrder em incrementos de 10 quando não informado', async () => {
    const user = await createTestUser('op-sequence')
    createdUserIds.push(user.id)
    const product = await createTestProduct('op-sequence')
    createdProductIds.push(product.id)
    const opType = (await bomService.createOperationType({ name: 'Dobra (teste seq)', description: '' })) as { id: string }
    createdOperationTypeIds.push(opType.id)

    const revision = (await bomService.createRevision(product.id, { revisionCode: 'A', notes: '' }, user.id)) as { id: string }
    createdRevisionIds.push(revision.id)

    const first = await bomService.addOperation(revision.id, {
      operationTypeId: opType.id,
      description: 'Primeira operação',
      setupTimeMinutes: 10,
      runTimeMinutesPerUnit: 2,
      workCenter: 'Célula 1',
      notes: '',
    })
    const second = await bomService.addOperation(revision.id, {
      operationTypeId: opType.id,
      description: 'Segunda operação',
      setupTimeMinutes: 5,
      runTimeMinutesPerUnit: 1,
      workCenter: 'Célula 2',
      notes: '',
    })

    expect((first as { sequenceOrder: number }).sequenceOrder).toBe(10)
    expect((second as { sequenceOrder: number }).sequenceOrder).toBe(20)

    const operations = await bomService.listOperations(revision.id)
    expect(operations).toHaveLength(2)
  })

  it('respeita sequenceOrder explícito e permite inserir entre operações existentes', async () => {
    const user = await createTestUser('op-explicit')
    createdUserIds.push(user.id)
    const product = await createTestProduct('op-explicit')
    createdProductIds.push(product.id)
    const opType = (await bomService.createOperationType({ name: 'Solda (teste)', description: '' })) as { id: string }
    createdOperationTypeIds.push(opType.id)

    const revision = (await bomService.createRevision(product.id, { revisionCode: 'A', notes: '' }, user.id)) as { id: string }
    createdRevisionIds.push(revision.id)

    await bomService.addOperation(revision.id, {
      operationTypeId: opType.id,
      sequenceOrder: 10,
      description: 'Op 10',
      setupTimeMinutes: 0,
      runTimeMinutesPerUnit: 0,
      workCenter: '',
      notes: '',
    })
    await bomService.addOperation(revision.id, {
      operationTypeId: opType.id,
      sequenceOrder: 20,
      description: 'Op 20',
      setupTimeMinutes: 0,
      runTimeMinutesPerUnit: 0,
      workCenter: '',
      notes: '',
    })
    // Inserida no meio, sem renumerar as outras duas
    const middle = await bomService.addOperation(revision.id, {
      operationTypeId: opType.id,
      sequenceOrder: 15,
      description: 'Op 15 (inserida depois)',
      setupTimeMinutes: 0,
      runTimeMinutesPerUnit: 0,
      workCenter: '',
      notes: '',
    })

    expect((middle as { sequenceOrder: number }).sequenceOrder).toBe(15)
    const operations = (await bomService.listOperations(revision.id)) as Array<{ sequenceOrder: number }>
    expect(operations.map((o) => o.sequenceOrder)).toEqual([10, 15, 20])
  })

  it('rejeita operationTypeId inexistente e bloqueia edição fora de rascunho', async () => {
    const user = await createTestUser('op-immutable')
    createdUserIds.push(user.id)
    const product = await createTestProduct('op-immutable')
    createdProductIds.push(product.id)
    const opType = (await bomService.createOperationType({ name: 'Pintura (teste)', description: '' })) as { id: string }
    createdOperationTypeIds.push(opType.id)

    const revision = (await bomService.createRevision(product.id, { revisionCode: 'A', notes: '' }, user.id)) as { id: string }
    createdRevisionIds.push(revision.id)

    await expect(
      bomService.addOperation(revision.id, {
        operationTypeId: 'inexistente',
        description: '',
        setupTimeMinutes: 0,
        runTimeMinutesPerUnit: 0,
        workCenter: '',
        notes: '',
      })
    ).rejects.toThrow(/Tipo de operação não encontrado/)

    const operation = await bomService.addOperation(revision.id, {
      operationTypeId: opType.id,
      description: 'Op válida',
      setupTimeMinutes: 1,
      runTimeMinutesPerUnit: 1,
      workCenter: '',
      notes: '',
    })

    await bomService.changeStatus(revision.id, 'released', user.id)

    await expect(
      bomService.updateOperation(revision.id, (operation as { id: string }).id, {
        operationTypeId: opType.id,
        description: 'Tentando editar liberada',
        setupTimeMinutes: 1,
        runTimeMinutesPerUnit: 1,
        workCenter: '',
        notes: '',
      })
    ).rejects.toThrow(/só pode ser alterada enquanto a revisão está em rascunho/)

    await expect(bomService.removeOperation(revision.id, (operation as { id: string }).id)).rejects.toThrow(
      /só pode ser alterada enquanto a revisão está em rascunho/
    )
  })

  it('permite atualizar e remover operação em revisão de rascunho', async () => {
    const user = await createTestUser('op-crud')
    createdUserIds.push(user.id)
    const product = await createTestProduct('op-crud')
    createdProductIds.push(product.id)
    const opType = (await bomService.createOperationType({ name: 'Acabamento (teste)', description: '' })) as { id: string }
    createdOperationTypeIds.push(opType.id)

    const revision = (await bomService.createRevision(product.id, { revisionCode: 'A', notes: '' }, user.id)) as { id: string }
    createdRevisionIds.push(revision.id)

    const operation = await bomService.addOperation(revision.id, {
      operationTypeId: opType.id,
      description: 'Descrição original',
      setupTimeMinutes: 5,
      runTimeMinutesPerUnit: 1,
      workCenter: 'Célula A',
      notes: '',
    })

    const updated = await bomService.updateOperation(revision.id, (operation as { id: string }).id, {
      operationTypeId: opType.id,
      description: 'Descrição atualizada',
      setupTimeMinutes: 8,
      runTimeMinutesPerUnit: 2,
      workCenter: 'Célula B',
      notes: '',
    })
    expect((updated as { description: string }).description).toBe('Descrição atualizada')
    expect((updated as { workCenter: string }).workCenter).toBe('Célula B')

    const result = await bomService.removeOperation(revision.id, (operation as { id: string }).id)
    expect(result.success).toBe(true)

    const operations = await bomService.listOperations(revision.id)
    expect(operations).toHaveLength(0)
  })
})
