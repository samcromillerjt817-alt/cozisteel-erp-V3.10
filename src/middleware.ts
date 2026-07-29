import { NextRequest, NextResponse } from 'next/server'
import { RateLimiterMemory } from 'rate-limiter-flexible'

export const runtime = 'nodejs'

/**
 * Segurança de borda (ADR-027) — primeira vez que existe um `middleware.ts` neste projeto. Roda
 * antes de QUALQUER rota (páginas e API), no mesmo processo Node único do PM2 — por isso os
 * limitadores em memória abaixo persistem corretamente entre requisições (não é um deploy serverless
 * multi-instância, então não há problema de estado dividido entre processos).
 *
 * 3 responsabilidades, nesta ordem: (1) bloquear rotas de desenvolvimento fora de produção,
 * (2) rate limiting por IP — login muito mais restrito que o resto, já que é o alvo clássico de
 * força bruta, (3) cabeçalhos de segurança em toda resposta.
 */

// Login: alvo nº1 de força bruta — limite bem mais apertado que o resto. Complementa o bloqueio de
// conta por username em `src/lib/auth.ts` (esse aqui pega por IP, aquele por conta — juntos cobrem
// tanto "um atacante tentando várias senhas na mesma conta" quanto "um atacante tentando muitas
// contas do mesmo IP").
const loginLimiter = new RateLimiterMemory({ points: 8, duration: 60, blockDuration: 120 })

// Restante da API autenticada — limite generoso (uso legítimo não deveria nunca chegar perto disso),
// só para conter um script/bot martelando o servidor. `/api/public/*` já tem seus próprios limites
// mais específicos (ADR-025/026), não duplicados aqui.
const apiLimiter = new RateLimiterMemory({ points: 300, duration: 60 })

function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return req.headers.get('x-real-ip') || 'unknown'
}

function tooManyRequests(message: string) {
  return NextResponse.json({ error: message }, { status: 429 })
}

const SECURITY_HEADERS: Record<string, string> = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'X-DNS-Prefetch-Control': 'off',
  // `next/font/google` (Inter, Space Grotesk) é auto-hospedado no build — nenhum recurso externo
  // (fonte/script/imagem) é carregado de fora deste próprio domínio, então `'self'` cobre tudo.
  // 'unsafe-inline' em script/style é necessário pro próprio hydration do Next.js.
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
  ].join('; '),
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Rotas de validação de componente (`/dev/*`) nunca devem responder fora de desenvolvimento —
  // existem só pra testar componentes isolados com dado fixo, mas não têm razão de existir numa
  // instância pública.
  if (pathname.startsWith('/dev') && process.env.APP_ENV === 'production') {
    return new NextResponse('Not found', { status: 404 })
  }

  const ip = clientIp(req)

  if (pathname === '/api/auth/callback/credentials') {
    try {
      await loginLimiter.consume(ip)
    } catch {
      return tooManyRequests('Muitas tentativas de login. Tente novamente em alguns minutos.')
    }
  } else if (pathname.startsWith('/api/') && !pathname.startsWith('/api/public/')) {
    try {
      await apiLimiter.consume(ip)
    } catch {
      return tooManyRequests('Muitas requisições. Tente novamente em instantes.')
    }
  }

  const response = NextResponse.next()
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value)
  }
  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
