import { db } from '@/lib/db'
import { BadRequestException } from '@/app/exceptions'

const MAX_PREVIEW_ROWS = 50
const MAX_AFFECTED_ROWS = 1000
// Nunca escrever aqui, mesmo com WHERE explícito — preserva a integridade da própria trilha de
// auditoria que este console usa pra se justificar (não faria sentido a ferramenta de correção
// poder apagar o registro de que foi usada).
const BLOCKED_TABLES = ['AuditLog']

export type AdminWriteStatementType = 'UPDATE' | 'DELETE' | 'INSERT'

export interface AdminWriteQueryResult {
  statementType: AdminWriteStatementType
  table: string
  affectedCount: number
  beforeRows: Record<string, unknown>[]
  afterRows: Record<string, unknown>[]
  truncatedPreview: boolean
  committed: boolean
}

/** Sentinela pra forçar rollback de dentro de `db.$transaction` em modo preview — nunca é um erro
 *  de verdade, só o jeito de "desfaça tudo, mas me devolva o que teria acontecido". */
class PreviewRollback extends Error {
  constructor(public result: AdminWriteQueryResult) {
    super('preview-rollback')
  }
}

/**
 * Console de escrita controlado (ADR-021 addendum — pedido explícito do usuário por acesso direto
 * ao banco pra correções, "parecido com o APSDU do TOTVS", depois de confirmar que aceita esse
 * nível de risco em vez de manter só leitura + receitas curadas). Diferente do console de leitura
 * (`AdminQueryService`) e das receitas (`AdminRecipesService`), mas reaproveita as garantias de
 * ambos: só UPDATE/DELETE/INSERT (nunca DROP/ALTER/CREATE/TRUNCATE/PRAGMA — o `firstWord` allowlist
 * já barra o resto), 1 instrução por vez, WHERE obrigatório em UPDATE/DELETE (SQLite não permite
 * JOIN nessas duas formas — "1 tabela por vez" já vem de graça da própria gramática do banco), teto
 * de linhas afetadas, e — a parte que nem o console de leitura nem as receitas têm sozinhos —
 * PREVIEW: roda a instrução de verdade dentro de uma transação, captura antes/depois, e só comita
 * se o chamador pedir explicitamente (`commit: true`); do contrário, força rollback e devolve o que
 * teria acontecido, sem tocar o banco de verdade.
 */
