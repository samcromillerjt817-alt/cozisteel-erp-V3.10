import { describe, it, expect, afterAll } from 'vitest'
import { db } from '@/lib/db'
import { authorizeCredentials } from '@/lib/auth'
import { createTestUser } from './helpers/fixtures'

/**
 * Bloqueio de conta por força bruta (ADR-027) — complementa o rate limit por IP do middleware
 * (`src/middleware.ts`), que sozinho não pega um atacante trocando de IP. Guardado no banco (não em
 * memória) pra sobreviver a restart do PM2.
 */
describe('authorizeCredentials — bloqueio de conta (ADR-027)', () => {
  const userIds: string[] = []

  afterAll(async () => {
    await db.user.deleteMany({ where: { id: { in: userIds } } })
  })

  it('1. autentica com credenciais corretas e zera tentativas/bloqueio anteriores', async () => {
    const user = await createTestUser(`lockout-ok-${Date.now()}`)
    userIds.push(user.id)
    await db.user.update({ where: { id: user.id }, data: { failedLoginAttempts: 3 } })

    const result = await authorizeCredentials(user.username, 'teste123')
    expect(result).not.toBeNull()
    expect(result?.id).toBe(user.id)

    const refreshed = await db.user.findUnique({ where: { id: user.id } })
    expect(refreshed?.failedLoginAttempts).toBe(0)
    expect(refreshed?.lockedUntil).toBeNull()
  })

  it('2. devolve null pra senha errada e incrementa failedLoginAttempts', async () => {
    const user = await createTestUser(`lockout-wrong-${Date.now()}`)
    userIds.push(user.id)

    const result = await authorizeCredentials(user.username, 'senha-errada')
    expect(result).toBeNull()

    const refreshed = await db.user.findUnique({ where: { id: user.id } })
    expect(refreshed?.failedLoginAttempts).toBe(1)
  })

  it('3. bloqueia a conta após 5 tentativas erradas', async () => {
    const user = await createTestUser(`lockout-5th-${Date.now()}`)
    userIds.push(user.id)

    for (let i = 0; i < 5; i++) {
      await authorizeCredentials(user.username, 'senha-errada')
    }

    const refreshed = await db.user.findUnique({ where: { id: user.id } })
    expect(refreshed?.lockedUntil).not.toBeNull()
    expect(refreshed!.lockedUntil!.getTime()).toBeGreaterThan(Date.now())
    expect(refreshed?.failedLoginAttempts).toBe(0) // zera ao bloquear, a contagem reinicia depois
  })

  it('4. rejeita login com a SENHA CORRETA enquanto a conta está bloqueada', async () => {
    const user = await createTestUser(`lockout-blocked-correct-pw-${Date.now()}`)
    userIds.push(user.id)
    await db.user.update({ where: { id: user.id }, data: { lockedUntil: new Date(Date.now() + 15 * 60 * 1000) } })

    const result = await authorizeCredentials(user.username, 'teste123')
    expect(result).toBeNull()
  })

  it('5. libera de novo depois que lockedUntil expira, mesmo sem zerar manualmente', async () => {
    const user = await createTestUser(`lockout-expired-${Date.now()}`)
    userIds.push(user.id)
    await db.user.update({ where: { id: user.id }, data: { lockedUntil: new Date(Date.now() - 1000) } }) // já expirado

    const result = await authorizeCredentials(user.username, 'teste123')
    expect(result).not.toBeNull()
  })

  it('6. usuário inativo nunca autentica, independente da senha', async () => {
    const user = await createTestUser(`lockout-inactive-${Date.now()}`)
    userIds.push(user.id)
    await db.user.update({ where: { id: user.id }, data: { active: false } })

    const result = await authorizeCredentials(user.username, 'teste123')
    expect(result).toBeNull()
  })

  it('7. username ou senha ausente devolve null sem tocar o banco', async () => {
    expect(await authorizeCredentials(undefined, 'teste123')).toBeNull()
    expect(await authorizeCredentials('qualquer', undefined)).toBeNull()
  })

  it('8. username inexistente (que não seja "admin") devolve null sem criar nada', async () => {
    const result = await authorizeCredentials('usuario-que-definitivamente-nao-existe-123', 'qualquer')
    expect(result).toBeNull()
    const found = await db.user.findUnique({ where: { username: 'usuario-que-definitivamente-nao-existe-123' } })
    expect(found).toBeNull()
  })
})
