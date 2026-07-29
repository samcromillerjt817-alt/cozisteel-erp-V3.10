import { describe, it, expect } from 'vitest'
import { formatQuantity } from '@/lib/format'

/**
 * Achado real (usuário relatou matéria-prima com estoque negativo exibindo "-3.849999999999998
 * KG" em vez de "-3,85 KG") — ruído de ponto flutuante acumulado depois de muitas operações de
 * incremento/decremento em sequência no `stockQty`.
 */
describe('formatQuantity — corta ruído de ponto flutuante', () => {
  it('1. corta o ruído de ponto flutuante do caso relatado (-3.849999999999998 -> -3,85)', () => {
    expect(formatQuantity(-3.849999999999998)).toBe('-3,85')
  })

  it('2. corta ruído positivo também (23.100000000000001 -> 23,1)', () => {
    expect(formatQuantity(23.100000000000001)).toBe('23,1')
  })

  it('3. valor inteiro não ganha zeros à direita (50 -> "50", não "50,000")', () => {
    expect(formatQuantity(50)).toBe('50')
  })

  it('4. preserva até 3 casas decimais reais (não arredonda demais)', () => {
    expect(formatQuantity(1.234)).toBe('1,234')
  })

  it('5. null/undefined/NaN viram "0"', () => {
    expect(formatQuantity(null)).toBe('0')
    expect(formatQuantity(undefined)).toBe('0')
    expect(formatQuantity(NaN)).toBe('0')
  })
})
