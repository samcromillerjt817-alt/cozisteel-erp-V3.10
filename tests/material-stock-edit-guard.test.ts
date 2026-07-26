import { describe, it, expect, afterAll } from 'vitest'
import { db } from '@/lib/db'
import { materialService } from '@/app/services/material.service'
import { createTestUser } from './helpers/fixtures'

/**
 * ADR-022 (Fase UX-1, achado #06) — "Estoque atual" tinha duas portas de entrada: o formulário de
 * Material (sem motivo, sem `StockMovement`) e a tela de Ajuste de Estoque (motivo obrigatório +
 * `StockMovement` real). `materialService.update()` agora ignora `stockQty` silenciosamente — o
 * saldo só muda por `stockService.adjust()`.
 */
describe('MaterialService.update — bloqueio de stockQty (ADR-022, Fase UX-1)', () => {
  const createdUserIds: string[] = []
  const createdMaterialIds: string[] = []

  afterAll(async () => {
    await db.material.deleteMany({ where: { id: { in: createdMaterialIds } } })
    await db.user.deleteMany({ where: { id: { in: createdUserIds } } })
  })

  it('1. update() ignora stockQty enviado no corpo, mesmo outros campos sendo atualizados', async () => {
    const user = await createTestUser('material-stock-guard')
    createdUserIds.push(user.id)
    const material = await db.material.create({ data: { name: 'Material Teste Stock Guard', stockQty: 50 } })
    createdMaterialIds.push(material.id)

    const updated = await materialService.update(material.id, { name: 'Material Teste Stock Guard (editado)', stockQty: 99999 }, user.id) as { name: string; stockQty: number }

    expect(updated.name).toBe('Material Teste Stock Guard (editado)')
    expect(updated.stockQty).toBe(50)

    const fromDb = await db.material.findUnique({ where: { id: material.id } })
    expect(fromDb?.stockQty).toBe(50)
  })
})
