import { describe, it, expect } from 'vitest'
import { NextRequest } from 'next/server'
import { rateLimit } from '@/lib/rate-limit'
import { submitCatalogRequestSchema } from '@/app/dto'
import { TooManyRequestsException } from '@/app/exceptions'

/**
 * ADR-026, Fase 5 — segurança de produção. Cobre exatamente o que esta fase introduziu: o limitador
 * de taxa (primeira vez que isso existe neste projeto, nem o link do ADR-025 tinha) e a validação de
 * dígito verificador de CPF/CNPJ na submissão pública (reaproveitando `isValidCpfCnpj`, que já
 * existia em `masks.ts` mas nunca era chamado server-side em lugar nenhum).
 */
describe('Catálogo Digital Público — segurança (ADR-026, Fase 5)', () => {
  function makeRequest(ip: string) {
    return new NextRequest('http://localhost/api/public/catalog', { headers: { 'x-forwarded-for': ip } })
  }

  it('1. rateLimit permite até `points` requisições e rejeita a seguinte com TooManyRequestsException', async () => {
    const ip = `192.0.2.${Math.floor(Math.random() * 255)}`
    const opts = { keyPrefix: `test-limit-${Date.now()}`, points: 3, durationSeconds: 60 }

    await rateLimit(makeRequest(ip), opts)
    await rateLimit(makeRequest(ip), opts)
    await rateLimit(makeRequest(ip), opts)
    await expect(rateLimit(makeRequest(ip), opts)).rejects.toThrow(TooManyRequestsException)
  })

  it('2. rateLimit isola por IP — um IP estourado não afeta outro IP diferente', async () => {
    const opts = { keyPrefix: `test-limit-isolation-${Date.now()}`, points: 1, durationSeconds: 60 }
    const ipA = '192.0.2.10'
    const ipB = '192.0.2.20'

    await rateLimit(makeRequest(ipA), opts)
    await expect(rateLimit(makeRequest(ipA), opts)).rejects.toThrow(TooManyRequestsException)
    await expect(rateLimit(makeRequest(ipB), opts)).resolves.toBeUndefined()
  })

  it('3. submitCatalogRequestSchema aceita CPF/CNPJ com dígito verificador válido', () => {
    const base = { idempotencyKey: 'a'.repeat(10), clientName: 'Cliente Teste', items: [{ productId: 'x', quantity: 1 }] }
    expect(() => submitCatalogRequestSchema.parse({ ...base, clientCpfCnpj: '111.444.777-35' })).not.toThrow()
    expect(() => submitCatalogRequestSchema.parse({ ...base, clientCpfCnpj: '11.222.333/0001-81' })).not.toThrow()
  })

  it('4. submitCatalogRequestSchema rejeita CPF/CNPJ com dígito verificador inválido', () => {
    const base = { idempotencyKey: 'a'.repeat(10), clientName: 'Cliente Teste', items: [{ productId: 'x', quantity: 1 }] }
    expect(() => submitCatalogRequestSchema.parse({ ...base, clientCpfCnpj: '111.444.777-00' })).toThrow(/CPF ou CNPJ inválido/)
  })

  it('5. submitCatalogRequestSchema aceita CPF/CNPJ vazio (identificação sem documento)', () => {
    const base = { idempotencyKey: 'a'.repeat(10), clientName: 'Cliente Teste', items: [{ productId: 'x', quantity: 1 }] }
    expect(() => submitCatalogRequestSchema.parse({ ...base, clientCpfCnpj: '' })).not.toThrow()
  })
})
