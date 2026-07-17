import { db } from '@/lib/db'
import { BadRequestException } from '@/app/exceptions'

const MAX_ROWS = 500

export interface AdminQueryResult {
  rows: Record<string, unknown>[]
  truncated: boolean
}

/**
 * Fase Administração (ADR-021, Subetapa 3) — console de consulta somente-leitura. Deliberadamente
 * SEM escrita: é a metade "segura" da postura híbrida decidida no ADR-021 Parte 3(c) — cobre
 * diagnóstico livre sem herdar o risco de um console de escrita livre (postura (a), rejeitada).
 * Correções de dado passam pela `AdminRecipesService` (receitas curadas, com preview + auditoria),
 * nunca por aqui.
 */
class AdminQueryService {
  async runReadOnlyQuery(sql: string): Promise<AdminQueryResult> {
    const trimmed = sql.trim()
    if (!trimmed) throw new BadRequestException('Informe uma consulta SQL')

    const firstWord = trimmed.match(/^\s*(\w+)/)?.[1]?.toUpperCase()
    if (firstWord !== 'SELECT' && firstWord !== 'WITH') {
      throw new BadRequestException('Somente consultas SELECT são permitidas neste console')
    }

    // Bloqueia múltiplas instruções empilhadas (ex. "SELECT 1; DROP TABLE x") — remove strings
    // entre aspas simples antes de procurar por ";" solto, pra não confundir um ";" dentro de um
    // literal de texto com um separador de instrução real.
    const withoutStrings = trimmed.replace(/'[^']*'/g, '')
    const withoutTrailingSemicolon = withoutStrings.replace(/;\s*$/, '')
    if (withoutTrailingSemicolon.includes(';')) {
      throw new BadRequestException('Apenas uma instrução por consulta é permitida')
    }

    const singleStatement = trimmed.replace(/;\s*$/, '')
    // Envolve numa subconsulta com LIMIT — garante que o próprio banco nunca devolva mais que
    // MAX_ROWS+1 linhas, em vez de buscar tudo e só cortar depois em memória.
    const wrapped = `SELECT * FROM (${singleStatement}) AS admin_query_result LIMIT ${MAX_ROWS + 1}`

    let rows: Record<string, unknown>[]
    try {
      rows = await db.$queryRawUnsafe<Record<string, unknown>[]>(wrapped)
    } catch (e) {
      throw new BadRequestException(`Erro na consulta: ${e instanceof Error ? e.message : 'inválida'}`)
    }

    const truncated = rows.length > MAX_ROWS
    const limited = truncated ? rows.slice(0, MAX_ROWS) : rows
    return { rows: limited.map(sanitizeRow), truncated }
  }
}

/** `$queryRawUnsafe` devolve inteiro literal (ex. de uma expressão/CTE, não de uma coluna tipada)
 * como `BigInt` — `JSON.stringify`/`NextResponse.json()` lançam exceção ao serializar `BigInt` sem
 * isso, quebrando a resposta inteira da rota mesmo para uma consulta válida. Convertido pra `Number`
 * (perda de precisão só além de `Number.MAX_SAFE_INTEGER`, sem relevância prática pros dados deste
 * ERP). */
function sanitizeRow(row: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(row)) {
    sanitized[key] = typeof value === 'bigint' ? Number(value) : value
  }
  return sanitized
}

export const adminQueryService = new AdminQueryService()
