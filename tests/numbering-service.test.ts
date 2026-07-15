import { describe, it, expect, afterAll } from 'vitest'
import { db } from '@/lib/db'
import { numberingService } from '@/app/services/numbering.service'

/**
 * Fase 13, Lote 7 (ADR-015): corrige o bug em que a primeira chamada para um `documentType` nunca
 * visto criava a sequência mas não incrementava `nextNumber`, fazendo a segunda chamada devolver o
 * mesmo número já emitido pela primeira. Reproduzido de verdade hoje por `lote_material`
 * (`purchase-order.service.ts`, Fase 10/ADR-013), que nunca foi adicionado à seed de sequências.
 */
describe('NumberingService — primeiro uso de documentType novo', () => {
  const createdDocumentTypes: string[] = []

  afterAll(async () => {
    await db.numberSequence.deleteMany({ where: { documentType: { in: createdDocumentTypes } } })
  })

  it('duas chamadas seguidas para um documentType nunca visto devolvem números diferentes', async () => {
    const documentType = `lote_teste_${Date.now()}`
    createdDocumentTypes.push(documentType)

    const first = await numberingService.getNextNumber(documentType)
    const second = await numberingService.getNextNumber(documentType)

    expect(first).not.toBe(second)
  })

  it('numera sequencialmente a partir de 1 (prefixo vazio, 6 dígitos, padrão)', async () => {
    const documentType = `lote_teste_seq_${Date.now()}`
    createdDocumentTypes.push(documentType)

    const first = await numberingService.getNextNumber(documentType)
    const second = await numberingService.getNextNumber(documentType)
    const third = await numberingService.getNextNumber(documentType)

    expect(first).toBe('000001')
    expect(second).toBe('000002')
    expect(third).toBe('000003')
  })
})
