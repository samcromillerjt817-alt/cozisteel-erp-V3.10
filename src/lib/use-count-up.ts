import { useEffect, useState } from 'react'

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Conta de 0 até `target` uma vez, ~500ms — só quando `target` é numérico (valores em texto, ex.
 * "3 de 10", passam direto, ver dashboard-indicator-card.tsx). Não repete em cada re-render, só na
 * montagem/mudança real de `target`. Sob prefers-reduced-motion, o efeito nem roda: o hook devolve
 * `target` direto em todo render, sem nenhuma animação nem setState. */
export function useCountUp(target: number, durationMs = 500): number {
  const reduced = prefersReducedMotion()
  const [value, setValue] = useState(target)

  useEffect(() => {
    if (reduced) return
    let raf: number
    const start = performance.now()
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / durationMs)
      setValue(Math.round(target * progress))
      if (progress < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, durationMs, reduced])

  return reduced ? target : value
}