class AdminWriteQueryService {
  async run(sql: string, commit: boolean): Promise<AdminWriteQueryResult> {
    const trimmed = sql.trim()
    if (!trimmed) throw new BadRequestException('Informe uma instrução SQL')

    // Bloqueia múltiplas instruções empilhadas — mesmo check do console de leitura.
    const withoutStrings = trimmed.replace(/'[^']*'/g, '')
    const withoutTrailingSemicolon = withoutStrings.replace(/;\s*$/, '')
    if (withoutTrailingSemicolon.includes(';')) {
      throw new BadRequestException('Apenas uma instrução por vez é permitida')
    }
    const singleStatement = trimmed.replace(/;\s*$/, '')

    const firstWord = singleStatement.match(/^\s*(\w+)/)?.[1]?.toUpperCase()
    if (firstWord !== 'UPDATE' && firstWord !== 'DELETE' && firstWord !== 'INSERT') {
      throw new BadRequestException(
        'Somente UPDATE, DELETE ou INSERT são permitidos neste console — DROP/ALTER/CREATE/TRUNCATE/PRAGMA nunca, use uma migração de schema pra isso'
      )
    }

    const { table, whereClause } = this.parseTarget(firstWord, singleStatement)

    if (BLOCKED_TABLES.some((t) => t.toLowerCase() === table.toLowerCase())) {
      throw new BadRequestException(`A tabela "${table}" não pode ser alterada por este console (preserva a integridade da trilha de auditoria)`)
    }

    try {
      return await db.$transaction(async (tx) => {
        let beforeRows: Record<string, unknown>[] = []

        if (whereClause) {
          const countRows = await tx.$queryRawUnsafe<Array<{ c: bigint | number }>>(
            `SELECT COUNT(*) as c FROM "${table}" WHERE ${whereClause}`
          )
          const affected = Number(countRows[0]?.c ?? 0)
          if (affected > MAX_AFFECTED_ROWS) {
            throw new BadRequestException(
              `Esta condição afeta ${affected} linha(s) — acima do limite de segurança (${MAX_AFFECTED_ROWS}). Restrinja o WHERE.`
            )
          }
          beforeRows = await tx.$queryRawUnsafe<Record<string, unknown>[]>(
            `SELECT * FROM "${table}" WHERE ${whereClause} LIMIT ${MAX_PREVIEW_ROWS + 1}`
          )
        }

        const affectedCount = Number(await tx.$executeRawUnsafe(singleStatement))

        let afterRows: Record<string, unknown>[] = []
        if (firstWord === 'UPDATE' && whereClause) {
          afterRows = await tx.$queryRawUnsafe<Record<string, unknown>[]>(
            `SELECT * FROM "${table}" WHERE ${whereClause} LIMIT ${MAX_PREVIEW_ROWS + 1}`
          )
        } else if (firstWord === 'INSERT') {
          const idRows = await tx.$queryRawUnsafe<Array<{ id: bigint | number }>>(`SELECT last_insert_rowid() as id`)
          const rowid = idRows[0]?.id
          if (rowid !== undefined) {
            afterRows = await tx.$queryRawUnsafe<Record<string, unknown>[]>(`SELECT * FROM "${table}" WHERE rowid = ${rowid}`)
          }
        }
        // DELETE: afterRows fica vazio de propósito — as linhas deixaram de existir, isso É a confirmação.

        const result: AdminWriteQueryResult = {
          statementType: firstWord,
          table,
          affectedCount,
          beforeRows: sanitize(beforeRows.slice(0, MAX_PREVIEW_ROWS)),
          afterRows: sanitize(afterRows.slice(0, MAX_PREVIEW_ROWS)),
          truncatedPreview: beforeRows.length > MAX_PREVIEW_ROWS || afterRows.length > MAX_PREVIEW_ROWS,
          committed: commit,
        }

        if (!commit) throw new PreviewRollback(result)
        return result
      })
    } catch (e) {
      if (e instanceof PreviewRollback) return e.result
      throw e
    }
  }

  private parseTarget(
    statementType: AdminWriteStatementType,
    sql: string
  ): { table: string; whereClause: string | null } {
    if (statementType === 'UPDATE') {
      const m = sql.match(/^UPDATE\s+["'`[]?(\w+)["'`\]]?\s+SET\s+[\s\S]+?\bWHERE\b([\s\S]+)$/i)
      if (!m) throw new BadRequestException('UPDATE precisa ter uma cláusula WHERE explícita (nunca atualiza a tabela inteira)')
      return { table: m[1], whereClause: m[2].trim() }
    }
    if (statementType === 'DELETE') {
      const m = sql.match(/^DELETE\s+FROM\s+["'`[]?(\w+)["'`\]]?\s+WHERE\s+([\s\S]+)$/i)
      if (!m) throw new BadRequestException('DELETE precisa ter uma cláusula WHERE explícita (nunca apaga a tabela inteira)')
      return { table: m[1], whereClause: m[2].trim() }
    }
    const m = sql.match(/^INSERT\s+(?:OR\s+\w+\s+)?INTO\s+["'`[]?(\w+)["'`\]]?/i)
    if (!m) throw new BadRequestException('Não foi possível identificar a tabela de destino do INSERT')
    return { table: m[1], whereClause: null }
  }
}

/** Mesmo achado do console de leitura: `$queryRawUnsafe` devolve inteiro literal como `BigInt`,
 *  que `JSON.stringify` não serializa sem conversão explícita. */
function sanitize(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map((row) => {
    const out: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(row)) {
      out[key] = typeof value === 'bigint' ? Number(value) : value
    }
    return out
  })
}

export const adminWriteQueryService = new AdminWriteQueryService()
