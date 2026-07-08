/**
 * Máscaras de campo (telefone, CPF/CNPJ) e busca automática de endereço por CEP / dados por CNPJ.
 * Todas as funções recebem/retornam string já formatada para uso direto em <Input value=...>.
 */

/** Remove tudo que não for dígito */
export function onlyDigits(value: string): string {
  return (value || '').replace(/\D/g, '')
}

/** Aplica máscara de telefone: (00) 0000-0000 ou (00) 00000-0000 conforme a quantidade de dígitos */
export function maskPhone(value: string): string {
  const digits = onlyDigits(value).slice(0, 11)
  if (digits.length <= 10) {
    return digits
      .replace(/(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{4})(\d)/, '$1-$2')
  }
  return digits
    .replace(/(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{5})(\d)/, '$1-$2')
}

/** Aplica máscara de CPF: 000.000.000-00 */
export function maskCpf(value: string): string {
  return onlyDigits(value)
    .slice(0, 11)
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
}

/** Aplica máscara de CNPJ: 00.000.000/0000-00 */
export function maskCnpj(value: string): string {
  return onlyDigits(value)
    .slice(0, 14)
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2')
}

/**
 * Aplica CPF ou CNPJ automaticamente conforme a quantidade de dígitos digitados
 * (até 11 dígitos = CPF, 12+ dígitos = CNPJ). Ideal para um único campo "CNPJ/CPF".
 */
export function maskCpfCnpj(value: string): string {
  const digits = onlyDigits(value)
  return digits.length > 11 ? maskCnpj(value) : maskCpf(value)
}

/** Aplica máscara de CEP: 00000-000 */
export function maskCep(value: string): string {
  return onlyDigits(value)
    .slice(0, 8)
    .replace(/(\d{5})(\d)/, '$1-$2')
}

export interface ViaCepAddress {
  logradouro: string
  bairro: string
  localidade: string
  uf: string
  erro?: boolean
}

/**
 * Busca endereço pelo CEP usando a API pública ViaCEP.
 * Retorna null se o CEP for inválido, não encontrado, ou a busca falhar (sem lançar erro).
 */
export async function fetchAddressByCep(cep: string): Promise<ViaCepAddress | null> {
  const digits = onlyDigits(cep)
  if (digits.length !== 8) return null
  try {
    const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`)
    if (!res.ok) return null
    const data = await res.json()
    if (data.erro) return null
    return data as ViaCepAddress
  } catch {
    return null
  }
}

export interface CnpjData {
  razao_social: string
  nome_fantasia: string
  logradouro: string
  numero: string
  bairro: string
  municipio: string
  uf: string
  cep: string
  ddd_telefone_1: string
  email: string
  descricao_situacao_cadastral: string
}

/**
 * Busca dados de uma empresa pelo CNPJ usando a BrasilAPI (pública, gratuita, sem chave).
 * Retorna null se o CNPJ for inválido, não encontrado, ou a busca falhar (sem lançar erro).
 */
export async function fetchCompanyByCnpj(cnpj: string): Promise<CnpjData | null> {
  const digits = onlyDigits(cnpj)
  if (digits.length !== 14) return null
  try {
    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`)
    if (!res.ok) return null
    const data = await res.json()
    if (!data || data.type === 'service_error' || data.name === 'CnpjError') return null
    return data as CnpjData
  } catch {
    return null
  }
}
