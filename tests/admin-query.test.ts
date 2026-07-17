import { describe, it, expect } from 'vitest'
import { adminQueryService } from '@/app/services/admin-query.service'

/**
 * Fase Administração (ADR-021, Subetapa 3) — console de consulta somente-leitura. A validação é a
 * própria linha de defesa desta funcionalidade (postura híbrida decidida no ADR-021: nunca escrita
 * livre) — cada teste aqui cobre um jeito de tentar burlar isso.
 */
describe('Administração — AdminQueryService (ADR-021, Subetapa 3)', () => {
  it('1. executa um SELECT simples e devolve as linhas', async () => {
    const result = await adminQueryService.runReadOnlyQuery('SELECT 1 AS n')
    expect(result.rows).toEqual([{ n: 1 }])
    expect(result.truncated).toBe(false)
  })

  it('2. aceita consultas iniciadas por WITH (CTE)', async () => {
    const result = await adminQueryService.runReadOnlyQuery('WITH t AS (SELECT 42 AS n) SELECT n FROM t')
    expect(result.rows).toEqual([{ n: 42 }])
  })

  it('3. rejeita UPDATE', async () => {
    await expect(adminQueryService.runReadOnlyQuery("UPDATE User SET name = 'x'")).rejects.toThrow(/somente.*select/i)
  })

  it('4. rejeita DELETE', async () => {
    await expect(adminQueryService.runReadOnlyQuery('DELETE FROM User')).rejects.toThrow(/somente.*select/i)
  })

  it('5. rejeita DROP TABLE', async () => {
    await expect(adminQueryService.runReadOnlyQuery('DROP TABLE User')).rejects.toThrow(/somente.*select/i)
  })

  it('6. rejeita múltiplas instruções empilhadas (SELECT válido seguido de DROP)', async () => {
    await expect(adminQueryService.runReadOnlyQuery('SELECT 1; DROP TABLE User;')).rejects.toThrow(/uma instrução/i)
  })

  it('7. aceita um único ";" no final (não é instrução empilhada)', async () => {
    const result = await adminQueryService.runReadOnlyQuery('SELECT 1 AS n;')
    expect(result.rows).toEqual([{ n: 1 }])
  })

  it('8. não confunde ";" dentro de um literal de texto com separador de instrução', async () => {
    const result = await adminQueryService.runReadOnlyQuery("SELECT 'a;b' AS n")
    expect(result.rows).toEqual([{ n: 'a;b' }])
  })

  it('9. rejeita consulta vazia', async () => {
    await expect(adminQueryService.runReadOnlyQuery('   ')).rejects.toThrow(/informe uma consulta/i)
  })

  it('10. trunca em 500 linhas quando o resultado excede o limite', async () => {
    const result = await adminQueryService.runReadOnlyQuery(
      'WITH RECURSIVE cnt(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM cnt WHERE x<600) SELECT x FROM cnt'
    )
    expect(result.rows.length).toBe(500)
    expect(result.truncated).toBe(true)
  })

  it('11. consulta SQL malformada devolve erro de negócio, não lança exceção crua do driver', async () => {
    await expect(adminQueryService.runReadOnlyQuery('SELECT * FROM TabelaQueNaoExiste')).rejects.toThrow(/erro na consulta/i)
  })
})
