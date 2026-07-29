import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

/**
 * Auditoria de segurança (2ª rodada) — antes, o cookie de sessão/CSRF do NextAuth só ficava
 * `Secure` se `NEXTAUTH_URL` estivesse corretamente configurado como `https://` (e um deploy real
 * chegou a ter isso errado, derrubando a proteção de todos os cookies, inclusive o de sessão). Agora
 * `useSecureCookies` é setado explicitamente em `src/lib/auth.ts`, a partir de `APP_ENV` — não
 * depende mais só da string de `NEXTAUTH_URL` ser interpretada certo. Esses testes confirmam o
 * cálculo em si, recarregando o módulo (`vi.resetModules`) com `APP_ENV` diferente em cada caso —
 * `authOptions` computa `useSecureCookies` uma vez, no carregamento do módulo.
 */
describe('src/lib/auth.ts — useSecureCookies explícito (auditoria de segurança, 2ª rodada)', () => {
  const originalAppEnv = process.env.APP_ENV

  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    if (originalAppEnv === undefined) delete process.env.APP_ENV
    else process.env.APP_ENV = originalAppEnv
    vi.resetModules()
  })

  it('1. useSecureCookies é true quando APP_ENV=production (cookies Secure em produção)', async () => {
    process.env.APP_ENV = 'production'
    const { authOptions } = await import('@/lib/auth')
    expect(authOptions.useSecureCookies).toBe(true)
  })

  it('2. useSecureCookies é false quando APP_ENV não está setado (dev local por HTTP continua funcionando)', async () => {
    delete process.env.APP_ENV
    const { authOptions } = await import('@/lib/auth')
    expect(authOptions.useSecureCookies).toBe(false)
  })

  it('3. useSecureCookies é false quando APP_ENV=development explicitamente', async () => {
    process.env.APP_ENV = 'development'
    const { authOptions } = await import('@/lib/auth')
    expect(authOptions.useSecureCookies).toBe(false)
  })

  it('4. não depende de NEXTAUTH_URL — mesmo com NEXTAUTH_URL http://, APP_ENV=production ainda força cookies seguros', async () => {
    const originalUrl = process.env.NEXTAUTH_URL
    process.env.NEXTAUTH_URL = 'http://172.17.46.147:3000' // valor real que o deploy tinha, causa raiz do achado original
    process.env.APP_ENV = 'production'
    const { authOptions } = await import('@/lib/auth')
    expect(authOptions.useSecureCookies).toBe(true)
    if (originalUrl === undefined) delete process.env.NEXTAUTH_URL
    else process.env.NEXTAUTH_URL = originalUrl
  })
})
