import { describe, it, expect } from 'vitest'
import { formatIndicatorValue, TREND_STYLE } from '@/lib/dashboard-trend'

describe('dashboard-trend', () => {
  it('formats currency values via formatCurrency', () => {
    const result = formatIndicatorValue({ value: 1500.5, format: 'currency' })
    expect(result).toBe('R$ 1.500,50')
  })

  it('passes through non-currency values unchanged', () => {
    expect(formatIndicatorValue({ value: 42 })).toBe(42)
    expect(formatIndicatorValue({ value: '3 de 10' })).toBe('3 de 10')
  })

  it('exposes a style entry for every trend direction', () => {
    expect(TREND_STYLE.up.colorClass).toBe('text-ms-success')
    expect(TREND_STYLE.down.colorClass).toBe('text-ms-critical')
    expect(TREND_STYLE.stable.colorClass).toBe('text-muted-foreground')
  })
})
