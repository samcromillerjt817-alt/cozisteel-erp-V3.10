import { useEffect, useState } from 'react'

/**
 * Retorna uma versão "atrasada" de `value`, que só atualiza depois que `value` fica parado por
 * `delayMs` (ADR-014) — usado nas buscas ao vivo do sistema, que antes disparavam uma requisição
 * HTTP completa a cada tecla digitada, sem nenhum debounce em nenhum lugar.
 */
export function useDebouncedValue<T>(value: T, delayMs = 350): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])

  return debounced
}
