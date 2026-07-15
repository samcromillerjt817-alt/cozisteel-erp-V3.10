import { maskPhone, maskCep, fetchAddressByCep, fetchCompanyByCnpj, onlyDigits } from '@/lib/masks'

// Extraído de `page.tsx` (Fase 11.5, Subetapa 11.5.6) — já era usado por Cliente e Fornecedor via
// closures locais idênticas; agora é a versão compartilhada para qualquer módulo novo/migrado
// (`platform`-adjacent: lógica pura, não é componente React, por isso vive em `lib`, não em
// `components/platform`). As closures antigas em `page.tsx` continuam intactas até Fornecedores
// migrar também — evita tocar um módulo que não faz parte desta subetapa.

type FieldMap<K extends string> = Partial<Record<K, string>>

export async function handleCepLookup<T extends Record<string, unknown>>(
  cep: string,
  setForm: (updater: (prev: T) => T) => void,
  fieldMap: FieldMap<'address' | 'neighborhood' | 'city' | 'state'> = { address: 'address', neighborhood: 'neighborhood', city: 'city', state: 'state' }
) {
  const addr = await fetchAddressByCep(cep)
  if (!addr) return
  setForm((prev) => {
    const next = { ...prev } as Record<string, unknown>
    if (fieldMap.address) next[fieldMap.address] = addr.logradouro || prev[fieldMap.address as keyof T]
    if (fieldMap.neighborhood) next[fieldMap.neighborhood] = addr.bairro || prev[fieldMap.neighborhood as keyof T]
    if (fieldMap.city) next[fieldMap.city] = addr.localidade || prev[fieldMap.city as keyof T]
    if (fieldMap.state) next[fieldMap.state] = addr.uf || prev[fieldMap.state as keyof T]
    return next as T
  })
}

/** Busca automática pelo CNPJ (razão social, endereço, telefone) — usado em Cliente e Fornecedor. */
export async function handleCnpjLookup<T extends Record<string, unknown>>(
  cnpj: string,
  setForm: (updater: (prev: T) => T) => void,
  fieldMap: FieldMap<'corporateName' | 'tradeName' | 'address' | 'neighborhood' | 'city' | 'state' | 'zipCode' | 'phone' | 'email' | 'situacaoCadastral' | 'cnaeCode' | 'cnaeDescription'>,
  notify: { info: (msg: string) => void; error: (msg: string) => void; success: (msg: string) => void }
) {
  if (onlyDigits(cnpj).length !== 14) return // só busca para CNPJ (14 dígitos), não CPF
  notify.info('Buscando dados do CNPJ...')
  const data = await fetchCompanyByCnpj(cnpj)
  if (!data) {
    notify.error('CNPJ não encontrado ou API indisponível')
    return
  }
  setForm((prev) => {
    const next = { ...prev } as Record<string, unknown>
    if (fieldMap.corporateName) next[fieldMap.corporateName] = data.razao_social || prev[fieldMap.corporateName as keyof T]
    if (fieldMap.tradeName) next[fieldMap.tradeName] = data.nome_fantasia || prev[fieldMap.tradeName as keyof T]
    if (fieldMap.address) next[fieldMap.address] = `${data.logradouro || ''}${data.numero ? `, ${data.numero}` : ''}`.trim() || prev[fieldMap.address as keyof T]
    if (fieldMap.neighborhood) next[fieldMap.neighborhood] = data.bairro || prev[fieldMap.neighborhood as keyof T]
    if (fieldMap.city) next[fieldMap.city] = data.municipio || prev[fieldMap.city as keyof T]
    if (fieldMap.state) next[fieldMap.state] = data.uf || prev[fieldMap.state as keyof T]
    if (fieldMap.zipCode) next[fieldMap.zipCode] = data.cep ? maskCep(data.cep) : prev[fieldMap.zipCode as keyof T]
    if (fieldMap.phone && data.ddd_telefone_1) next[fieldMap.phone] = maskPhone(data.ddd_telefone_1)
    if (fieldMap.email && data.email) next[fieldMap.email] = data.email
    if (fieldMap.situacaoCadastral) next[fieldMap.situacaoCadastral] = data.descricao_situacao_cadastral || prev[fieldMap.situacaoCadastral as keyof T]
    if (fieldMap.cnaeCode && data.cnae_fiscal) next[fieldMap.cnaeCode] = String(data.cnae_fiscal)
    if (fieldMap.cnaeDescription) next[fieldMap.cnaeDescription] = data.cnae_fiscal_descricao || prev[fieldMap.cnaeDescription as keyof T]
    return next as T
  })
  notify.success('Dados preenchidos a partir do CNPJ!')
}
