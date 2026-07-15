import { describe, it, expect, afterAll } from 'vitest'
import { db } from '@/lib/db'
import { requisitionService } from '@/app/services/requisition.service'
import { createTestUser, createTestMaterial } from './helpers/fixtures'

/**
 * Fase 7, Subetapa 1 (ADR-009): Requisição vira documento corporativo — Tipo (departamento) e
 * itens não-estocáveis (materialId opcional + description), sem quebrar o fluxo de matéria-prima
 * já existente.
 */
describe('Requisição Corporativa — Tipo e itens não-estocáveis (Subetapa 1)', () => {
  const createdUserIds: string[] = []
  const createdMaterialIds: string[] = []
  const createdRequisitionIds: string[] = []

  afterAll(async () => {
    await db.requisition.deleteMany({ where: { id: { in: createdRequisitionIds } } }) // cascade: RequisitionItem
    await db.material.deleteMany({ where: { id: { in: createdMaterialIds } } })
    await db.statusHistory.deleteMany({ where: { userId: { in: createdUserIds } } })
    await db.user.deleteMany({ where: { id: { in: createdUserIds } } })
  })

  it('Requisição de Produção (item com matéria-prima) continua funcionando exatamente como antes, com Tipo default', async () => {
    const user = await createTestUser('req-corp-producao')
    createdUserIds.push(user.id)
    const material = await createTestMaterial('req-corp-producao')
    createdMaterialIds.push(material.id)

    const requisition = (await requisitionService.create(
      {
        tipo: 'PRODUCAO',
        originModule: 'manual',
        productionOrderId: null,
        neededBy: '',
        notes: '',
        items: [{ materialId: material.id, description: '', supplierId: null, quantity: 10, unit: 'KG', estimatedPrice: 5, notes: '' }],
      },
      user.id
    )) as { id: string; tipo: string }
    createdRequisitionIds.push(requisition.id)

    expect(requisition.tipo).toBe('PRODUCAO')

    const persisted = await db.requisitionItem.findFirst({ where: { requisitionId: requisition.id } })
    expect(persisted?.materialId).toBe(material.id)
    expect(persisted?.quantityFromStock).toBe(0)
    expect(persisted?.quantityToPurchase).toBe(0) // só calculado na transição para "ordered"
  })

  it('Requisição de Manutenção com item não-estocável (sem materialId, com description)', async () => {
    const user = await createTestUser('req-corp-manutencao')
    createdUserIds.push(user.id)

    const requisition = (await requisitionService.create(
      {
        tipo: 'MANUTENCAO',
        originModule: 'manual',
        productionOrderId: null,
        neededBy: '',
        notes: '',
        items: [
          {
            materialId: null,
            description: 'Manutenção preventiva do compressor',
            supplierId: null,
            quantity: 1,
            unit: 'UN',
            estimatedPrice: 0,
            notes: '',
          },
        ],
      },
      user.id
    )) as { id: string; tipo: string }
    createdRequisitionIds.push(requisition.id)

    expect(requisition.tipo).toBe('MANUTENCAO')

    const persisted = await db.requisitionItem.findFirst({ where: { requisitionId: requisition.id } })
    expect(persisted?.materialId).toBeNull()
    expect(persisted?.description).toBe('Manutenção preventiva do compressor')
  })

  it('Todos os 6 Tipos aprovados são aceitos', async () => {
    const user = await createTestUser('req-corp-tipos')
    createdUserIds.push(user.id)
    const tipos = ['PRODUCAO', 'MANUTENCAO', 'ALMOXARIFADO', 'ENGENHARIA', 'SERVICOS', 'OUTROS'] as const

    for (const tipo of tipos) {
      const requisition = (await requisitionService.create(
        {
          tipo,
          originModule: 'manual',
          productionOrderId: null,
          neededBy: '',
          notes: '',
          items: [{ materialId: null, description: `Item de teste — ${tipo}`, supplierId: null, quantity: 1, unit: 'UN', estimatedPrice: 0, notes: '' }],
        },
        user.id
      )) as { id: string; tipo: string }
      createdRequisitionIds.push(requisition.id)
      expect(requisition.tipo).toBe(tipo)
    }
  })
})
