// Módulo Clientes (Fase 11.5, Subetapa 11.5.6 — piloto/template oficial). Tipos próprios do módulo,
// independentes da `interface Client` mais estreita que ainda vive em `page.tsx` (usada só pelo select
// de cliente do Orçamento, que não precisa desses campos) — evita acoplar os dois.

export interface ClientRecord {
  id: string
  corporateName: string
  tradeName: string
  // Nullable no schema desde a correção do bug de duplicidade (CNPJ/CPF agora é `@unique` de verdade,
  // o que exige `null` em vez de `''` para "sem documento" — string vazia colidiria com outro
  // cliente sem documento). `clientToFormData` já normaliza para `''` no formulário.
  cpfCnpj: string | null
  ie: string
  email: string
  phone: string
  contactName: string
  contactPhone: string
  zipCode: string
  address: string
  neighborhood: string
  city: string
  state: string
  active: boolean
  situacaoCadastral: string
  cnaeCode: string
  cnaeDescription: string
  createdAt: string
}

// Campos que o formulário de criar/editar expõe hoje — mesmo conjunto de antes da migração (nenhum
// campo novo adicionado; `im`/`phone2`/`contactEmail`/`number`/`complement`/`notes` já existem no DTO
// do backend mas nunca foram expostos no formulário — fora do escopo desta subetapa, catalogado à
// parte, não uma regressão desta migração).
const FORM_FIELD_KEYS = [
  'corporateName', 'tradeName', 'cpfCnpj', 'ie', 'email', 'phone',
  'contactName', 'contactPhone', 'zipCode', 'address', 'neighborhood', 'city', 'state',
  'situacaoCadastral', 'cnaeCode', 'cnaeDescription',
] as const

// O formulário sempre trabalha com `string` (o campo de CNPJ/CPF nunca perde valor por causa da
// máscara) — só `ClientRecord.cpfCnpj` é nullable, refletindo o schema; por isso o override abaixo.
// `active` fica fora de `FORM_FIELD_KEYS` (que assume string) e é tratado à parte, com default `true`
// (ADR-022, Fase UX-6, achado #24 — campo já existia no schema/DTO, nunca exposto no formulário).
export type ClientFormData = Omit<Pick<ClientRecord, (typeof FORM_FIELD_KEYS)[number]>, 'cpfCnpj'> & { cpfCnpj: string; active: boolean }

export const EMPTY_CLIENT_FORM: ClientFormData = FORM_FIELD_KEYS.reduce((acc, key) => {
  acc[key] = ''
  return acc
}, { active: true } as ClientFormData)

/**
 * Converte um `ClientRecord` completo (sempre buscado por id via `GET /api/clients/[id]`, nunca a
 * partir de uma linha de lista possivelmente incompleta) em dado de formulário — itera a MESMA lista
 * `FORM_FIELD_KEYS` usada por `EMPTY_CLIENT_FORM`, em vez de reconstruir campo a campo à mão. Isso
 * elimina de vez a classe do bug original do `openEditClient` (Fase 13): 6 campos (`ie`,
 * `contactName`, `contactPhone`, `zipCode`, `address`, `neighborhood`) eram hardcoded como string
 * vazia em vez de vir do registro, porque a função antiga listava os campos duas vezes (uma em
 * `emptyClient()`, outra em `openEditClient`) e a segunda lista ficou incompleta sem que o compilador
 * pudesse pegar o erro. Aqui só existe UMA lista.
 */
export function clientToFormData(client: ClientRecord): ClientFormData {
  return FORM_FIELD_KEYS.reduce((acc, key) => {
    acc[key] = client[key] || ''
    return acc
  }, { active: client.active } as ClientFormData)
}
