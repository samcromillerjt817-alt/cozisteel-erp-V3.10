/**
 * Valida uma transição de status contra um mapa de transições permitidas.
 * Por padrão, os únicos status aceitáveis como alvo são as chaves do mapa —
 * mas alguns módulos têm estados que só são alcançáveis por outro endpoint
 * (ex: purchase-orders' partially_received/received, setados só via /receive),
 * daí o parâmetro opcional `validStatuses` para restringir o que é aceito aqui.
 * Retorna uma mensagem de erro em português se a transição for inválida, ou
 * null se for permitida.
 */
export function checkTransition(
  currentStatus: string,
  newStatus: string,
  transitions: Record<string, string[]>,
  validStatuses: string[] = Object.keys(transitions)
): string | null {
  if (!validStatuses.includes(newStatus)) {
    return `Status inválido. Valores aceitos: ${validStatuses.join(', ')}`
  }
  const allowed = transitions[currentStatus] || []
  if (!allowed.includes(newStatus)) {
    return `Não é possível mudar de "${currentStatus}" para "${newStatus}"`
  }
  return null
}
