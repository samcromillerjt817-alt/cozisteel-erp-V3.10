export function formatCurrency(value: number | null | undefined): string {
  const safeValue = typeof value === 'number' && !isNaN(value) ? value : 0
  return safeValue.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function parseCurrencyInput(val: string): number {
  const cleaned = val.replace(/[R$\s.]/g, '').replace(',', '.')
  const num = parseFloat(cleaned)
  return isNaN(num) ? 0 : num
}

export function formatDate(date: Date): string {
  const d = String(date.getDate()).padStart(2, '0')
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const y = date.getFullYear()
  return `${d}/${m}/${y}`
}

export const statusLabels: Record<string, string> = {
  draft: 'Rascunho',
  sent: 'Enviado',
  approved: 'Aprovado',
  rejected: 'Rejeitado',
  cancelled: 'Cancelado',
  expired: 'Expirado',
}

export const statusColors: Record<string, string> = {
  draft: 'bg-yellow-600/20 text-yellow-400 border-yellow-600/30',
  sent: 'bg-blue-600/20 text-blue-400 border-blue-600/30',
  approved: 'bg-green-600/20 text-green-400 border-green-600/30',
  rejected: 'bg-red-600/20 text-red-400 border-red-600/30',
  cancelled: 'bg-gray-600/20 text-gray-400 border-gray-600/30',
  expired: 'bg-orange-600/20 text-orange-400 border-orange-600/30',
}