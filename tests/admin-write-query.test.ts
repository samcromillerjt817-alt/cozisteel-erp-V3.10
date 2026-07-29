import { describe, it, expect, afterEach, afterAll } from 'vitest'
import { db } from '@/lib/db'
import { adminWriteQueryService } from '@/app/services/admin-write-query.service'

/**
 * Console de escrita controlado (ADR-021 addendum) — pedido explícito do usuário por acesso direto
 * ao banco pra correções ("parecido com o APSDU do TOTVS"), depois de confirmar que aceita esse
 * nível de risco em vez de manter só leitura + receitas curadas. Testes cobrem as garantias que
 * diferenciam isso de um `cp`/SQL livre: preview nunca persiste, WHERE obrigatório, tabela de
 * auditoria bloqueada, e só UPDATE/DELETE/INSERT (nunca DROP/ALTER/CREATE/PRAGMA).
 */
describe('AdminWriteQueryService — console de escrita controlado', () => {
  const createdCategoryIds: string[] = []

  afterEach(async () => {
    if (createdCategoryIds.length > 0) {
      await db.category.deleteMany({ where: { id: { in: createdCategoryIds } } })
      createdCategoryIds.length = 0
    }
  })

  afterAll(async () => {
    await db.category.deleteMany({ where: { slug: { startsWith: 'admin-write-test-' } } })
  })

  async function createTestCategory(suffix: string) {
    const cat = await db.category.create({ data: { name: `Categoria Teste ${suffix}`, slug: `admin-write-test-${suffix}-${Date.now()}` } })
    createdCategoryIds.push(cat.id)
    return cat
  }

  it('1. preview (commit=false) roda a instrução de verdade mas NUNCA persiste — banco volta ao estado original', async () => {
    const cat = await createTestCategory('preview-nao-persiste')
    const result = await adminWriteQueryService.run(`UPDATE Category SET name = 'Alterado no preview' WHERE id = '${cat.id}'`, false)

    expect(result.committed).toBe(false)
    expect(result.affectedCount).toBe(1)
    expect(result.beforeRows[0].name).toBe(`Categoria Teste preview-nao-persiste`)
    expect(result.afterRows[0].name).toBe('Alterado no preview') // o que TERIA acontecido

    const stillOriginal = await db.category.findUnique({ where: { id: cat.id } })
    expect(stillOriginal?.name).toBe(`Categoria Teste preview-nao-persiste`) // nada mudou de verdade
  })

  it('2. commit=true aplica de verdade e persiste', async () => {
    const cat = await createTestCategory('commit-persiste')
    const result = await adminWriteQueryService.run(`UPDATE Category SET name = 'Alterado de verdade' WHERE id = '${cat.id}'`, true)

    expect(result.committed).toBe(true)
    expect(result.affectedCount).toBe(1)

    const updated = await db.category.findUnique({ where: { id: cat.id } })
    expect(updated?.name).toBe('Alterado de verdade')
  })

  it('3. UPDATE sem WHERE é rejeitado (nunca atualiza a tabela inteira)', async () => {
    await expect(adminWriteQueryService.run(`UPDATE Category SET active = false`, false)).rejects.toThrow(/WHERE/)
  })

  it('4. DELETE sem WHERE é rejeitado (nunca apaga a tabela inteira)', async () => {
    await expect(adminWriteQueryService.run(`DELETE FROM Category`, false)).rejects.toThrow(/WHERE/)
  })

  it('5. DELETE com WHERE em preview não apaga nada de verdade', async () => {
    const cat = await createTestCategory('delete-preview')
    const result = await adminWriteQueryService.run(`DELETE FROM Category WHERE id = '${cat.id}'`, false)

    expect(result.committed).toBe(false)
    expect(result.afterRows).toEqual([]) // confirma que "teria sido apagado"

    const stillThere = await db.category.findUnique({ where: { id: cat.id } })
    expect(stillThere).not.toBeNull() // mas continua existindo de verdade
  })

  it('6. DELETE com WHERE e commit=true apaga de verdade', async () => {
    const cat = await createTestCategory('delete-commit')
    const result = await adminWriteQueryService.run(`DELETE FROM Category WHERE id = '${cat.id}'`, true)

    expect(result.committed).toBe(true)
    expect(result.affectedCount).toBe(1)

    const gone = await db.category.findUnique({ where: { id: cat.id } })
    expect(gone).toBeNull()
    createdCategoryIds.length = 0 // já foi apagado, não tenta de novo no afterEach
  })

  it('7. INSERT com commit=true cria a linha e devolve o "depois" via last_insert_rowid', async () => {
    const slug = `admin-write-test-insert-${Date.now()}`
    // `updatedAt` é gerenciado pelo Prisma Client (`@updatedAt`), não tem default no próprio banco
    // SQLite — um INSERT bruto por fora do Prisma Client precisa informar explicitamente.
    const result = await adminWriteQueryService.run(
      `INSERT INTO Category (id, name, slug, updatedAt) VALUES ('${'cwtest' + Date.now()}', 'Inserido via console', '${slug}', CURRENT_TIMESTAMP)`,
      true
    )
    expect(result.committed).toBe(true)
    expect(result.statementType).toBe('INSERT')
    expect(result.afterRows[0]?.slug).toBe(slug)

    const created = await db.category.findFirst({ where: { slug } })
    expect(created).not.toBeNull()
    if (created) createdCategoryIds.push(created.id)
  })

  it('8. tabela AuditLog nunca pode ser alterada por este console, mesmo com WHERE válido', async () => {
    await expect(adminWriteQueryService.run(`DELETE FROM AuditLog WHERE id = 'qualquer'`, false)).rejects.toThrow(/AuditLog/)
  })

  it('9. instruções que não sejam UPDATE/DELETE/INSERT são rejeitadas (DROP/ALTER/CREATE/PRAGMA/SELECT)', async () => {
    await expect(adminWriteQueryService.run(`DROP TABLE Category`, false)).rejects.toThrow(/UPDATE, DELETE ou INSERT/)
    await expect(adminWriteQueryService.run(`ALTER TABLE Category ADD COLUMN x TEXT`, false)).rejects.toThrow(/UPDATE, DELETE ou INSERT/)
    await expect(adminWriteQueryService.run(`PRAGMA busy_timeout=10000`, false)).rejects.toThrow(/UPDATE, DELETE ou INSERT/)
    await expect(adminWriteQueryService.run(`SELECT * FROM Category`, false)).rejects.toThrow(/UPDATE, DELETE ou INSERT/)
  })

  it('10. múltiplas instruções empilhadas (via ";") são rejeitadas', async () => {
    const cat = await createTestCategory('multi-stmt')
    await expect(
      adminWriteQueryService.run(`UPDATE Category SET active = false WHERE id = '${cat.id}'; DROP TABLE Category`, false)
    ).rejects.toThrow(/uma instrução/)
  })
})
