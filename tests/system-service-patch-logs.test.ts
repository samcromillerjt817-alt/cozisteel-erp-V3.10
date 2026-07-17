import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { systemService } from '@/app/services/system.service'

/**
 * Fase Administração (ADR-021) — visualizador de logs de execução do patch, complemento ao
 * levantamento original (achado 2.2.3: antes disso a saída do script ia pro vazio quando disparado
 * via upload). `STORAGE_PATH` isolado num diretório temporário.
 */
describe('Administração — SystemService.listPatchLogs/readPatchLog (ADR-021)', () => {
  const tmpStorageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cozisteel-patchlogs-test-'))
  const originalStoragePath = process.env.STORAGE_PATH
  const logsDir = path.join(tmpStorageDir, 'patches', 'logs')

  beforeAll(() => {
    process.env.STORAGE_PATH = tmpStorageDir
    fs.mkdirSync(logsDir, { recursive: true })
  })

  afterAll(() => {
    process.env.STORAGE_PATH = originalStoragePath
    fs.rmSync(tmpStorageDir, { recursive: true, force: true })
  })

  it('1. lista vazio quando não há nenhum log', async () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cozisteel-patchlogs-empty-'))
    process.env.STORAGE_PATH = emptyDir
    expect(await systemService.listPatchLogs()).toEqual([])
    process.env.STORAGE_PATH = tmpStorageDir
    fs.rmSync(emptyDir, { recursive: true, force: true })
  })

  it('2. lista logs existentes, mais recente primeiro', async () => {
    fs.writeFileSync(path.join(logsDir, 'patch-20260101-120000.log'), 'conteudo antigo')
    fs.writeFileSync(path.join(logsDir, 'patch-20260201-120000.log'), 'conteudo novo')
    fs.writeFileSync(path.join(logsDir, 'arquivo-nao-relacionado.txt'), 'ignorar')

    const files = await systemService.listPatchLogs()
    expect(files.map((f) => f.filename)).toEqual(['patch-20260201-120000.log', 'patch-20260101-120000.log'])
  })

  it('3. lê o conteúdo de um log existente', async () => {
    const result = await systemService.readPatchLog('patch-20260101-120000.log')
    expect(result.content).toBe('conteudo antigo')
    expect(result.truncated).toBe(false)
  })

  it('4. rejeita nome de arquivo inválido (proteção contra path traversal)', async () => {
    await expect(systemService.readPatchLog('../../etc/passwd')).rejects.toThrow(/inválido/i)
    await expect(systemService.readPatchLog('patch-123.log')).rejects.toThrow(/inválido/i)
  })

  it('5. lança erro de negócio para log inexistente', async () => {
    await expect(systemService.readPatchLog('patch-19990101-000000.log')).rejects.toThrow(/não encontrado/i)
  })

  it('6. trunca e mostra só o final quando o log excede o limite', async () => {
    const bigContent = 'x'.repeat(600_000) + 'FINAL_MARKER'
    fs.writeFileSync(path.join(logsDir, 'patch-20260301-120000.log'), bigContent)

    const result = await systemService.readPatchLog('patch-20260301-120000.log')
    expect(result.truncated).toBe(true)
    expect(result.content.endsWith('FINAL_MARKER')).toBe(true)
    expect(result.content.length).toBeLessThan(bigContent.length)
  })
})
