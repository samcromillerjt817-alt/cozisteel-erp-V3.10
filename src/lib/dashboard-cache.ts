// Cache genérico em memória do processo, TTL curto (ADR-017 §13, decisão #2 — 30-60s, sem Redis/
// scheduler/WebSocket). Usado só pelos widgets marcados como "caros" (histórico/ranking); widgets de
// estado atual (contagens indexadas) consultam direto, sem passar por aqui. Perdido a cada restart do
// processo — aceitável, o dado é sempre recalculável a partir do banco.

interface CacheEntry<T> {
  value: T
  expiresAt: number
}

const store = new Map<string, CacheEntry<unknown>>()

export async function getOrCompute<T>(key: string, ttlSeconds: number, compute: () => Promise<T>): Promise<T> {
  const now = Date.now()
  const cached = store.get(key) as CacheEntry<T> | undefined
  if (cached && cached.expiresAt > now) {
    return cached.value
  }
  const value = await compute()
  store.set(key, { value, expiresAt: now + ttlSeconds * 1000 })
  return value
}

export function invalidate(key: string): void {
  store.delete(key)
}

export function clearAll(): void {
  store.clear()
}
