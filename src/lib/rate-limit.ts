import { RateLimiterMemory } from 'rate-limiter-flexible'
import { NextRequest } from 'next/server'
import { TooManyRequestsException } from '@/app/exceptions'

/**
 * Rate limiting real (ADR-026, Fase 5) — primeira vez que isso existe neste projeto (nem o link
 * público de orçamento do ADR-025 tinha). `RateLimiterMemory` guarda estado só no processo Node
 * atual — adequado a uma instância única PM2/SQLite (decisão do usuário, ADR-026 Parte 16); não
 * sobrevive a um restart do PM2 nem escala pra múltiplas instâncias, mas isso não é o caso deste
 * deploy.
 */
const limiters = new Map<string, RateLimiterMemory>()

function getLimiter(keyPrefix: string, points: number, durationSeconds: number): RateLimiterMemory {
  let limiter = limiters.get(keyPrefix)
  if (!limiter) {
    limiter = new RateLimiterMemory({ points, duration: durationSeconds, keyPrefix })
    limiters.set(keyPrefix, limiter)
  }
  return limiter
}

/** IP do cliente — Tailscale Funnel/qualquer proxy na frente normalmente preenche x-forwarded-for;
 *  sem isso, cai para um valor fixo (rate limit vira "global" nesse cenário raro, não quebra). */
function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return req.headers.get('x-real-ip') || 'unknown'
}

/**
 * Consome 1 ponto do limitador `keyPrefix` para o IP do request atual. Lança
 * `TooManyRequestsException` (429) se estourar `points` requisições em `durationSeconds`.
 * Uso: `await rateLimit(req, { keyPrefix: 'catalog-requests', points: 5, durationSeconds: 60 })`
 * no início de uma rota pública, antes de qualquer leitura/escrita.
 */
export async function rateLimit(
  req: NextRequest,
  { keyPrefix, points, durationSeconds }: { keyPrefix: string; points: number; durationSeconds: number }
): Promise<void> {
  const limiter = getLimiter(keyPrefix, points, durationSeconds)
  try {
    await limiter.consume(clientIp(req))
  } catch {
    throw new TooManyRequestsException()
  }
}
