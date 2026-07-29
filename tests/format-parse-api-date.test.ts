import { describe, it, expect } from 'vitest'
import { parseApiDate } from '@/lib/format'

/**
 * `parseApiDate` — achado numa avaliação end-to-end (2026-07-29): `new Date(string)` direto num
 * valor de data vindo do cliente interpreta "05/09/2026" como mm/dd/aaaa americano (9 de maio) em
 * vez de dd/mm/aaaa (5 de setembro). Corrigido em `shipment.service.ts` e nas 2 rotas de
 * pagamento/recebimento do Financeiro — os únicos 3 pontos do sistema que faziam `new Date()`
 * direto numa string de data vinda de fora.
 */
describe('parseApiDate — nunca confunde dd/mm com mm/dd (ADR-026 addendum)', () => {
  it('1. aceita ISO (aaaa-mm-dd), sem ambiguidade possível', () => {
    const date = parseApiDate('2026-09-05')
    expect(date).not.toBeNull()
    expect(date!.getUTCFullYear()).toBe(2026)
    expect(date!.getUTCMonth()).toBe(8) // setembro
    expect(date!.getUTCDate()).toBe(5)
  })

  it('2. aceita dd/mm/aaaa e nunca inverte com mm/dd', () => {
    const date = parseApiDate('05/09/2026')
    expect(date).not.toBeNull()
    expect(date!.getFullYear()).toBe(2026)
    expect(date!.getMonth()).toBe(8) // setembro, não maio
    expect(date!.getDate()).toBe(5)
  })

  it('3. dd/mm/aaaa com dia > 12 (não ambíguo em mm/dd) também funciona', () => {
    const date = parseApiDate('25/12/2026')
    expect(date).not.toBeNull()
    expect(date!.getMonth()).toBe(11) // dezembro
    expect(date!.getDate()).toBe(25)
  })

  it('4. devolve null para string que não é data nenhuma', () => {
    expect(parseApiDate('não é uma data')).toBeNull()
  })

  it('5. devolve null para formato ambíguo/não reconhecido (ex.: mm/dd/aaaa explícito)', () => {
    // "13/09/2026" só é válido como dd/mm (mês 13 não existe) — mas o inverso, algo que só faz
    // sentido como mm/dd, não é um formato que este parser aceita de propósito (não existe
    // mm/dd/aaaa neste sistema, só ISO ou dd/mm/aaaa).
    expect(parseApiDate('2026/09/05')).toBeNull()
  })
})
